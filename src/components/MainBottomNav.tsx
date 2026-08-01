import React from 'react';
import { BottomNav } from './BottomNav';
import { useCaptureDraft } from '../store/captureDraft';

export type MainTab = 'home' | 'catalog' | 'profile';

/**
 * The app's persistent bottom nav (Home · Create · Catalog · Profile — Scan is
 * currently hidden, see below), rendered on each main page with the active tab set.
 * Only the three top-level pages (Home · Catalog · Profile) highlight an active tab;
 * Create is an action that pushes its own screen. Pushed detail/form screens use
 * their own back button.
 */
export function MainBottomNav({
  navigation,
  active,
}: {
  navigation: { navigate: (name: string, params?: object) => void };
  active: MainTab;
}) {
  const clearDraft = useCaptureDraft((s) => s.clear);
  const startNewMockup = () => {
    clearDraft();
    navigation.navigate('SelectPhotos');
  };

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
          key: 'create',
          icon: 'add-circle-outline',
          label: 'Create',
          onPress: startNewMockup,
        },
        // Scan tab hidden for now — kept here (not deleted) so it can be restored
        // in one step. The Scan screen + its route stay registered in
        // RootNavigator; it's simply unreachable from the bottom nav.
        // {
        //   key: 'scan',
        //   icon: 'barcode-scan',
        //   set: 'mci',
        //   label: 'Scan',
        //   onPress: () => navigation.navigate('Scan'),
        // },
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
          label: 'Profile',
          active: active === 'profile',
          onPress: () => navigation.navigate('Profile'),
        },
      ]}
    />
  );
}
