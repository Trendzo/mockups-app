import React from 'react';
import { BottomNav } from './BottomNav';
import { useActiveOrders } from '../api/ordersHooks';
import { useNewOrderAlerts } from '../utils/useNewOrderAlerts';

export type MainTab = 'home' | 'orders' | 'catalog' | 'profile';

/**
 * The app's persistent bottom nav: Home · Orders · Billing · Catalog · Account.
 * The four top-level pages highlight their tab; Billing is an action that pushes
 * the counter (POS) screen. Orders carries a live count of new orders waiting
 * to be accepted. Pushed detail/form screens use their own back button.
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
  const ordersQ = useActiveOrders();
  const newOrders = (ordersQ.data ?? []).filter((o) => o.status === 'routing').length;
  // Mounted for as long as the main tabs are, so alerts fire on any screen.
  useNewOrderAlerts(ordersQ.data);

  return (
    <BottomNav
      tabs={[
        {
          key: 'home',
          icon: 'home',
          label: 'Home',
          active: active === 'home',
          onPress: () => navigation.navigate('Home'),
        },
        {
          key: 'orders',
          icon: 'bag-handle-outline',
          label: 'Orders',
          active: active === 'orders',
          badge: newOrders,
          onPress: () => navigation.navigate('Orders'),
        },
        {
          key: 'billing',
          icon: 'receipt-outline',
          label: 'Billing',
          onPress: () => navigation.navigate('Register'),
        },
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
      ]}
    />
  );
}
