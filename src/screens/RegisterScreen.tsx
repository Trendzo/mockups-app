import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppImage,
  AppText,
  Banner,
  BottomSheet,
  CodeScannerModal,
  DetailRow,
  Divider,
  EmptyState,
  Field,
  Icon,
  IconButton,
  KeyboardStickyView,
  ListRow,
  Panel,
  PressableScale,
  PrimaryButton,
  QtyStepper,
  Screen,
  ScreenHeader,
  SegmentedControl,
  SheetSurface,
  StatusChip,
  ToggleRow,
  useToast,
} from '../components';
import type { SegmentOption } from '../components';
import { ScreenProps } from '../navigation/types';
import { useChangeRequests, useRetailerMe } from '../api/onboardingHooks';
import { useRequestPosActivation } from '../api/storeSettingsHooks';
import { findByCode, getSale, isDiscardUnsupported } from '../api/pos';
import {
  useBillQuote,
  useCustomerLookup,
  useDebouncedValue,
  useDiscardHeldBill,
  useHeldBills,
  useHoldSale,
  useLookupNow,
  useProductLookup,
} from '../api/posHooks';
import { errorMessage } from '../api/request';
import {
  CartLine,
  DiscountMode,
  RegisterCustomer,
  billDiscountPaise,
  billLines,
  billSignature,
  customerInput,
  lineDiscountPaise,
  lineGrossPaise,
  lineNetPaise,
  quoteRequest,
  refreshCartStock,
  useRegister,
} from '../store/register';
import { PosCustomer, PosHeldRow, PosLookupResponse, PosLookupRow, PosQuote } from '../types/pos';
import { ChangeRequest, Store } from '../types/onboarding';
import { formatPaise } from '../utils/money';
import { plural } from '../utils/format';
import { Haptics } from '../utils/haptics';
import { gstinError, normalizeGstin } from '../utils/gstin';
import { usePermissions } from '../utils/usePermission';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

type Nav = ScreenProps<'Register'>['navigation'];
type Sheet = null | 'held' | 'menu' | 'line' | 'bill' | 'customer';

/**
 * Set once the server answers that it has no "discard a held bill" endpoint (an older backend), so the
 * Discard action stays hidden for the rest of the session instead of failing on every tap.
 */
let heldDiscardUnsupported = false;

const EMPTY_CUSTOMER: RegisterCustomer = { phone: '', name: '', gstin: '', b2b: false };
const DISCOUNT_MODES: SegmentOption<DiscountMode>[] = [
  { value: 'amount', label: '₹ off' },
  { value: 'percent', label: '% off' },
];
const ACTIVATION_COPY =
  'Counter billing lets you bill walk-in customers in the app — scan or search items, add discounts and customer GST details, take cash, card, UPI or split payments, hold bills and resend receipts.';

/** "+ ₹0.40" / "− ₹0.40" (round-off can go either way). */
const signedPaise = (p: number) => `${p < 0 ? '−' : '+'} ${formatPaise(Math.abs(p))}`;

/** '' → 0; "12" / "12.5" → number; anything else → null. */
function parseDiscount(text: string): number | null {
  const t = text.trim();
  if (!t) return 0;
  return /^\d+(\.\d{0,2})?$/.test(t) ? Number(t) : null;
}

/** The returning customer for a 10-digit number: an exact phone match, else the first hit. */
function pickCustomer(rows: PosCustomer[] | undefined, digits: string): PosCustomer | null {
  if (!rows?.length) return null;
  return rows.find((r) => (r.phone ?? '').replace(/\D/g, '').endsWith(digits)) ?? rows[0];
}

const isStoreInactive = (store: Store | null) =>
  !!store && store.status !== 'active' && store.status !== 'paused';

/**
 * Billing counter: the bill being rung up. Gated on the store's
 * `posBillingEnabled` flag — until Trendzo switches it on, this screen
 * explains the feature and lets the retailer request activation.
 */
export function RegisterScreen({ navigation }: ScreenProps<'Register'>) {
  const meQ = useRetailerMe();
  const store = meQ.data?.store ?? null;
  const { can } = usePermissions();

  if (!meQ.data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader overline="Billing counter" title="New bill" onBack={() => navigation.goBack()} />
        {meQ.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load your store"
            message={errorMessage(meQ.error)}
            actionLabel="Retry"
            onAction={() => meQ.refetch()}
            style={styles.gapTop}
          />
        ) : (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        )}
      </Screen>
    );
  }

  if (store?.posBillingEnabled !== true) {
    return <ActivationView store={store} onBack={() => navigation.goBack()} />;
  }

  // Ringing up a sale needs pos.sell (every default role has it; a custom role might not).
  if (!can('pos.sell')) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader overline="Billing counter" title="New bill" onBack={() => navigation.goBack()} />
        <Banner
          tone="warning"
          title="No access to the billing counter"
          message="Your role can't create bills. Ask the owner to enable it."
          style={styles.gapTop}
        />
      </Screen>
    );
  }

  return <Counter navigation={navigation} inactive={isStoreInactive(store)} />;
}

