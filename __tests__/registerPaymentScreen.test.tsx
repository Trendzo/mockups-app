/**
 * Register payment: the optional card / UPI reference travels with the tender, and the customer GSTIN
 * from the cart reaches the sale body (upper-cased, only on a B2B bill).
 */
const mockToast = { show: jest.fn() };
jest.mock('../src/components', () => {
  const React = require('react');
  const host = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    AppText: host('AppText'),
    Banner: host('Banner'),
    Chip: host('Chip'),
    Divider: host('Divider'),
    Field: host('Field'),
    Icon: host('Icon'),
    KeyboardStickyView: host('KeyboardStickyView'),
    Panel: host('Panel'),
    PressableScale: host('PressableScale'),
    PrimaryButton: host('PrimaryButton'),
    Screen: host('Screen'),
    ScreenHeader: host('ScreenHeader'),
    SegmentedControl: host('SegmentedControl'),
    useToast: () => mockToast,
  };
});
const mockCreateSale = jest.fn();
jest.mock('../src/api/posHooks', () => ({
  useBillQuote: () => ({
    data: { payablePaise: 998_00 },
    isPlaceholderData: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useCreateSale: () => ({ mutateAsync: mockCreateSale }),
}));
jest.mock('../src/api/pos', () => ({ resolveScan: jest.fn() }));
jest.mock('../src/api/request', () => ({
  idempotencyKey: (p: string) => `${p}-test`,
  errorCode: () => undefined,
  errorMessage: (e: { message?: string } | null, fallback = 'err') => e?.message || fallback,
}));
jest.mock('../src/store/auth', () => ({ useAuth: { subscribe: () => () => {} } }));
jest.mock('../src/utils/haptics', () => ({ Haptics: { select: jest.fn() } }));

import React from 'react';
import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { RegisterPaymentScreen } from '../src/screens/RegisterPaymentScreen';
import { useRegister } from '../src/store/register';

const find = (root: ReactTestInstance, type: string) => root.findAllByType(type as never);
const field = (root: ReactTestInstance, label: string) => find(root, 'Field').find((f) => f.props.label === label);
const button = (root: ReactTestInstance, starts: string) =>
  find(root, 'PrimaryButton').find((b) => String(b.props.label).startsWith(starts));

const mounted: TestRenderer.ReactTestRenderer[] = [];
function setup() {
  const navigation = { goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => {}) };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<RegisterPaymentScreen navigation={navigation as never} route={{} as never} />);
  });
  mounted.push(tree);
  return { tree, navigation };
}

beforeEach(() => {
  mockCreateSale.mockReset().mockResolvedValue({
    saleId: 'sale_1',
    invoiceNumber: 'INV-1',
    payablePaise: 998_00,
    changePaise: 0,
    alreadyExisted: false,
  });
  mockToast.show.mockReset();
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
});

describe('card / UPI reference', () => {
  it('cash has no reference box; card and UPI do (≤ 120 characters)', () => {
    const { tree } = setup();
    expect(field(tree.root, 'Reference (optional)')).toBeUndefined();
    act(() => find(tree.root, 'SegmentedControl')[0]?.props.onChange('card'));
    const ref = field(tree.root, 'Reference (optional)');
    expect(ref?.props.maxLength).toBe(120);
    expect(ref?.props.placeholder).toBe('Card slip / approval code');
    act(() => find(tree.root, 'SegmentedControl')[0]?.props.onChange('upi'));
    expect(field(tree.root, 'Reference (optional)')?.props.placeholder).toBe('UPI transaction id');
  });

  it('is sent as `reference` on that tender (trimmed); a tender without one carries none', async () => {
    const { tree, navigation } = setup();
    // ₹300 cash first, then the rest (₹698) by UPI with a transaction id
    act(() => field(tree.root, 'Cash received')?.props.onChangeText('300'));
    act(() => button(tree.root, 'Add cash')?.props.onPress());
    act(() => find(tree.root, 'SegmentedControl')[0]?.props.onChange('upi'));
    act(() => field(tree.root, 'Reference (optional)')?.props.onChangeText('  UTR 4242  '));
    act(() => button(tree.root, 'Add')?.props.onPress());
    expect(button(tree.root, 'Complete sale')?.props.disabled).toBe(false);

    await act(async () => {
      await button(tree.root, 'Complete sale')?.props.onPress();
    });
    const body = mockCreateSale.mock.calls[0][0];
    expect(body.tenders).toHaveLength(2);
    expect(body.tenders[0]).toEqual({ method: 'cash', amountPaise: 300_00, tenderedPaise: 300_00 });
    expect(body.tenders[1]).toEqual({ method: 'upi', amountPaise: 698_00, tenderedPaise: 698_00, reference: 'UTR 4242' });
    expect(navigation.replace).toHaveBeenCalledWith('PosSaleDetail', expect.objectContaining({ id: 'sale_1' }));
  });

  it('the reference box clears after the tender is added', () => {
    const { tree } = setup();
    act(() => find(tree.root, 'SegmentedControl')[0]?.props.onChange('card'));
    act(() => field(tree.root, 'Amount')?.props.onChangeText('100'));
    act(() => field(tree.root, 'Reference (optional)')?.props.onChangeText('AUTH1'));
    act(() => button(tree.root, 'Add')?.props.onPress());
    expect(field(tree.root, 'Reference (optional)')?.props.value).toBe('');
    // …and it's listed under the tender that was added
    const shown = find(tree.root, 'AppText').map((n) => String(React.Children.toArray(n.props.children).join('')));
    expect(shown).toContain('Ref AUTH1');
  });
});

describe('customer GSTIN on the sale', () => {
  it('a B2B bill sends the GSTIN upper-cased in `customer`', async () => {
    act(() => useRegister.getState().setCustomer({ name: 'Ravi', phone: '9876543210', gstin: '27aaaaa0000a1z5', b2b: true }));
    const { tree } = setup();
    act(() => field(tree.root, 'Cash received')?.props.onChangeText('1000'));
    act(() => button(tree.root, 'Add cash')?.props.onPress());
    await act(async () => {
      await button(tree.root, 'Complete sale')?.props.onPress();
    });
    expect(mockCreateSale.mock.calls[0][0].customer).toEqual({
      phone: '9876543210',
      name: 'Ravi',
      gstin: '27AAAAA0000A1Z5',
    });
  });

  it('without B2B the GSTIN stays off the bill', async () => {
    act(() => useRegister.getState().setCustomer({ name: 'Ravi', phone: '', gstin: '27aaaaa0000a1z5', b2b: false }));
    const { tree } = setup();
    act(() => field(tree.root, 'Cash received')?.props.onChangeText('1000'));
    act(() => button(tree.root, 'Add cash')?.props.onPress());
    await act(async () => {
      await button(tree.root, 'Complete sale')?.props.onPress();
    });
    expect(mockCreateSale.mock.calls[0][0].customer).toEqual({ name: 'Ravi' });
  });
});
