import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  AppImage,
  AppText,
  BottomSheet,
  Field,
  Icon,
  PressableScale,
  PrimaryButton,
  SegmentedControl,
  SheetSurface,
  ToggleRow,
  useToast,
} from '../../components';
import { uploadToFolder } from '../../api/storeSettings';
import { errorMessage } from '../../api/request';
import { DoorDecision, OrderDetail, OrderItem } from '../../types/orders';
import { prepareUpload } from '../../utils/image';
import { colors, radii, spacing } from '../../theme/theme';

/** Pick one photo from the library, compress it and upload it to `folder`. */
async function pickAndUpload(folder: string): Promise<string | null> {
  const res = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 1,
    quality: 0.9,
    maxWidth: 2400,
    maxHeight: 2400,
  });
  if (res.errorCode) throw new Error(res.errorMessage ?? 'Could not open your photos');
  const uri = res.assets?.[0]?.uri;
  if (!uri) return null;
  return uploadToFolder(await prepareUpload(uri), folder);
}

/** Thumbnails + "Add photo" tile; uploads as soon as a photo is picked. */
function PhotoPicker({
  folder,
  max,
  photos,
  onChange,
}: {
  folder: string;
  max: number;
  photos: string[];
  onChange: (next: string[]) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const url = await pickAndUpload(folder);
      if (url) onChange([...photos, url]);
    } catch (e) {
      toast.show(errorMessage(e, 'Upload failed'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.photoRow}>
      {photos.map((url) => (
        <View key={url} style={styles.photo}>
          <AppImage uri={url} radius={radii.sm} containerStyle={styles.photoFill} />
          <PressableScale
            onPress={() => onChange(photos.filter((p) => p !== url))}
            style={styles.photoRemove}
            toScale={0.9}
          >
            <Icon name="close" size={14} color={colors.accentInk} />
          </PressableScale>
        </View>
      ))}
      {photos.length < max ? (
        <PressableScale onPress={add} disabled={busy} style={[styles.photo, styles.photoAdd]} toScale={0.95}>
          {busy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Icon name="camera-outline" size={22} color={colors.meta} />
          )}
        </PressableScale>
      ) : null}
    </View>
  );
}

function SheetTitle({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.titleBlock}>
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

/** Free-text reason (cancel request, failed delivery, declined return). */
export function ReasonSheet({
  visible,
  title,
  message,
  label = 'Reason',
  placeholder,
  submitLabel,
  danger,
  busy,
  photosFolder,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  submitLabel: string;
  danger?: boolean;
  busy?: boolean;
  /** When set, up to 5 optional evidence photos are uploaded here. */
  photosFolder?: string;
  onSubmit: (reason: string, photos: string[]) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setReason('');
      setPhotos([]);
      setError(null);
    }
  }, [visible]);

  const submit = () => {
    const r = reason.trim();
    if (r.length < 3) {
      setError('Add a short reason (at least 3 characters)');
      return;
    }
    onSubmit(r, photos);
  };

  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} avoidKeyboard dismissable={!busy}>
      <SheetSurface style={styles.sheet}>
        <SheetTitle title={title} message={message} />
        <Field
          label={label}
          value={reason}
          onChangeText={(t) => {
            setReason(t);
            setError(null);
          }}
          placeholder={placeholder}
          error={error}
          multiline
          maxLength={500}
          style={styles.multiline}
          boxed
        />
        {photosFolder ? (
          <View style={styles.block}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Photos (optional)
            </AppText>
            <PhotoPicker folder={photosFolder} max={5} photos={photos} onChange={setPhotos} />
          </View>
        ) : null}
        <PrimaryButton label={submitLabel} tone={danger ? 'danger' : 'accent'} loading={busy} onPress={submit} />
        <PrimaryButton label="Cancel" tone="surface" disabled={busy} onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

/**
 * Hand a packed order to delivery. With a Trendzo agent assigned the store
 * enters the agent's handoff code; otherwise (or by choice) it records the
 * external courier's name and phone.
 */
