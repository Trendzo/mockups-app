/**
 * Register counter: held-bill discard (hidden once the server says it has no such endpoint), the
 * permission-gated menu (sales history / day summary / labels), the strict customer GSTIN check, and the
 * IGST note when a GSTIN is on the bill.
 */
const mockToast = { show: jest.fn() };
jest.mock('../src/components', () => {
  const React = require('react');
  const host = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    AppImage: host('AppImage'),
    AppText: host('AppText'),
    Banner: host('Banner'),
    // Only mount a sheet's content while it is open (like the real one).
    BottomSheet: (props: { visible: boolean; children: React.ReactNode }) =>
      props.visible ? React.createElement('BottomSheet', null, props.children) : null,
    CodeScannerModal: host('CodeScannerModal'),
    DetailRow: host('DetailRow'),
    Divider: host('Divider'),
    EmptyState: host('EmptyState'),
    Field: host('Field'),
    Icon: host('Icon'),
    IconButton: host('IconButton'),
    KeyboardStickyView: host('KeyboardStickyView'),
    ListRow: host('ListRow'),
    Panel: host('Panel'),
    PressableScale: host('PressableScale'),
    PrimaryButton: host('PrimaryButton'),
    QtyStepper: host('QtyStepper'),
    Screen: host('Screen'),
    ScreenHeader: (props: { right?: React.ReactNode }) => React.createElement('ScreenHeader', props, props.right),
    SegmentedControl: host('SegmentedControl'),
    SheetSurface: host('SheetSurface'),
    StatusChip: host('StatusChip'),
    ToggleRow: host('ToggleRow'),
    useToast: () => mockToast,
  };
});

// The real API module (so `isDiscardUnsupported` is the shipped one) over a stubbed HTTP client.
jest.mock('../src/api/client', () => ({
  http: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
  unwrapEnvelope: (p: unknown) => p,
  getJson: jest.fn(),
  postJson: jest.fn(),
}));
jest.mock('../src/api/auth', () => ({ normalizeAuthError: (e: unknown) => e }));
jest.mock('../src/store/auth', () => ({ useAuth: { getState: () => ({ token: null }), subscribe: () => () => {} } }));
jest.mock('../src/utils/haptics', () => ({ Haptics: { select: jest.fn() } }));

const mockDiscard = jest.fn();
const mockRefetch = jest.fn();
const HELD = [{ id: 'sale_h1', customerName: 'Asha', itemCount: 2, note: null, payablePaise: 750_00 }];
const QUOTE = {
  lines: [],
  itemsGrossPaise: 998_00,
  lineDiscountPaise: 0,
  taxableValuePaise: 891_07,
  cgstPaise: 53_47,
  sgstPaise: 53_46,
  taxPaise: 106_93,
  roundOffPaise: 0,
  payablePaise: 998_00,
};
jest.mock('../src/api/posHooks', () => ({
  useBillQuote: () => ({ data: QUOTE, isPlaceholderData: false, isFetching: false, isError: false, refetch: jest.fn() }),
  useCustomerLookup: () => ({ data: undefined, isFetching: false }),
  useDebouncedValue: (v: unknown) => v,
  useDiscardHeldBill: () => ({ mutateAsync: mockDiscard }),
  useHeldBills: () => ({ data: HELD, isLoading: false, isError: false, refetch: mockRefetch }),
  useHoldSale: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useLookupNow: () => jest.fn(),
  useProductLookup: () => ({ data: undefined, isFetching: false, isError: false }),
}));
jest.mock('../src/api/onboardingHooks', () => ({
  useRetailerMe: () => ({ data: { store: { posBillingEnabled: true, status: 'active' } }, isError: false }),
  useChangeRequests: () => ({ data: [], isLoading: false }),
}));
jest.mock('../src/api/storeSettingsHooks', () => ({
  useRequestPosActivation: () => ({ mutate: jest.fn(), isPending: false }),
}));
const mockCan: Record<string, boolean> = {};
jest.mock('../src/utils/usePermission', () => ({
  usePermissions: () => ({ can: (k: string) => mockCan[k] !== false }),
}));

import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { RegisterScreen } from '../src/screens/RegisterScreen';
import { useRegister } from '../src/store/register';

const find = (root: ReactTestInstance, type: string) => root.findAllByType(type as never);
const iconBtn = (root: ReactTestInstance, icon: string) => find(root, 'IconButton').find((b) => b.props.icon === icon);
const trash = (root: ReactTestInstance) =>
  find(root, 'PressableScale').find((p) => p.findAllByType('Icon' as never).some((i) => i.props.name === 'trash-outline'));
