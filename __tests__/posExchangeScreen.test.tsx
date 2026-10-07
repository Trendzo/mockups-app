/**
 * The Exchange screen end to end (hooks / component library stubbed): the difference is settled on ONE
 * side only — the customer pays, or the store refunds, or an even swap moves no money — and the request
 * body proves it. Retries reuse the same idempotency key.
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
    DetailRow: host('DetailRow'),
    Divider: host('Divider'),
    Field: host('Field'),
    Icon: host('Icon'),
    KeyboardStickyView: host('KeyboardStickyView'),
    Panel: host('Panel'),
    PressableScale: host('PressableScale'),
    PrimaryButton: host('PrimaryButton'),
    QtyStepper: host('QtyStepper'),
    Screen: host('Screen'),
    ScreenHeader: host('ScreenHeader'),
    SegmentedControl: host('SegmentedControl'),
    useToast: () => mockToast,
  };
});
// Camera / lookup hooks are irrelevant here: a stand-in that lets the test "pick" a product.
jest.mock('../src/screens/pos/ProductSearch', () => {
  const React = require('react');
  return { ProductSearch: (props: Record<string, unknown>) => React.createElement('ProductSearch', props) };
});

const mockSale = {
  id: 'sale_1',
  status: 'completed',
  originalSaleId: null,
  completedAt: '2026-10-07T10:00:00.000Z',
  invoice: { invoiceNumber: 'INV-1' },
  customerNameSnap: null,
  customerPhoneSnap: null,
  payments: [{ id: 'p1', method: 'card', direction: 'collect', amountPaise: 1000_00 }],
  items: [
    {
      id: 'psi_a',
      variantId: 'v_a',
      listingId: 'l_a',
      listingNameSnap: 'Kurta',
      brandSnap: null,
      attributesLabelSnap: 'M',
      skuSnap: null,
      qty: 2,
      netLinePaise: 1000_00,
    },
  ],
};
let mockQuote: { payablePaise: number } | undefined;
const mockMutateAsync = jest.fn();
jest.mock('../src/api/posHooks', () => ({
  usePosSale: () => ({ data: mockSale, isError: false, refetch: jest.fn() }),
  useExchangeSale: () => ({ mutateAsync: mockMutateAsync }),
  useBillQuote: () => ({
    data: mockQuote,
    isPlaceholderData: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
let mockKeySeq = 0;
jest.mock('../src/api/request', () => ({
  idempotencyKey: (p: string) => `${p}-k${++mockKeySeq}`,
  errorCode: (e: { code?: string } | null) => e?.code,
  errorMessage: (e: { message?: string } | null, fallback = 'err') => e?.message || fallback,
}));
jest.mock('../src/utils/usePermission', () => ({ usePermissions: () => ({ can: () => true }) }));

import React from 'react';
import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { PosExchangeScreen } from '../src/screens/PosExchangeScreen';
import { usePosReturns } from '../src/store/posReturns';
import { PosLookupRow } from '../src/types/pos';

const find = (root: ReactTestInstance, type: string) => root.findAllByType(type as never);
const submitButton = (root: ReactTestInstance) =>
  find(root, 'PrimaryButton').find((b) => /^(Collect|Refund|Complete exchange)/.test(String(b.props.label)));
const field = (root: ReactTestInstance, label: string) => find(root, 'Field').find((f) => f.props.label === label);

const jacket: PosLookupRow = {
  variantId: 'v_new',
  listingId: 'l_new',
  name: 'Jacket',
  brand: null,
  attributesLabel: 'L',
  sku: null,
  barcode: null,
  hsn: null,
  pricePaise: 800_00,
  compareAtPaise: null,
  availableQty: 4,
  imageUrl: null,
};

const mounted: TestRenderer.ReactTestRenderer[] = [];
function setup() {
  const navigation = {
    goBack: jest.fn(),
    replace: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <PosExchangeScreen navigation={navigation as never} route={{ params: { saleId: 'sale_1' } } as never} />,
    );
  });
  mounted.push(tree);
  return { tree, navigation };
}

/** Return 1 Kurta (credit ₹500), take the Jacket, set the quote, give a reason. */
function arrange(tree: TestRenderer.ReactTestRenderer, quotePayable: number) {
  mockQuote = { payablePaise: quotePayable };
  act(() => find(tree.root, 'QtyStepper')[0]?.props.onChange(1));
  act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(jacket));
  act(() => field(tree.root, 'Reason')?.props.onChangeText('Size swap'));
}