export function HandoverSheet({
  visible,
  order,
  busy,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  order: OrderDetail;
  busy?: boolean;
  onSubmit: (body: { handoffCode: string } | { agentName: string; agentPhone: string }) => void;
  onClose: () => void;
}) {
  const hasAgent = !!order.assignedAgentId;
  const [external, setExternal] = useState(!hasAgent);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (visible) {
      setExternal(!hasAgent);
      setCode('');
      setName('');
      setPhone('');
      setErrors({});
    }
  }, [visible, hasAgent]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!external) {
      const c = code.trim().toUpperCase();
      if (c.length < 4) e.code = 'Enter the 4–16 character code from the agent';
      setErrors(e);
      if (!Object.keys(e).length) onSubmit({ handoffCode: c });
      return;
    }
    if (name.trim().length < 2) e.name = "Enter the courier's name";
    if (!/^\d{10}$/.test(phone.trim())) e.phone = 'Enter a 10-digit mobile number';
    setErrors(e);
    if (!Object.keys(e).length) onSubmit({ agentName: name.trim(), agentPhone: phone.trim() });
  };

  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} avoidKeyboard dismissable={!busy}>
      <SheetSurface style={styles.sheet}>
        <SheetTitle
          title="Hand to delivery"
          message={
            external
              ? 'Record who is taking the parcel.'
              : 'Ask the Trendzo delivery agent for their handoff code.'
          }
        />
        {hasAgent ? (
          <ToggleRow
            label="External courier instead"
            hint="Use your own courier for this order"
            value={external}
            onChange={setExternal}
          />
        ) : null}
        {external ? (
          <>
            <Field
              label="Courier name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ramesh (Dunzo)"
              error={errors.name}
              boxed
            />
            <Field
              label="Courier phone"
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              maxLength={10}
              error={errors.phone}
              boxed
            />
          </>
        ) : (
          <Field
            label="Handoff code"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="e.g. 7KQ2"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={16}
            error={errors.code}
            boxed
          />
        )}
        <PrimaryButton label="Confirm handover" tone="accent" loading={busy} onPress={submit} />
        <PrimaryButton label="Cancel" tone="surface" disabled={busy} onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

/** Store pickup: the customer reads out their pickup code at the counter. */
export function PickupHandoverSheet({
  visible,
  busy,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  busy?: boolean;
  onSubmit: (pickupCode: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setCode('');
      setError(null);
    }
  }, [visible]);
  const submit = () => {
    const c = code.trim();
    if (!c) {
      setError("Enter the customer's pickup code");
      return;
    }
    onSubmit(c);
  };
  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} avoidKeyboard dismissable={!busy}>
      <SheetSurface style={styles.sheet}>
        <SheetTitle
          title="Hand to customer"
          message="Ask the customer for the pickup code shown in their Trendzo app, then hand over the order."
        />
        <Field
          label="Pickup code"
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          error={error}
          boxed
        />
        <PrimaryButton label="Confirm pickup" tone="accent" loading={busy} onPress={submit} />
        <PrimaryButton label="Cancel" tone="surface" disabled={busy} onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

const DOOR_OPTIONS: { value: DoorDecision; label: string }[] = [
  { value: 'kept', label: 'Kept' },
  { value: 'returned', label: 'Returned' },
  { value: 'refused', label: 'Refused' },
];

interface DoorChoice {
  decision: DoorDecision;
  reason: string;
  photos: string[];
}

/**
 * Try & buy: record what the customer kept at the door. Anything kept →
 * delivered; nothing kept → the order comes back to the store. A refused
 * item needs a reason and a photo.
 */