const actionLabels = (root: ReactTestInstance) =>
  find(root, 'PressableScale').flatMap((p) => p.findAllByType('AppText' as never).map((t) => String(t.props.children)));
const field = (root: ReactTestInstance, label: string) => find(root, 'Field').find((f) => f.props.label === label);
const button = (root: ReactTestInstance, label: string) => find(root, 'PrimaryButton').find((b) => b.props.label === label);
const flatText = (root: ReactTestInstance) =>
  find(root, 'AppText').map((n) => React.Children.toArray(n.props.children).join('')).join(' | ');

const mounted: TestRenderer.ReactTestRenderer[] = [];
function setup() {
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), popTo: jest.fn() };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<RegisterScreen navigation={navigation as never} route={{} as never} />);
  });
  mounted.push(tree);
  return { tree, navigation };
}

/** Confirm an Alert.alert dialog by pressing the button called `text`. */
function confirmAlert(alertSpy: jest.SpyInstance, text: string) {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as { text: string; onPress?: () => unknown }[];
  return buttons.find((b) => b.text === text)?.onPress?.();
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockToast.show.mockReset();
  mockDiscard.mockReset();
  mockRefetch.mockReset();
  for (const k of Object.keys(mockCan)) delete mockCan[k];
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  act(() => {
    useRegister.getState().reset();
    useRegister.getState().addRow({
      variantId: 'var_1',
      listingId: 'lst_1',
      name: 'Kurta',
      brand: null,
      attributesLabel: 'M',
      sku: null,
      barcode: null,
      hsn: null,
      pricePaise: 499_00,
      compareAtPaise: null,
      availableQty: 5,
      imageUrl: null,
    });
    useRegister.getState().setQty('var_1', 2);
  });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((t) => t.unmount()));
  alertSpy.mockRestore();
});