afterEach(() => {
  act(() => mounted.splice(0).forEach((t) => t.unmount()));
});
beforeEach(() => {
  mockMutateAsync.mockReset();
  mockToast.show.mockReset();
  mockQuote = undefined;
  usePosReturns.setState({ returned: {} });
});

describe('PosExchangeScreen', () => {
  it('cannot be completed with nothing returned, nothing taken, or no reason', () => {
    const { tree } = setup();
    expect(submitButton(tree.root)?.props.disabled).toBe(true);
    mockQuote = { payablePaise: 800_00 };
    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(jacket));
    expect(submitButton(tree.root)?.props.disabled).toBe(true); // still nothing returned
    act(() => find(tree.root, 'QtyStepper')[0]?.props.onChange(1));
    expect(submitButton(tree.root)?.props.disabled).toBe(true); // no reason yet
    act(() => field(tree.root, 'Reason')?.props.onChangeText('Size swap'));
    expect(submitButton(tree.root)?.props.disabled).toBe(false);
  });

  it('customer owes the difference → collects it, and ONLY the collect side is sent', async () => {
    mockMutateAsync.mockResolvedValue({ exchangeSaleId: 'sale_x', netPaise: 300_00 });
    const { tree, navigation } = setup();
    arrange(tree, 800_00); // ₹800 new − ₹500 credit
    expect(submitButton(tree.root)?.props.label).toBe('Collect ₹300');
    expect(find(tree.root, 'SegmentedControl').length).toBeGreaterThan(0); // payment editor is shown
    await act(async () => {
      await submitButton(tree.root)?.props.onPress();
    });
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body.collectTenders).toEqual([{ method: 'cash', amountPaise: 300_00 }]);
    expect(body).not.toHaveProperty('refundTenders');
    expect(body.returnLines).toEqual([{ originalSaleItemId: 'psi_a', qty: 1, restock: true }]);
    expect(body.newLines).toEqual([{ variantId: 'v_new', qty: 1 }]);
    expect(body.idempotencyKey).toMatch(/^posexc-sale_1-k\d+$/);
    expect(navigation.replace).toHaveBeenCalledWith('PosSaleDetail', { id: 'sale_x' });
    expect(usePosReturns.getState().returned).toEqual({ psi_a: 1 });
  });

  it('store owes the difference → refunds it (the way the customer paid), and ONLY the refund side is sent', async () => {
    mockMutateAsync.mockResolvedValue({ exchangeSaleId: 'sale_x', netPaise: -150_00 });
    const { tree } = setup();
    arrange(tree, 350_00); // ₹350 new − ₹500 credit
    expect(submitButton(tree.root)?.props.label).toBe('Refund ₹150');
    await act(async () => {
      await submitButton(tree.root)?.props.onPress();
    });
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body.refundTenders).toEqual([{ method: 'card', amountPaise: 150_00 }]);
    expect(body).not.toHaveProperty('collectTenders');
  });

  it('an even swap moves no money: no tenders at all, and no payment editor', async () => {
    mockMutateAsync.mockResolvedValue({ exchangeSaleId: 'sale_x', netPaise: 0 });
    const { tree } = setup();
    arrange(tree, 500_00);
    expect(submitButton(tree.root)?.props.label).toBe('Complete exchange');
    expect(find(tree.root, 'SegmentedControl')).toHaveLength(0); // no tender editor
    await act(async () => {
      await submitButton(tree.root)?.props.onPress();
    });
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body).not.toHaveProperty('collectTenders');
    expect(body).not.toHaveProperty('refundTenders');
  });

  it('a retry after a failure reuses the same idempotency key', async () => {
    mockMutateAsync
      .mockRejectedValueOnce({ message: 'Network down' })
      .mockResolvedValueOnce({ exchangeSaleId: 'sale_x', netPaise: 300_00 });
    const { tree, navigation } = setup();
    arrange(tree, 800_00);
    await act(async () => {
      await submitButton(tree.root)?.props.onPress();
    });
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith('Network down', 'error');
    await act(async () => {
      await submitButton(tree.root)?.props.onPress();
    });
    expect(mockMutateAsync.mock.calls[1][0].idempotencyKey).toBe(mockMutateAsync.mock.calls[0][0].idempotencyKey);
    expect(navigation.replace).toHaveBeenCalledWith('PosSaleDetail', { id: 'sale_x' });
  });

  it('while the new items are still being priced it cannot be completed', () => {
    const { tree } = setup();
    arrange(tree, 800_00);
    mockQuote = undefined; // quote not back (e.g. changing quantity)
    act(() => find(tree.root, 'QtyStepper')[1]?.props.onChange(2));
    expect(submitButton(tree.root)?.props.disabled).toBe(true);
  });
});