function InactiveBanner() {
  return (
    <Banner
      tone="warning"
      title="Billing unavailable"
      message="Counter billing is unavailable while your store isn't active."
    />
  );
}

/** Feature pitch + "Request activation" (a change request Trendzo reviews). */
function ActivationView({ store, onBack }: { store: Store | null; onBack: () => void }) {
  const toast = useToast();
  const crQ = useChangeRequests();
  const request = useRequestPosActivation();

  const requests = (crQ.data ?? []).filter((c) => c.field === 'pos_billing_activation');
  const pending = requests.some((c) => c.status === 'pending' || c.status === 'under_review');
  const stamp = (c: ChangeRequest) => c.submittedAt ?? c.createdAt ?? '';
  const latest = [...requests].sort((a, b) => stamp(b).localeCompare(stamp(a)))[0];
  const declined = !pending && latest?.status === 'rejected' ? latest : null;

  const ask = () =>
    request.mutate(undefined, {
      onSuccess: () => toast.show('Activation requested — Trendzo will review it', 'success'),
      onError: (e) => toast.show(errorMessage(e, "Couldn't send the request"), 'error'),
    });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gateContent}>
        <ScreenHeader overline="Billing counter" title="Counter billing" onBack={onBack} />
        {isStoreInactive(store) ? <InactiveBanner /> : null}
        <View style={styles.activation}>
          <View style={styles.activationIcon}>
            <Icon name="receipt-outline" size={22} color={colors.accentInk} />
          </View>
          <AppText variant="cardTitle" color={colors.ink} style={styles.activationTitle}>
            Bill walk-in customers
          </AppText>
          <AppText variant="body" color={colors.meta}>
            {ACTIVATION_COPY}
          </AppText>
          {declined ? (
            <AppText variant="meta" color={colors.danger}>
              Your last request wasn't approved{declined.decisionNote ? `: ${declined.decisionNote}` : '.'}
            </AppText>
          ) : null}
          <PrimaryButton
            label={pending ? 'Activation request pending' : 'Request activation'}
            tone="accent"
            loading={request.isPending}
            disabled={pending || crQ.isLoading}
            onPress={ask}
          />
          {pending ? (
            <AppText variant="meta" color={colors.meta} style={styles.center}>
              Billing switches on here as soon as Trendzo approves it.
            </AppText>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Counter({ navigation, inactive }: { navigation: Nav; inactive: boolean }) {
  const toast = useToast();
  const lines = useRegister((s) => s.lines);
  const customer = useRegister((s) => s.customer);
  const billMode = useRegister((s) => s.billDiscountMode);
  const billValue = useRegister((s) => s.billDiscountValue);
  const holdSaleId = useRegister((s) => s.holdSaleId);
  const setQty = useRegister((s) => s.setQty);
  const removeLine = useRegister((s) => s.remove);
  const setLineDiscount = useRegister((s) => s.setLineDiscount);
  const setBillDiscount = useRegister((s) => s.setBillDiscount);

  const quoteBody = useMemo(() => quoteRequest(lines, billMode, billValue), [lines, billMode, billValue]);
  const quoteQ = useBillQuote(quoteBody, true);
  // A disabled (empty-cart) query can still hand back the last cart's placeholder totals.
  const quote = lines.length ? quoteQ.data : undefined;
  const quoteCurrent = !!quote && !quoteQ.isPlaceholderData;
  const payable = quote?.payablePaise ?? 0;
  const billDisc = billDiscountPaise(lines, billMode, billValue);
  const netBeforeBill = lines.reduce((s, l) => s + lineNetPaise(l), 0);

  const { can } = usePermissions();
  const heldQ = useHeldBills();
  const holdQ = useHoldSale();
  const discardQ = useDiscardHeldBill();
  const [discardable, setDiscardable] = useState(!heldDiscardUnsupported);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query);
  const lookupQ = useProductLookup(debounced);
  const lookupNow = useLookupNow();
  const [busy, setBusy] = useState(false); // Enter / scan lookup in flight
  const busyRef = useRef(false); // same, readable before the re-render (double Enter)
  const [scanOpen, setScanOpen] = useState(false);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [discountLine, setDiscountLine] = useState<CartLine | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const closeSheet = () => setSheet(null);

  const term = query.trim();
  const searching = term.length >= 2;

  const add = (row: PosLookupRow) => {
    useRegister.getState().addRow(row);
    Haptics.select();
    toast.show(`Added · ${row.name}`, 'info');
  };

  const pick = (row: PosLookupRow) => {
    add(row);
    setQuery('');
  };

  /** Runs one lookup at a time; a second Enter/scan while one is in flight is dropped. */
  const runLookup = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Enter: an exact barcode/SKU hit or a single match goes straight in.
  const submitSearch = () => {
    if (term.length < 2) return;
    runLookup(async () => {
      try {
        const res = await lookupNow(term);
        const results = res?.results ?? [];
        const row = res?.exact ?? (results.length === 1 ? results[0] : null);
        if (row) pick(row);
        else if (!results.length) toast.show(`No product for "${term}"`, 'error');
        else Keyboard.dismiss(); // several matches — pick from the list
      } catch (e) {
        toast.show(errorMessage(e, "Couldn't search"), 'error');
      }
    });
  };

  const onCode = (code: string) => {
    setScanOpen(false);
    runLookup(async () => {
      try {
        const row = await findByCode(code.trim());
        if (row) add(row);
        else toast.show('No product for that code', 'error');
      } catch (e) {
        toast.show(errorMessage(e, 'No product for that code'), 'error');
      }
    });
  };

  const hold = async () => {
    const s = useRegister.getState();
    if (!s.lines.length || holdQ.isPending) return;
    if (s.holdSaleId) {
      // A resumed bill is still held on the server. Holding it again would park
      // a duplicate (held bills can't be deleted), so it goes back as it was.
      const putBack = () => {
        useRegister.getState().reset();
        toast.show('Bill put back on hold', 'info');
      };
      if (billSignature(s) === s.resumedSignature) {
        putBack();
        return;
      }
      Alert.alert(
        'Put this bill back on hold?',
        "It goes back to held bills as it was when you resumed it. Changes made since won't be kept.",
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Put back', style: 'destructive', onPress: putBack },
        ],
      );
      return;
    }
    try {
      await holdQ.mutateAsync({
        idempotencyKey: s.billKey,
        customer: customerInput(s.customer),
        pricingMode: 'tax_inclusive',
        billDiscountPaise: billDiscountPaise(s.lines, s.billDiscountMode, s.billDiscountValue),
        lines: billLines(s.lines),
      });
      useRegister.getState().reset();
      toast.show('Bill held', 'success');
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't hold the bill"), 'error');
    }
  };

  const resume = (row: PosHeldRow) => {
    const run = async () => {
      setResumingId(row.id);
      try {
        const sale = await getSale(row.id);
        if (sale.status !== 'held') {
          toast.show('This bill has already been completed', 'info');
          heldQ.refetch();
          return;
        }
        useRegister.getState().loadHeld(sale);
        setSheet(null);
        toast.show('Bill resumed', 'success');
        // Held lines don't carry stock or photos — fetch them in the background.
        refreshCartStock();
      } catch (e) {
        toast.show(errorMessage(e, "Couldn't open this bill"), 'error');
      } finally {
        setResumingId(null);
      }
    };
    if (!useRegister.getState().lines.length) {
      run();
      return;
    }
    Alert.alert('Replace the current bill?', 'Its items will be cleared. Hold it first if you need it later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: run },
    ]);
  };

  /** Throw a parked bill away for good (it never reached a customer, so there's nothing to refund). */
  const discard = (row: PosHeldRow) =>
    Alert.alert(
      'Discard this held bill?',
      `${row.customerName || 'Walk-in'} · ${formatPaise(row.payablePaise)}. This can't be undone.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            setDiscardingId(row.id);
            try {
              await discardQ.mutateAsync(row.id);
              // Discarding the bill that's open on the counter empties the counter too.
              if (useRegister.getState().holdSaleId === row.id) useRegister.getState().reset();
              toast.show('Held bill discarded', 'success');
            } catch (e) {
              if (isDiscardUnsupported(e)) {
                heldDiscardUnsupported = true;
                setDiscardable(false);
              } else if ((e as { status?: number })?.status === 404) {
                toast.show('That bill is already gone', 'info');
                heldQ.refetch();
              } else {
                toast.show(errorMessage(e, "Couldn't discard the bill"), 'error');
              }
            } finally {
              setDiscardingId(null);
            }
          },
        },
      ],
    );

  const clearBill = () =>
    Alert.alert(
      'Clear this bill?',
      holdSaleId
        ? 'It stays in held bills, as it was when you resumed it.'
        : 'All items, discounts and customer details will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setSheet(null);
            useRegister.getState().reset();
          },
        },
      ],
    );

  const goTo = (name: 'PosSales' | 'RegisterDay' | 'PosLabels') => {
    setSheet(null);
    navigation.navigate(name);
  };

  const openHeld = () => {
    setSheet('held');
    heldQ.refetch();
  };

  const openLineDiscount = (line: CartLine) => {
    setDiscountLine(line);
    setSheet('line');
  };

  const customerSummary = [
    customer.name.trim(),
    customer.phone,
    customer.b2b ? customer.gstin.trim().toUpperCase() : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        overline="Billing counter"
        title={holdSaleId ? 'Resumed bill' : 'New bill'}
        onBack={() => navigation.goBack()}
        right={
          <>
            <IconButton icon="pause-circle-outline" badge={heldQ.data?.length} onPress={openHeld} />
            <IconButton icon="ellipsis-horizontal" onPress={() => setSheet('menu')} />
          </>
        }
      />

      {inactive ? (
        <View style={styles.gapTop}>
          <InactiveBanner />
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            <Icon name="search" size={18} color={colors.meta} />
          )}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search product, SKU or barcode"
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            // Keep focus after Enter so a USB/Bluetooth scanner can keep firing.
            submitBehavior="submit"
            onSubmitEditing={submitSearch}
            style={styles.searchInput}
          />
          {query ? (
            <PressableScale onPress={() => setQuery('')} haptic={false} hitSlop={10}>
              <Icon name="close-circle" size={18} color={colors.inkMuted} />
            </PressableScale>
          ) : null}
        </View>
        <IconButton icon="barcode-outline" tone="ink" disabled={busy} onPress={() => setScanOpen(true)} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {searching ? (
          <SearchResults
            term={term}
            settled={debounced.trim() === term}
            data={lookupQ.data}
            fetching={lookupQ.isFetching}
            error={lookupQ.isError ? lookupQ.error : null}
            onPick={pick}
          />
        ) : null}

        {lines.length === 0 ? (
          searching ? null : (
            <EmptyState
              icon="barcode-outline"
              title="Start a bill"
              message="Scan a barcode or search to add items."
            />
          )
        ) : (
          <>
            {lines.map((l) => (
              <CartLineCard
                key={l.variantId}
                line={l}
                onQty={(n) => setQty(l.variantId, n)}
                onDiscount={() => openLineDiscount(l)}
              />
            ))}

            <ListRow
              icon="person-outline"
              label={customerSummary || 'Add customer (optional)'}
              hint={
                customerSummary
                  ? customer.b2b
                    ? 'B2B — GSTIN on the invoice'
                    : 'On the receipt'
                  : 'Walk-in. Add a phone number to send the receipt.'
              }
              onPress={() => setSheet('customer')}
            />
            <ListRow
              icon="pricetag-outline"
              label="Bill discount"
              hint={
                billDisc > 0
                  ? `− ${formatPaise(billDisc)}${billMode === 'percent' ? ` (${billValue}%)` : ''}`
                  : 'Off the whole bill'
              }
              onPress={() => setSheet('bill')}
            />

            <TotalsPanel
              quote={quote}
              fetching={quoteQ.isFetching}
              error={quoteQ.isError ? quoteQ.error : null}
              billDiscPaise={billDisc}
              hasGstin={customer.b2b && !!customer.gstin.trim()}
              onRetry={() => quoteQ.refetch()}
            />
          </>
        )}
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
        <View style={styles.footerRow}>
          <PrimaryButton
            label="Hold"
            tone="surface"
            fullWidth={false}
            style={styles.holdBtn}
            loading={holdQ.isPending}
            disabled={!lines.length || inactive}
            onPress={hold}
          />
          <PrimaryButton
            label={quote ? `Charge ${formatPaise(payable)}` : 'Charge'}
            tone="accent"
            style={styles.flex}
            disabled={!quoteCurrent || payable <= 0 || inactive}
            onPress={() => navigation.navigate('RegisterPayment')}
          />
        </View>
      </KeyboardStickyView>

      {/* Held bills */}
      <BottomSheet visible={sheet === 'held'} onClose={closeSheet}>
        <SheetSurface style={styles.sheet}>
          <SheetTitle title="Held bills" message="Held bills stay here until they're completed." />
          {heldQ.isLoading ? (
            <ActivityIndicator color={colors.ink} style={styles.sheetLoader} />
          ) : heldQ.isError && !heldQ.data ? (
            <Banner
              tone="danger"
              title="Couldn't load held bills"
              message={errorMessage(heldQ.error)}
              actionLabel="Retry"
              onAction={() => heldQ.refetch()}
            />
          ) : !heldQ.data?.length ? (
            <EmptyState icon="pause-circle-outline" title="No held bills" style={styles.sheetEmpty} />
          ) : (
            <ScrollView style={styles.heldList} contentContainerStyle={styles.heldListContent}>
              {heldQ.data.map((row) => (
                <HeldRow
                  key={row.id}
                  row={row}
                  current={row.id === holdSaleId}
                  resuming={resumingId === row.id}
                  disabled={!!resumingId || !!discardingId}
                  discarding={discardingId === row.id}
                  onResume={() => resume(row)}
                  onDiscard={discardable ? () => discard(row) : undefined}
                />
              ))}
            </ScrollView>
          )}
          <PrimaryButton label="Close" tone="surface" onPress={closeSheet} />
        </SheetSurface>
      </BottomSheet>

      {/* More */}
      <BottomSheet visible={sheet === 'menu'} onClose={closeSheet}>
        <SheetSurface style={styles.sheet}>
          <SheetTitle title="Billing counter" />
          {can('pos.view') ? (
            <SheetAction icon="receipt-outline" label="Sales history" onPress={() => goTo('PosSales')} />
          ) : null}
          {can('pos.view') ? (
            <SheetAction icon="calculator-outline" label="Day summary & cash" onPress={() => goTo('RegisterDay')} />
          ) : null}
          {can('pos.labels') ? (
            <SheetAction icon="pricetag-outline" label="Product labels" onPress={() => goTo('PosLabels')} />
          ) : null}
          {lines.length || holdSaleId ? (
            <SheetAction icon="trash-outline" label="Clear bill" danger onPress={clearBill} />
          ) : null}
          <PrimaryButton label="Close" tone="surface" onPress={closeSheet} />
        </SheetSurface>
      </BottomSheet>

      {/* Item discount */}
      <BottomSheet visible={sheet === 'line'} onClose={closeSheet} avoidKeyboard>
        {discountLine ? (
          <DiscountSheet
            title="Item discount"
            subtitle={[discountLine.name, discountLine.attributesLabel].filter(Boolean).join(' · ')}
            initialMode={discountLine.discountMode}
            initialValue={discountLine.discountValue}
            basePaise={lineGrossPaise(discountLine)}
            preview={(mode, value) =>
              lineDiscountPaise({ ...discountLine, discountMode: mode, discountValue: value })
            }
            onApply={(mode, value) => {
              setLineDiscount(discountLine.variantId, mode, value);
              closeSheet();
            }}
            onRemoveItem={() => {
              removeLine(discountLine.variantId);
              closeSheet();
            }}
            onClose={closeSheet}
          />
        ) : null}
      </BottomSheet>

      {/* Bill discount */}
      <BottomSheet visible={sheet === 'bill'} onClose={closeSheet} avoidKeyboard>
        <DiscountSheet
          title="Bill discount"
          subtitle="Taken off the whole bill, after item discounts."
          initialMode={billMode}
          initialValue={billValue}
          basePaise={netBeforeBill}
          preview={(mode, value) => billDiscountPaise(lines, mode, value)}
          onApply={(mode, value) => {
            setBillDiscount(mode, value);
            closeSheet();
          }}
          onClose={closeSheet}
        />
      </BottomSheet>

      {/* Customer */}
      <BottomSheet visible={sheet === 'customer'} onClose={closeSheet} avoidKeyboard>
        <CustomerSheet onClose={closeSheet} />
      </BottomSheet>

      <CodeScannerModal visible={scanOpen} onClose={() => setScanOpen(false)} onCode={onCode} />
    </Screen>
  );
}

// ---- Search ----

function SearchResults({
  term,
  settled,
  data,
  fetching,
  error,
  onPick,
}: {
  term: string;
  /** The debounced query has caught up with what's typed. */
  settled: boolean;
  data?: PosLookupResponse;
  fetching: boolean;
  error: unknown;
  onPick: (row: PosLookupRow) => void;
}) {
  const rows = useMemo(() => {
    const list = data?.results ?? [];
    const exact = data?.exact;
    return exact && !list.some((r) => r.variantId === exact.variantId) ? [exact, ...list] : list;
  }, [data]);
  const loading = !settled || fetching;

  return (
    <Panel>
      <View style={[styles.rowBetween, styles.resultsHead]}>
        <AppText variant="sectionLabel" color={colors.meta}>
          Results
        </AppText>
        {loading ? <ActivityIndicator size="small" color={colors.ink} /> : null}
      </View>
      {rows.length ? (
        rows.map((row, i) => (
          <React.Fragment key={row.variantId}>
            {i > 0 ? <Divider /> : null}
            <ResultRow row={row} onPress={() => onPick(row)} />
          </React.Fragment>
        ))
      ) : loading ? (
        <AppText variant="meta" color={colors.meta}>
          Searching…
        </AppText>
      ) : error ? (
        <AppText variant="meta" color={colors.danger}>
          {errorMessage(error, "Couldn't search")}
        </AppText>
      ) : (
        <AppText variant="meta" color={colors.meta}>
          No product matches “{term}”.
        </AppText>
      )}
    </Panel>
  );
}

function ResultRow({ row, onPress }: { row: PosLookupRow; onPress: () => void }) {
  const out = row.availableQty <= 0;
  const sub = [row.attributesLabel, row.sku, out ? null : `${row.availableQty} in stock`]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.resultRow}>
      <Thumb uri={row.imageUrl} />
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {row.name}
        </AppText>
        {sub ? (
          <AppText variant="meta" color={colors.meta} numberOfLines={1}>
            {sub}
          </AppText>
        ) : null}
        {out ? (
          <AppText variant="meta" color={colors.danger}>
            Out of stock
          </AppText>
        ) : null}
      </View>
      <AppText variant="bodyMedium" color={colors.ink}>
        {formatPaise(row.pricePaise)}
      </AppText>
    </PressableScale>
  );
}

function Thumb({ uri }: { uri?: string | null }) {
  return uri ? (
    <AppImage uri={uri} radius={radii.sm} containerStyle={styles.thumb} />
  ) : (
    <View style={[styles.thumb, styles.thumbEmpty]}>
      <Icon name="shirt-outline" size={18} color={colors.inkMuted} />
    </View>
  );
}

// ---- Bill ----

function CartLineCard({
  line,
  onQty,
  onDiscount,
}: {
  line: CartLine;
  onQty: (qty: number) => void;
  onDiscount: () => void;
}) {
  const gross = lineGrossPaise(line);
  const off = lineDiscountPaise(line);
  const sub = [line.attributesLabel, line.sku].filter(Boolean).join(' · ');
  // A hint only — the server has the final say on stock when the sale completes.
  const stockNote =
    line.availableQty <= 0
      ? 'Out of stock'
      : line.qty > line.availableQty
        ? `Only ${line.availableQty} left`
        : null;

  return (
    <View style={styles.lineCard}>
      <View style={styles.lineTop}>
        <Thumb uri={line.imageUrl} />
        <View style={styles.flex}>
          <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
            {line.name}
          </AppText>
          {sub ? (
            <AppText variant="meta" color={colors.meta} numberOfLines={1}>
              {sub}
            </AppText>
          ) : null}
          <AppText variant="meta" color={colors.meta}>
            {formatPaise(line.unitPricePaise)} each
          </AppText>
        </View>
        <View style={styles.alignEnd}>
          <AppText variant="bodyMedium" color={colors.ink}>
            {formatPaise(gross - off)}
          </AppText>
          {off > 0 ? (
            <AppText variant="meta" color={colors.meta} style={styles.strike}>
              {formatPaise(gross)}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={styles.lineBottom}>
        <QtyStepper compact value={line.qty} min={0} onChange={onQty} />
        <View style={styles.flex}>
          {stockNote ? (
            <AppText variant="meta" color={colors.danger} numberOfLines={1}>
              {stockNote}
            </AppText>
          ) : null}
        </View>
        <PressableScale onPress={onDiscount} haptic={false} hitSlop={10} style={styles.discountLink}>
          <Icon name="pricetag-outline" size={14} color={off > 0 ? colors.success : colors.ink} />
          <AppText variant="meta" color={off > 0 ? colors.success : colors.ink}>
            {off > 0 ? `−${formatPaise(off)} off` : 'Discount'}
          </AppText>
        </PressableScale>
      </View>
    </View>
  );
}

function TotalsPanel({
  quote,
  fetching,
  error,
  billDiscPaise,
  hasGstin,
  onRetry,
}: {
  quote?: PosQuote;
  fetching: boolean;
  error: unknown;
  billDiscPaise: number;
  /** A customer GSTIN is on the bill. */
  hasGstin: boolean;
  onRetry: () => void;
}) {
  if (!quote) {
    return error ? (
      <Banner
        tone="danger"
        title="Couldn't price this bill"
        message={errorMessage(error)}
        actionLabel="Retry"
        onAction={onRetry}
      />
    ) : (
      <Panel>
        <ActivityIndicator color={colors.ink} />
      </Panel>
    );
  }
  return (
    <Panel>
      <View style={styles.rowBetween}>
        <AppText variant="sectionLabel" color={colors.meta}>
          Bill
        </AppText>
        {fetching ? (
          <AppText variant="meta" color={colors.meta}>
            Updating…
          </AppText>
        ) : null}
      </View>
      <DetailRow label="Items" value={formatPaise(quote.itemsGrossPaise)} />
      <DetailRow
        label="Item discounts"
        value={quote.lineDiscountPaise > 0 ? `− ${formatPaise(quote.lineDiscountPaise)}` : formatPaise(0)}
        tone={quote.lineDiscountPaise > 0 ? 'negative' : 'muted'}
      />
      {billDiscPaise > 0 ? (
        <DetailRow label="Bill discount" value={`− ${formatPaise(billDiscPaise)}`} tone="negative" />
      ) : null}
      <DetailRow label="Taxable value" value={formatPaise(quote.taxableValuePaise)} />
      <DetailRow label="CGST" value={formatPaise(quote.cgstPaise)} />
      <DetailRow label="SGST" value={formatPaise(quote.sgstPaise)} />
      {quote.igstPaise ? <DetailRow label="IGST" value={formatPaise(quote.igstPaise)} /> : null}
      {quote.roundOffPaise ? <DetailRow label="Round off" value={signedPaise(quote.roundOffPaise)} /> : null}
      <Divider />
      <DetailRow label="Payable" value={formatPaise(quote.payablePaise)} strong />
      <AppText variant="meta" color={colors.meta}>
        Prices include GST.
      </AppText>
      {hasGstin ? (
        // The quote can't see the customer, so it always splits GST as CGST + SGST. The final invoice
        // uses IGST when the GSTIN is from another state — same tax, same total.
        <AppText variant="meta" color={colors.meta}>
          This shows CGST + SGST. If the customer's GSTIN is from another state, the invoice shows it as
          IGST instead — the total stays the same.
        </AppText>
      ) : null}
    </Panel>
  );
}

// ---- Sheets ----

function SheetTitle({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.sheetHead}>
      <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="meta" color={colors.meta}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

function SheetAction({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.sheetAction}>
      <Icon name={icon} size={20} color={danger ? colors.danger : colors.ink} />
      <AppText variant="bodyMedium" color={danger ? colors.danger : colors.ink} style={styles.flex}>
        {label}
      </AppText>
      {danger ? null : <Icon name="chevron-forward" size={18} color={colors.meta} />}
    </PressableScale>
  );
}

function HeldRow({
  row,
  current,
  resuming,
  disabled,
  discarding,
  onResume,
  onDiscard,
}: {
  row: PosHeldRow;
  current: boolean;
  resuming: boolean;
  disabled: boolean;
  discarding: boolean;
  onResume: () => void;
  /** Absent when the server can't discard held bills (older backend). */
  onDiscard?: () => void;
}) {
  return (
    <View style={styles.heldRow}>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {row.customerName || 'Walk-in'}
        </AppText>
        <AppText variant="meta" color={colors.meta} numberOfLines={1}>
          {[plural(row.itemCount, 'item'), row.note].filter(Boolean).join(' · ')}
        </AppText>
      </View>
      <AppText variant="bodyMedium" color={colors.ink}>
        {formatPaise(row.payablePaise)}
      </AppText>
      {current ? (
        <StatusChip label="Open now" tone="success" style={styles.chipCenter} />
      ) : (
        <PrimaryButton
          label="Resume"
          tone="ink"
          fullWidth={false}
          loading={resuming}
          disabled={disabled}
          onPress={onResume}
          style={styles.resumeBtn}
        />
      )}
      {onDiscard ? (
        discarding ? (
          <ActivityIndicator size="small" color={colors.danger} style={styles.discardBtn} />
        ) : (
          <PressableScale
            onPress={onDiscard}
            disabled={disabled}
            hitSlop={8}
            toScale={0.9}
            style={styles.discardBtn}
          >
            <Icon name="trash-outline" size={18} color={colors.danger} />
          </PressableScale>
        )
      ) : null}
    </View>
  );
}

/** ₹ / % discount for one item or the whole bill. Mounted fresh each time the sheet opens. */
function DiscountSheet({
  title,
  subtitle,
  initialMode,
  initialValue,
  basePaise,
  preview,
  onApply,
  onRemoveItem,
  onClose,
}: {
  title: string;
  subtitle?: string;
  initialMode: DiscountMode;
  initialValue: number;
  /** What the discount applies to (line gross, or the bill after item discounts). */
  basePaise: number;
  /** Paise off for a mode + value — the store's own maths. */
  preview: (mode: DiscountMode, value: number) => number;
  onApply: (mode: DiscountMode, value: number) => void;
  onRemoveItem?: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<DiscountMode>(initialMode);
  const [text, setText] = useState(initialValue > 0 ? String(initialValue) : '');
  const [error, setError] = useState<string | null>(null);

  const value = parseDiscount(text);
  const off = value != null ? preview(mode, value) : 0;

  const changeMode = (next: DiscountMode) => {
    if (next === mode) return;
    setMode(next);
    setText(''); // a ₹ figure means nothing as a % (and vice versa)
    setError(null);
  };

  const apply = () => {
    if (value == null) {
      setError('Enter a number, like 50 or 12.5');
      return;
    }
    if (mode === 'percent' && value > 100) {
      setError("Can't be more than 100%");
      return;
    }
    if (mode === 'amount' && Math.round(value * 100) > basePaise) {
      setError(`Can't be more than ${formatPaise(basePaise)}`);
      return;
    }
    onApply(mode, value);
  };

  return (
    <SheetSurface style={styles.sheet}>
      <SheetTitle title={title} message={subtitle} />
      <SegmentedControl compact options={DISCOUNT_MODES} value={mode} onChange={changeMode} />
      <Field
        label={mode === 'amount' ? 'Discount amount' : 'Discount percent'}
        prefix={mode === 'amount' ? '₹' : undefined}
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(null);
        }}
        placeholder="0"
        keyboardType="decimal-pad"
        returnKeyType="done"
        onSubmitEditing={apply}
        error={error}
        boxed
      />
      <AppText variant="meta" color={off > 0 ? colors.success : colors.meta}>
        {off > 0
          ? `− ${formatPaise(off)} · ${formatPaise(basePaise - off)} after discount`
          : `On ${formatPaise(basePaise)}`}
      </AppText>
      <View style={styles.sheetButtons}>
        <PrimaryButton
          label={initialValue > 0 ? 'Clear' : 'Cancel'}
          tone="surface"
          style={styles.flex}
          onPress={initialValue > 0 ? () => onApply(mode, 0) : onClose}
        />
        <PrimaryButton label="Apply" tone="accent" style={styles.flex} onPress={apply} />
      </View>
      {onRemoveItem ? (
        <SheetAction icon="trash-outline" label="Remove item" danger onPress={onRemoveItem} />
      ) : null}
    </SheetSurface>
  );
}