describe('menu', () => {
  it('offers sales history, day summary and labels to someone who can use them', () => {
    const { tree, navigation } = setup();
    act(() => iconBtn(tree.root, 'ellipsis-horizontal')?.props.onPress());
    const labels = find(tree.root, 'BottomSheet').flatMap((s) => s.findAllByType('AppText' as never).map((t) => String(t.props.children)));
    expect(labels).toEqual(expect.arrayContaining(['Sales history', 'Day summary & cash', 'Product labels']));
    const labelsRow = find(tree.root, 'PressableScale').find((p) =>
      p.findAllByType('AppText' as never).some((t) => t.props.children === 'Product labels'),
    );
    act(() => labelsRow?.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('PosLabels');
  });

  it('hides what the role cannot use', () => {
    mockCan['pos.labels'] = false;
    mockCan['pos.view'] = false;
    const { tree } = setup();
    act(() => iconBtn(tree.root, 'ellipsis-horizontal')?.props.onPress());
    const labels = actionLabels(tree.root);
    expect(labels).not.toContain('Product labels');
    expect(labels).not.toContain('Sales history');
    expect(labels).not.toContain('Day summary & cash');
    expect(labels).toContain('Clear bill');
  });

  it('a role without pos.sell gets a notice instead of the counter', () => {
    mockCan['pos.sell'] = false;
    const { tree } = setup();
    expect(find(tree.root, 'Banner')[0]?.props.title).toBe('No access to the billing counter');
    expect(find(tree.root, 'IconButton')).toHaveLength(0);
  });
});

describe('customer GSTIN', () => {
  function openCustomer() {
    const s = setup();
    const row = find(s.tree.root, 'ListRow').find((r) => r.props.label === 'Add customer (optional)');
    act(() => row?.props.onPress());
    return s;
  }
  const toggleB2b = (root: ReactTestInstance) =>
    act(() => find(root, 'ToggleRow').find((t) => String(t.props.label).startsWith('B2B'))?.props.onChange(true));

  it('B2B needs a GSTIN', () => {
    const { tree } = openCustomer();
    toggleB2b(tree.root);
    act(() => button(tree.root, 'Save')?.props.onPress());
    expect(field(tree.root, 'GSTIN')?.props.error).toMatch(/enter the customer gstin/i);
    expect(useRegister.getState().customer.b2b).toBe(false); // nothing saved
  });

  it('rejects a GSTIN that would flip the tax split (bad state prefix) or is malformed', () => {
    const { tree } = openCustomer();
    toggleB2b(tree.root);
    act(() => field(tree.root, 'GSTIN')?.props.onChangeText('AB1234567890123'));
    act(() => button(tree.root, 'Save')?.props.onPress());
    expect(field(tree.root, 'GSTIN')?.props.error).toMatch(/state code/i);
    act(() => field(tree.root, 'GSTIN')?.props.onChangeText('27AAAAA0000A1Y5'));
    act(() => button(tree.root, 'Save')?.props.onPress());
    expect(field(tree.root, 'GSTIN')?.props.error).toMatch(/doesn.t look right/i);
  });

  it('a valid GSTIN is saved upper-cased on the cart, and the quote shows the IGST note', () => {
    const { tree } = openCustomer();
    toggleB2b(tree.root);
    act(() => field(tree.root, 'GSTIN')?.props.onChangeText(' 27aaaaa0000a1z5'));
    act(() => button(tree.root, 'Save')?.props.onPress());
    const c = useRegister.getState().customer;
    expect(c.b2b).toBe(true);
    expect(c.gstin).toBe('27AAAAA0000A1Z5');
    expect(flatText(tree.root)).toMatch(/If the customer's GSTIN is from another state, the invoice shows it as IGST instead/);
  });

  it('no GSTIN, no note', () => {
    const { tree } = setup();
    expect(flatText(tree.root)).not.toMatch(/IGST instead/);
  });
});

describe('held bills', () => {
  function openHeld() {
    const s = setup();
    act(() => iconBtn(s.tree.root, 'pause-circle-outline')?.props.onPress());
    return s;
  }

  it('discards a held bill after confirmation', async () => {
    mockDiscard.mockResolvedValue({});
    const { tree } = openHeld();
    act(() => trash(tree.root)?.props.onPress());
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('Discard this held bill?');
    expect(mockDiscard).not.toHaveBeenCalled(); // not until confirmed
    await act(async () => {
      await confirmAlert(alertSpy, 'Discard');
    });
    expect(mockDiscard).toHaveBeenCalledWith('sale_h1');
    expect(mockToast.show).toHaveBeenCalledWith('Held bill discarded', 'success');
  });

  it('"Keep it" does nothing', () => {
    const { tree } = openHeld();
    act(() => trash(tree.root)?.props.onPress());
    confirmAlert(alertSpy, 'Keep it');
    expect(mockDiscard).not.toHaveBeenCalled();
  });

  it('discarding the bill that is open on the counter empties the counter', async () => {
    mockDiscard.mockResolvedValue({});
    act(() => useRegister.setState({ holdSaleId: 'sale_h1' }));
    const { tree } = openHeld();
    act(() => trash(tree.root)?.props.onPress());
    await act(async () => {
      await confirmAlert(alertSpy, 'Discard');
    });
    expect(useRegister.getState().holdSaleId).toBeNull();
    expect(useRegister.getState().lines).toHaveLength(0);
  });

  it('a bill that is already gone is a notice, not an error', async () => {
    mockDiscard.mockRejectedValue({ status: 404, code: 'not_found', message: 'Sale not found' });
    const { tree } = openHeld();
    act(() => trash(tree.root)?.props.onPress());
    await act(async () => {
      await confirmAlert(alertSpy, 'Discard');
    });
    expect(mockToast.show).toHaveBeenCalledWith('That bill is already gone', 'info');
    expect(mockRefetch).toHaveBeenCalled();
    expect(trash(tree.root)).toBeDefined(); // the action stays: the server does support it
  });

  it('other failures are shown as an error', async () => {
    mockDiscard.mockRejectedValue({ status: 500, message: 'Boom' });
    const { tree } = openHeld();
    act(() => trash(tree.root)?.props.onPress());
    await act(async () => {
      await confirmAlert(alertSpy, 'Discard');
    });
    expect(mockToast.show).toHaveBeenCalledWith('Boom', 'error');
  });

  // Keep this LAST: it flips the screen's session-wide "server can't discard" flag.
  it('hides the Discard action once the server answers 404 "Route … not found" (older backend)', async () => {
    mockDiscard.mockRejectedValue({ status: 404, code: 'not_found', message: 'Route DELETE:/api/v1/retailer/pos/sales/sale_h1 not found' });
    const { tree } = openHeld();
    act(() => trash(tree.root)?.props.onPress());
    await act(async () => {
      await confirmAlert(alertSpy, 'Discard');
    });
    expect(mockToast.show).not.toHaveBeenCalled();
    expect(trash(tree.root)).toBeUndefined();
    // …and stays hidden the next time the counter is opened this session
    const again = openHeld();
    expect(trash(again.tree.root)).toBeUndefined();
  });
});
