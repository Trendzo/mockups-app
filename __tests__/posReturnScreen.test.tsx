/**
 * The Return screen end to end (hooks and component library stubbed): choose a line, give a reason,
 * refund — the request carries tenders that equal the refund due, and a retry after a dropped reply
 * reuses the SAME idempotency key so the customer can never be refunded twice.
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

const mockSale = {
  id: 'sale_1',
  status: 'completed',
  originalSaleId: null,
  completedAt: '2026-10-07T10:00:00.000Z',
  invoice: { invoiceNumber: 'INV-1' },
  customerNameSnap: 'Ravi',
  customerPhoneSnap: null,
  payments: [{ id: 'p1', method: 'upi', direction: 'collect', amountPaise: 1500_00 }],
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
    {
      id: 'psi_b',
      variantId: 'v_b',
      listingId: 'l_b',
      listingNameSnap: 'Scarf',
      brandSnap: null,
      attributesLabelSnap: 'F',
      skuSnap: null,
      qty: 1,
      netLinePaise: 500_00,
    },
  ],
};
const mockMutateAsync = jest.fn();
jest.mock('../src/api/posHooks', () => ({
  usePosSale: () => ({ data: mockSale, isError: false, refetch: jest.fn() }),
  useReturnSale: () => ({ mutateAsync: mockMutateAsync }),
}));
let mockKeySeq = 0;
jest.mock('../src/api/request', () => ({
  idempotencyKey: (p: string) => `${p}-k${++mockKeySeq}`,
  errorMessage: (e: { message?: string } | null, fallback = 'err') => e?.message || fallback,
}));
jest.mock('../src/utils/usePermission', () => ({ usePermissions: () => ({ can: () => true }) }));

import React from 'react';
import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { PosReturnScreen } from '../src/screens/PosReturnScreen';
import { usePosReturns } from '../src/store/posReturns';

const find = (root: ReactTestInstance, type: string) => root.findAllByType(type as never);
const button = (root: ReactTestInstance, starts: string) =>
  find(root, 'PrimaryButton').find((b) => String(b.props.label).startsWith(starts));

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
      <PosReturnScreen navigation={navigation as never} route={{ params: { saleId: 'sale_1' } } as never} />,
    );
  });
  mounted.push(tree);
  return { tree, navigation };
}

// Unmount between tests: a mounted screen is subscribed to the persisted ledger store.
afterEach(() => {
  act(() => mounted.splice(0).forEach((t) => t.unmount()));
});

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockToast.show.mockReset();
  usePosReturns.setState({ returned: {} });
});

describe('PosReturnScreen', () => {
  it('cannot be submitted until a line and a reason are chosen', () => {
    const { tree } = setup();
    const btn = () => button(tree.root, 'Record return') ?? button(tree.root, 'Refund');
    expect(btn()?.props.disabled).toBe(true);
    act(() => find(tree.root, 'QtyStepper')[0]?.props.onChange(1));
    expect(btn()?.props.disabled).toBe(true); // still no reason
    act(() => find(tree.root, 'Field').find((f) => f.props.label === 'Reason')?.props.onChangeText('Wrong size'));
    expect(button(tree.root, 'Refund')?.props.disabled).toBe(false);
    expect(button(tree.root, 'Refund')?.props.label).toBe('Refund ₹500'); // 1 of 2 × ₹1,000
  });

  it('refunds the way the customer paid (UPI here) and sends tenders equal to the refund due', async () => {
    mockMutateAsync.mockResolvedValue({ returnSaleId: 'sale_r1', refundPaise: 500_00, creditNoteId: 'cn_1' });
    const { tree, navigation } = setup();
    act(() => find(tree.root, 'QtyStepper')[0]?.props.onChange(1));
    act(() => find(tree.root, 'Field').find((f) => f.props.label === 'Reason')?.props.onChangeText('  Wrong size '));
    await act(async () => {
      await button(tree.root, 'Refund')?.props.onPress();
    });
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body.reason).toBe('Wrong size');
    expect(body.lines).toEqual([{ originalSaleItemId: 'psi_a', qty: 1, restock: true }]);
    expect(body.refundTenders).toEqual([{ method: 'upi', amountPaise: 500_00 }]);
    expect(body.refundTenders.reduce((s: number, t: { amountPaise: number }) => s + t.amountPaise, 0)).toBe(500_00);
    expect(body.idempotencyKey).toMatch(/^posret-sale_1-k\d+$/);
    // lands on the return document, and the ledger now knows a unit of that line went back
    expect(navigation.replace).toHaveBeenCalledWith('PosSaleDetail', { id: 'sale_r1' });
    expect(usePosReturns.getState().returned).toEqual({ psi_a: 1 });
  });

  it('a retry after a dropped reply reuses the SAME idempotency key', async () => {
    mockMutateAsync
      .mockRejectedValueOnce({ message: 'Network down' })
      .mockResolvedValueOnce({ returnSaleId: 'sale_r1', refundPaise: -500_00, creditNoteId: null });
    const { tree, navigation } = setup();
    act(() => find(tree.root, 'QtyStepper')[0]?.props.onChange(1));
    act(() => find(tree.root, 'Field').find((f) => f.props.label === 'Reason')?.props.onChangeText('Wrong size'));

    await act(async () => {
      await button(tree.root, 'Refund')?.props.onPress();
    });
    expect(mockToast.show).toHaveBeenCalledWith('Network down', 'error');
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(usePosReturns.getState().returned).toEqual({}); // nothing recorded for a failed attempt

    await act(async () => {
      await button(tree.root, 'Refund')?.props.onPress();
    });
    expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    expect(mockMutateAsync.mock.calls[1][0].idempotencyKey).toBe(mockMutateAsync.mock.calls[0][0].idempotencyKey);
    expect(navigation.replace).toHaveBeenCalledWith('PosSaleDetail', { id: 'sale_r1' });
    // the replayed reply echoes the stored negative amount — shown as a plain refund
    expect(mockToast.show).toHaveBeenLastCalledWith('Return recorded · ₹500 refunded', 'success');
  });

  it('does not offer to return what has already gone back (this device remembers)', () => {
    usePosReturns.setState({ returned: { psi_b: 1 } });
    const { tree } = setup();
    expect(find(tree.root, 'QtyStepper')).toHaveLength(1); // the scarf is fully returned
    expect(find(tree.root, 'AppText').map((n) => String(n.props.children))).toContain('All returned');
  });

  it('a split refund must add up: the button stays disabled until it does', () => {
    const { tree } = setup();
    act(() => find(tree.root, 'QtyStepper')[0]?.props.onChange(2)); // ₹1,000 due
    act(() => find(tree.root, 'Field').find((f) => f.props.label === 'Reason')?.props.onChangeText('Defective'));
    act(() => find(tree.root, 'PrimaryButton').find((b) => b.props.label === 'Split across methods')?.props.onPress());
    // frozen first amount already covers the total → needs lowering
    expect(button(tree.root, 'Refund')?.props.disabled).toBe(true);
    act(() => find(tree.root, 'Field').find((f) => f.props.label === 'Amount')?.props.onChangeText('700'));
    expect(button(tree.root, 'Refund')?.props.disabled).toBe(false);
  });
});
