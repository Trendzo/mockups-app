import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, BottomNavTab } from './BottomNav';
import { BlockedStoreBanner } from './BlockedStoreBanner';
import { useActiveOrders } from '../api/ordersHooks';
import { useStoreGate } from '../navigation/useStoreGate';
import { useNewOrderAlerts } from '../utils/useNewOrderAlerts';
import { spacing } from '../theme/theme';

export type MainTab = 'home' | 'orders' | 'catalog' | 'profile';

// BottomNav's floating pill is ~62pt tall; the restriction strip floats right above it.
const NAV_PILL_HEIGHT = 62;

/**
 * The app's persistent bottom nav: Home · Orders · Billing · Catalog · Account.
 * The four top-level pages highlight their tab; Billing is an action that pushes
 * the counter (POS) screen. Orders carries a live count of new orders waiting
 * to be accepted. Pushed detail/form screens use their own back button.
 *
 * A restricted store (paused / suspended / terminated / closed - see storeGate) gets a
 * one-line strip above the pill on every tab but Home (Home carries the full banner),
 * and loses the tabs its state cannot use: Orders when orders are off-limits (closed
 * account) and Billing wherever counter sales are off.
 *
 * The old "Create" tab (photo → product) now lives behind Home's "Add product"
 * and Catalog's "New product". The Scan screen (QR → web register) stays
 * registered in RootNavigator but unreachable from here; in-app billing scans
 * directly.
 */
export function MainBottomNav({
  navigation,
  active,
}: {
  navigation: { navigate: (name: string, params?: object) => void };
  active: MainTab;
}) {
  const insets = useSafeAreaInsets();
  const gate = useStoreGate();
  const restricted = gate.mode === 'restricted';
  const ordersQ = useActiveOrders();
  const newOrders = (ordersQ.data ?? []).filter((o) => o.status === 'routing').length;
  // Mounted for as long as the main tabs are, so alerts fire on any screen.
  useNewOrderAlerts(ordersQ.data);

  const tabs: BottomNavTab[] = [
    {
      key: 'home',
      icon: 'home',
      label: 'Home',
      active: active === 'home',
      onPress: () => navigation.navigate('Home'),
    },
    ...(restricted && !gate.abilities.viewOrders
      ? []
      : [
          {
            key: 'orders',
            icon: 'bag-handle-outline',
            label: 'Orders',
            active: active === 'orders',
            badge: newOrders,
            onPress: () => navigation.navigate('Orders'),
          },
        ]),
    ...(restricted && !gate.abilities.counterBilling
      ? []
      : [
          {
            key: 'billing',
            icon: 'receipt-outline',
            label: 'Billing',
            onPress: () => navigation.navigate('Register'),
          },
        ]),
    {
      key: 'catalog',
      icon: 'pricetags-outline',
      label: 'Catalog',
      active: active === 'catalog',
      onPress: () => navigation.navigate('Catalog'),
    },
    {
      key: 'profile',
      icon: 'person-circle-outline',
      label: 'Account',
      active: active === 'profile',
      onPress: () => navigation.navigate('Profile'),
    },
  ];

  return (
    <>
      {restricted && active !== 'home' ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.stripWrap,
            { bottom: Math.max(insets.bottom, 10) + 8 + NAV_PILL_HEIGHT + spacing.sm },
          ]}
        >
          <BlockedStoreBanner
            gate={gate}
            variant="strip"
            onOpen={(target) => navigation.navigate(target)}
          />
        </View>
      ) : null}
      <BottomNav tabs={tabs} />
    </>
  );
}

const styles = StyleSheet.create({
  stripWrap: {
    position: 'absolute',
    left: spacing.screenH,
    right: spacing.screenH,
  },
});