export function DoorVisitSheet({
  visible,
  order,
  busy,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  order: OrderDetail;
  busy?: boolean;
  onSubmit: (
    items: { orderItemId: string; decision: DoorDecision; reason?: string; photos?: string[] }[],
  ) => void;
  onClose: () => void;
}) {
  const maxH = useWindowDimensions().height * 0.55;
  const [choices, setChoices] = useState<Record<string, DoorChoice>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      const init: Record<string, DoorChoice> = {};
      for (const it of order.items) init[it.id] = { decision: 'kept', reason: '', photos: [] };
      setChoices(init);
      setError(null);
    }
  }, [visible, order.items]);

  const set = (id: string, patch: Partial<DoorChoice>) =>
    setChoices((c) => ({ ...c, [id]: { ...c[id], ...patch } }));

  const anyKept = Object.values(choices).some((c) => c.decision === 'kept');

  const submit = () => {
    for (const it of order.items) {
      const c = choices[it.id];
      if (c?.decision === 'refused' && (c.reason.trim().length < 3 || !c.photos.length)) {
        setError(`"${it.listingNameSnap}": a refused item needs a reason and a photo`);
        return;
      }
    }
    onSubmit(
      order.items.map((it) => {
        const c = choices[it.id];
        return c.decision === 'refused'
          ? { orderItemId: it.id, decision: c.decision, reason: c.reason.trim(), photos: c.photos }
          : { orderItemId: it.id, decision: c.decision };
      }),
    );
  };

  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} avoidKeyboard dismissable={!busy}>
      <SheetSurface style={styles.sheet}>
        <SheetTitle
          title="Close door visit"
          message={
            anyKept
              ? 'Kept items are delivered; anything returned comes back to your store.'
              : 'Nothing kept — the order comes back to your store.'
          }
        />
        <ScrollView style={{ maxHeight: maxH }} keyboardShouldPersistTaps="handled">
          <View style={styles.block}>
            {order.items.map((it) => {
              const c = choices[it.id];
              if (!c) return null;
              return (
                <View key={it.id} style={styles.doorItem}>
                  <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                    {it.listingNameSnap}
                  </AppText>
                  <AppText variant="meta" color={colors.meta}>
                    {[it.attributesLabelSnap, `Qty ${it.qty}`].filter(Boolean).join(' · ')}
                  </AppText>
                  <SegmentedControl<DoorDecision>
                    compact
                    options={DOOR_OPTIONS}
                    value={c.decision}
                    onChange={(d) => set(it.id, { decision: d })}
                  />
                  {c.decision === 'refused' ? (
                    <>
                      <Field
                        label="Why was it refused?"
                        value={c.reason}
                        onChangeText={(t) => set(it.id, { reason: t })}
                        placeholder="e.g. Damaged on arrival"
                        boxed
                      />
                      <PhotoPicker
                        folder="door-visits"
                        max={3}
                        photos={c.photos}
                        onChange={(p) => set(it.id, { photos: p })}
                      />
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
        {error ? (
          <AppText variant="meta" color={colors.danger}>
            {error}
          </AppText>
        ) : null}
        <PrimaryButton label="Close visit" tone="accent" loading={busy} onPress={submit} />
        <PrimaryButton label="Cancel" tone="surface" disabled={busy} onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

/** A delivered order brought back to the store counter (within 7 days). */
export function CounterReturnSheet({
  visible,
  order,
  busy,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  order: OrderDetail;
  busy?: boolean;
  onSubmit: (items: { orderItemId: string; reasonText?: string }[]) => void;
  onClose: () => void;
}) {
  const maxH = useWindowDimensions().height * 0.45;
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visible) {
      setPicked([]);
      setReason('');
    }
  }, [visible]);
  const toggle = (it: OrderItem) =>
    setPicked((p) => (p.includes(it.id) ? p.filter((x) => x !== it.id) : [...p, it.id]));

  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} avoidKeyboard dismissable={!busy}>
      <SheetSurface style={styles.sheet}>
        <SheetTitle title="Return at counter" message="Pick the items the customer brought back." />
        <ScrollView style={{ maxHeight: maxH }}>
          <View style={styles.block}>
            {order.items.map((it) => {
              const on = picked.includes(it.id);
              return (
                <PressableScale
                  key={it.id}
                  onPress={() => toggle(it)}
                  toScale={0.98}
                  haptic={false}
                  style={[styles.pickRow, on && styles.pickRowOn]}
                >
                  <Icon
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={on ? colors.ink : colors.inkMuted}
                  />
                  <View style={styles.flex}>
                    <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                      {it.listingNameSnap}
                    </AppText>
                    <AppText variant="meta" color={colors.meta}>
                      {[it.attributesLabelSnap, `Qty ${it.qty}`].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </ScrollView>
        <Field
          label="Reason (optional)"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Size too small"
          boxed
        />
        <PrimaryButton
          label={picked.length ? `Return ${picked.length} item${picked.length === 1 ? '' : 's'}` : 'Select items'}
          tone="accent"
          disabled={!picked.length}
          loading={busy}
          onPress={() =>
            onSubmit(
              picked.map((id) => ({
                orderItemId: id,
                ...(reason.trim() ? { reasonText: reason.trim() } : {}),
              })),
            )
          }
        />
        <PrimaryButton label="Cancel" tone="surface" disabled={busy} onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  titleBlock: { gap: spacing.xs },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  block: { gap: spacing.sm },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  flex: { flex: 1 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 64, height: 64, borderRadius: radii.sm, overflow: 'hidden' },
  photoFill: { width: 64, height: 64 },
  photoAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorItem: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.canvas,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.canvas,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pickRowOn: { borderColor: colors.ink },
});