/** Optional customer: phone (returning customers fill in), name, GSTIN for a B2B invoice. */
function CustomerSheet({ onClose }: { onClose: () => void }) {
  const savedCustomer = useRegister((s) => s.customer);
  const [draft, setDraft] = useState<RegisterCustomer>(savedCustomer);
  const [errors, setErrors] = useState<{ phone?: string; gstin?: string }>({});
  const digits = draft.phone.replace(/\D/g, '');
  const lookupQ = useCustomerLookup(digits);
  const match = digits.length === 10 ? pickCustomer(lookupQ.data, digits) : null;
  const filledFor = useRef<string | null>(null);

  // A returning customer fills in whatever is still empty — once per number.
  useEffect(() => {
    if (!match || filledFor.current === digits) return;
    filledFor.current = digits;
    setDraft((d) => ({
      ...d,
      name: d.name.trim() ? d.name : match.name ?? '',
      gstin: d.gstin.trim() ? d.gstin : (match.gstin ?? '').toUpperCase(),
      b2b: d.b2b || !!match.gstin,
    }));
  }, [match, digits]);

  const patch = (p: Partial<RegisterCustomer>) => {
    setDraft((d) => ({ ...d, ...p }));
    setErrors({});
  };

  const save = () => {
    const next: RegisterCustomer = {
      phone: digits,
      name: draft.name.trim(),
      gstin: normalizeGstin(draft.gstin),
      b2b: draft.b2b,
    };
    const errs: { phone?: string; gstin?: string } = {};
    if (next.phone && next.phone.length !== 10) errs.phone = 'Enter a 10-digit mobile number';
    const gstinProblem = next.b2b ? gstinError(next.gstin) : null;
    if (gstinProblem) errs.gstin = gstinProblem;
    if (errs.phone || errs.gstin) {
      setErrors(errs);
      return;
    }
    useRegister.getState().setCustomer(next);
    onClose();
  };

  const clear = () => {
    useRegister.getState().setCustomer(EMPTY_CUSTOMER);
    onClose();
  };

  const saved = customerInput(savedCustomer);
  const hasSaved = !!(saved.phone || saved.name || saved.gstin);

  return (
    <SheetSurface style={styles.sheet}>
      <SheetTitle title="Customer" message="Optional — leave empty for a walk-in." />
      {/* Fields scroll; title and buttons stay put when the keyboard is up. */}
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.fieldBlock}>
        <Field
          label="Phone"
          prefix="+91"
          value={draft.phone}
          onChangeText={(t) => patch({ phone: t.replace(/\D/g, '').slice(0, 10) })}
          placeholder="10-digit mobile"
          keyboardType="number-pad"
          maxLength={10}
          error={errors.phone}
          boxed
        />
        {/* Reserved line, so the sheet doesn't jump as the lookup comes and goes. */}
        <View style={styles.lookupLine}>
          {digits.length === 10 && lookupQ.isFetching && !match ? (
            <AppText variant="meta" color={colors.meta}>
              Looking up…
            </AppText>
          ) : match ? (
            <View style={styles.inline}>
              <Icon name="checkmark-circle" size={14} color={colors.success} />
              <AppText variant="meta" color={colors.success}>
                Returning customer
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
      <Field
        label="Name"
        value={draft.name}
        onChangeText={(t) => patch({ name: t })}
        placeholder="Customer name"
        autoCapitalize="words"
        boxed
      />
      <ToggleRow
        label="B2B — add GSTIN to invoice"
        hint="For business customers claiming GST credit"
        value={draft.b2b}
        onChange={(b2b) => patch({ b2b })}
      />
      {draft.b2b ? (
        <Field
          label="GSTIN"
          value={draft.gstin}
          onChangeText={(t) => patch({ gstin: t.toUpperCase() })}
          placeholder="22AAAAA0000A1Z5"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={15}
          error={errors.gstin}
          boxed
        />
      ) : null}
      </ScrollView>
      <View style={styles.sheetButtons}>
        <PrimaryButton
          label={hasSaved ? 'Clear' : 'Cancel'}
          tone="surface"
          style={styles.flex}
          onPress={hasSaved ? clear : onClose}
        />
        <PrimaryButton label="Save" tone="accent" style={styles.flex} onPress={save} />
      </View>
    </SheetSurface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  loader: { marginTop: spacing.xl },
  gapTop: { marginTop: spacing.md },
  alignEnd: { alignItems: 'flex-end' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sheetScroll: { flexShrink: 1 },
  sheetScrollContent: { gap: spacing.md },
  lookupLine: { minHeight: 16, justifyContent: 'center' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  strike: { textDecorationLine: 'line-through' },

  // Activation gate
  gateContent: { paddingBottom: spacing.xl, gap: spacing.md },
  activation: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  activationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activationTitle: { fontSize: 20, lineHeight: 26 },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  searchBox: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 4,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: 15,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  thumb: { width: 44, height: 44, borderRadius: radii.sm },
  thumbEmpty: { backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },

  // Bill
  content: { paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  lineCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  lineBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  discountLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs },

  footer: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.hairline },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  // Fixed minimum widths: the spinner that replaces the label while loading
  // would otherwise shrink the button and shift its neighbours.
  holdBtn: { paddingHorizontal: spacing.lg, minWidth: 104 },
  resultsHead: { minHeight: 20 },
  chipCenter: { alignSelf: 'center' },

  // Sheets
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHead: { gap: spacing.xs },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  sheetButtons: { flexDirection: 'row', gap: spacing.sm },
  sheetLoader: { marginVertical: spacing.lg },
  sheetEmpty: { paddingVertical: spacing.md },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  fieldBlock: { gap: spacing.xs },
  heldList: { maxHeight: 360 },
  heldListContent: { gap: spacing.sm },
  heldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  resumeBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minWidth: 96 },
  discardBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
