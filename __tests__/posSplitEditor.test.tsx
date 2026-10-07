/**
 * Wiring of the refund / collect split editor and the return-lines picker, rendered with lightweight
 * stand-ins for the app's component library (the real one pulls in camera / gesture native modules).
 * Verifies what the cashier's taps and keystrokes actually do to the split and the selection.
 */
jest.mock('../src/components', () => {
  const React = require('react');
  const host = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    AppText: host('AppText'),
    Chip: host('Chip'),
    Field: host('Field'),
    Icon: host('Icon'),
    Panel: host('Panel'),
    PressableScale: host('PressableScale'),
    PrimaryButton: host('PrimaryButton'),
    QtyStepper: host('QtyStepper'),
    SegmentedControl: host('SegmentedControl'),
  };
});

import React from 'react';
import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { TenderSplitEditor } from '../src/screens/pos/TenderSplitEditor';
import { ReturnLinesPicker } from '../src/screens/pos/ReturnLinesPicker';
import { PosSaleItem } from '../src/types/pos';
import { ReturnSelection, TenderDraft, newTenderDraft, resolveTenders } from '../src/utils/posExchange';

const find = (root: ReactTestInstance, type: string) => root.findAllByType(type as never);
const texts = (root: ReactTestInstance) =>
  find(root, 'AppText').map((n) => React.Children.toArray(n.props.children).join(''));

/** Controlled wrapper: the editor owns no state, so keep the rows here like the screens do. */
function Harness({ initial, due, onRows }: { initial: TenderDraft[]; due: number; onRows: (r: TenderDraft[]) => void }) {
  const [rows, setRows] = React.useState(initial);
  onRows(rows);
  return <TenderSplitEditor heading="Refund to" rows={rows} duePaise={due} onChange={setRows} />;
}

function mount(due: number, initial = [newTenderDraft('cash')]) {
  let latest: TenderDraft[] = initial;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Harness initial={initial} due={due} onRows={(r) => (latest = r)} />);
  });
  return { tree, rows: () => latest };
}

describe('TenderSplitEditor', () => {
  it('starts as one method taking the whole amount', () => {
    const { tree, rows } = mount(1000_00);
    expect(rows()).toHaveLength(1);
    const t = texts(tree.root);
    expect(t).toContain('₹1,000');
    expect(t).toContain('Adds up to ₹1,000');
    expect(find(tree.root, 'Field')).toHaveLength(0); // cash: no amount box (the rest), no reference
  });

  it('card / UPI offer an optional reference box', () => {
    const { tree } = mount(500_00, [newTenderDraft('upi')]);
    const fields = find(tree.root, 'Field');
    expect(fields).toHaveLength(1);
    expect(fields[0]?.props.label).toBe('Reference (optional)');
    expect(fields[0]?.props.maxLength).toBe(120);
  });

  it('typing a reference and switching method updates the row', () => {
    const { tree, rows } = mount(500_00);
    act(() => find(tree.root, 'SegmentedControl')[0]?.props.onChange('card'));
    expect(rows()[0]?.method).toBe('card');
    act(() => find(tree.root, 'Field')[0]?.props.onChangeText('AUTH-77'));
    expect(rows()[0]?.reference).toBe('AUTH-77');
  });

  it('splitting adds a method; lowering the first amount hands the rest to the last', () => {
    const { tree, rows } = mount(1000_00);
    const split = find(tree.root, 'PrimaryButton').find((b) => b.props.label === 'Split across methods');
    act(() => split?.props.onPress());
    expect(rows()).toHaveLength(2);
    // right after splitting the amounts overshoot: the cashier is told to lower the first
    expect(texts(tree.root).join(' ')).toMatch(/already cover the total/);

    const amount = find(tree.root, 'Field').find((f) => f.props.label === 'Amount');
    act(() => amount?.props.onChangeText('600'));
    expect(resolveTenders(rows(), 1000_00).amounts).toEqual([600_00, 400_00]);
    const t = texts(tree.root);
    expect(t).toContain('The rest');
    expect(t).toContain('₹400');
    expect(t).toContain('Adds up to ₹1,000');
  });

  it('a split method can be removed again', () => {
    const { tree, rows } = mount(1000_00);
    act(() => find(tree.root, 'PrimaryButton').find((b) => b.props.label === 'Split across methods')?.props.onPress());
    expect(rows()).toHaveLength(2);
    const removers = find(tree.root, 'PressableScale');
    act(() => removers[0]?.props.onPress());
    expect(rows()).toHaveLength(1);
  });

  it('has no split button when nothing is due', () => {
    const { tree } = mount(0);
    expect(find(tree.root, 'PrimaryButton')).toHaveLength(0);
  });
});

describe('ReturnLinesPicker', () => {
  const item = (id: string, qty: number, net: number): PosSaleItem => ({
    id,
    variantId: `v_${id}`,
    listingId: `l_${id}`,
    listingNameSnap: `Item ${id}`,
    brandSnap: null,
    attributesLabelSnap: 'M',
    skuSnap: 'SKU',
    hsnSnap: null,
    qty,
    unitMrpPaise: net / qty,
    lineDiscountPaise: 0,
    taxableValuePaise: net,
    gstRateBp: 0,
    gstPaise: 0,
    netLinePaise: net,
  });

  function mountPicker(selection: ReturnSelection, returned: Record<string, number>) {
    let sel = selection;
    const onChange = jest.fn((next: ReturnSelection) => {
      sel = next;
    });
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ReturnLinesPicker
          title="What's coming back"
          items={[item('a', 3, 900_00), item('b', 1, 400_00)]}
          returned={returned}
          selection={selection}
          onChange={onChange}
        />,
      );
    });
    return { tree, onChange, sel: () => sel };
  }

  it("caps each stepper at what hasn't been returned yet", () => {
    const { tree } = mountPicker({}, { a: 2 });
    const steppers = find(tree.root, 'QtyStepper');
    expect(steppers).toHaveLength(2);
    expect(steppers[0]?.props.max).toBe(1); // 3 bought − 2 already returned
    expect(steppers[1]?.props.max).toBe(1);
    expect(texts(tree.root).join(' ')).toContain('2 already returned');
  });

  it('a fully returned line shows no stepper', () => {
    const { tree } = mountPicker({}, { b: 1 });
    expect(find(tree.root, 'QtyStepper')).toHaveLength(1);
    expect(texts(tree.root)).toContain('All returned');
  });

  it('choosing a quantity selects the line (restock on) and shows its refund', () => {
    const { tree, onChange, sel } = mountPicker({}, {});
    act(() => find(tree.root, 'QtyStepper')[0]?.props.onChange(2));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(sel().a).toEqual({ qty: 2, restock: true });

    const withSel = mountPicker({ a: { qty: 2, restock: true } }, {});
    expect(texts(withSel.tree.root)).toContain('₹600'); // 2 of 3 × ₹900
    const chip = find(withSel.tree.root, 'Chip')[0];
    expect(chip?.props.label).toBe('Back in stock');
    act(() => chip?.props.onPress());
    expect(withSel.sel().a).toEqual({ qty: 2, restock: false });
  });
});
