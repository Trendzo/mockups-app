/**
 * The Labels screen: products picked from search / scan become tags, copies multiply them, and printing
 * goes through the (guarded) system print dialog — a missing native module is a toast, never a crash.
 */
const mockToast = { show: jest.fn() };
jest.mock('../src/components', () => {
  const React = require('react');
  const host = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    AppText: host('AppText'),
    Banner: host('Banner'),
    EmptyState: host('EmptyState'),
    Icon: host('Icon'),
    KeyboardStickyView: host('KeyboardStickyView'),
    Panel: host('Panel'),
    PressableScale: host('PressableScale'),
    PrimaryButton: host('PrimaryButton'),
    QtyStepper: host('QtyStepper'),
    Screen: host('Screen'),
    ScreenHeader: host('ScreenHeader'),
    SegmentedControl: host('SegmentedControl'),
    ToggleRow: host('ToggleRow'),
    useToast: () => mockToast,
  };
});
jest.mock('../src/screens/pos/ProductSearch', () => {
  const React = require('react');
  return { ProductSearch: (props: Record<string, unknown>) => React.createElement('ProductSearch', props) };
});
let mockCan = true;
jest.mock('../src/utils/usePermission', () => ({ usePermissions: () => ({ can: () => mockCan }) }));

import React from 'react';
import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { PosLabelsScreen } from '../src/screens/PosLabelsScreen';
import { useLabelSettings } from '../src/store/labelSettings';
import { PRINT_UNAVAILABLE_MESSAGE, __setPrintModuleForTests } from '../src/utils/printing';
import { PosLookupRow } from '../src/types/pos';

const find = (root: ReactTestInstance, type: string) => root.findAllByType(type as never);
const printButton = (root: ReactTestInstance) =>
  find(root, 'PrimaryButton').find((b) => String(b.props.label).startsWith('Print'));

const row = (id: string, name: string, extra: Partial<PosLookupRow> = {}): PosLookupRow => ({
  variantId: id,
  listingId: `lst_${id}`,
  name,
  brand: null,
  attributesLabel: 'M',
  sku: `SKU-${id}`,
  barcode: null,
  hsn: null,
  pricePaise: 499_00,
  compareAtPaise: null,
  availableQty: 3,
  imageUrl: null,
  ...extra,
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
function setup() {
  const navigation = { goBack: jest.fn() };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<PosLabelsScreen navigation={navigation as never} route={{ params: undefined } as never} />);
  });
  mounted.push(tree);
  return tree;
}

afterEach(() => {
  act(() => mounted.splice(0).forEach((t) => t.unmount()));
  __setPrintModuleForTests(undefined);
});
beforeEach(() => {
  mockToast.show.mockReset();
  mockCan = true;
  useLabelSettings.getState().reset();
});

describe('PosLabelsScreen', () => {
  it('needs the pos.labels permission', () => {
    mockCan = false;
    const tree = setup();
    expect(find(tree.root, 'Banner')[0]?.props.title).toBe('Not authorized');
    expect(find(tree.root, 'ProductSearch')).toHaveLength(0);
  });

  it('prints one tag per copy of each picked product through the system print dialog', async () => {
    const print = jest.fn().mockResolvedValue('job');
    __setPrintModuleForTests({ print });
    const tree = setup();
    expect(printButton(tree.root)?.props.disabled).toBe(true); // nothing picked yet

    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(row('v1', 'Kurta')));
    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(row('v2', 'Shirt')));
    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(row('v1', 'Kurta'))); // same again → 2 copies
    expect(printButton(tree.root)?.props.label).toBe('Print 3 labels');

    // raise the shirt to 4 copies
    const steppers = find(tree.root, 'QtyStepper');
    act(() => steppers[1]?.props.onChange(4));
    expect(printButton(tree.root)?.props.label).toBe('Print 6 labels');

    await act(async () => {
      await printButton(tree.root)?.props.onPress();
    });
    expect(print).toHaveBeenCalledTimes(1);
    const { html, jobName } = print.mock.calls[0][0];
    expect(jobName).toBe('Labels (6)');
    expect(html.split('<div class="label qr">').length - 1).toBe(6);
    expect(html).toContain('width: 50mm; height: 25mm'); // default size
  });

  it('removing the last copy drops the product', () => {
    __setPrintModuleForTests({ print: jest.fn() });
    const tree = setup();
    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(row('v1', 'Kurta')));
    act(() => find(tree.root, 'QtyStepper')[0]?.props.onChange(0));
    expect(find(tree.root, 'QtyStepper')).toHaveLength(0);
    expect(printButton(tree.root)?.props.disabled).toBe(true);
  });

  it('uses the remembered size and fields', async () => {
    const print = jest.fn().mockResolvedValue('job');
    __setPrintModuleForTests({ print });
    useLabelSettings.getState().setSize('lg');
    useLabelSettings.getState().setConfig({ showSku: true, codeType: 'barcode' });
    const tree = setup();
    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(row('v1', 'Kurta')));
    await act(async () => {
      await printButton(tree.root)?.props.onPress();
    });
    const { html } = print.mock.calls[0][0];
    expect(html).toContain('width: 65mm; height: 38mm');
    expect(html).toContain('class="label barcode"');
    expect(html).toContain('SKU-v1');
  });

  it('without the native print module it says so and does not crash', async () => {
    __setPrintModuleForTests(null);
    const tree = setup();
    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(row('v1', 'Kurta')));
    await act(async () => {
      await printButton(tree.root)?.props.onPress();
    });
    expect(mockToast.show).toHaveBeenCalledWith(PRINT_UNAVAILABLE_MESSAGE, 'info');
  });

  it('barcode mode reports a product with no barcode or SKU and prints the rest', async () => {
    const print = jest.fn().mockResolvedValue('job');
    __setPrintModuleForTests({ print });
    useLabelSettings.getState().setConfig({ codeType: 'barcode' });
    const tree = setup();
    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(row('v1', 'Plain Tee', { sku: null })));
    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(row('v2', 'Kurta')));
    await act(async () => {
      await printButton(tree.root)?.props.onPress();
    });
    expect(mockToast.show).toHaveBeenCalledWith('No barcode or SKU for "Plain Tee" — skipped', 'info');
    expect(print).toHaveBeenCalledTimes(1);
    expect(print.mock.calls[0][0].jobName).toBe('Labels (1)');
  });

  it('a print failure is a toast, not a crash', async () => {
    __setPrintModuleForTests({ print: jest.fn().mockRejectedValue(new Error('Printer offline')) });
    const tree = setup();
    act(() => find(tree.root, 'ProductSearch')[0]?.props.onPick(row('v1', 'Kurta')));
    await act(async () => {
      await printButton(tree.root)?.props.onPress();
    });
    expect(mockToast.show).toHaveBeenCalledWith('Printer offline', 'error');
  });
});
