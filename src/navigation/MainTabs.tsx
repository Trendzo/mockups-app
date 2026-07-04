import React from 'react';
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { MainBottomNav, MainTab } from '../components';
import { HomeScreen } from '../screens/HomeScreen';
import { CatalogListScreen } from '../screens/CatalogListScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

// Screens are typed for the native stack; they only use navigate/goBack, which
// the tab navigation also provides. Cast to satisfy the tab screen signature.
const Home = HomeScreen as React.ComponentType<object>;
const Catalog = CatalogListScreen as React.ComponentType<object>;
const Profile = ProfileScreen as React.ComponentType<object>;

/** Single persistent bottom bar; only the scene beneath it swaps between tabs. */
function MainTabBar({ state, navigation }: BottomTabBarProps) {
  const current = (state.routes[state.index]?.name?.toLowerCase() ?? 'home') as MainTab;
  return <MainBottomNav navigation={navigation} active={current} />;
}

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Catalog" component={Catalog} />
      <Tab.Screen name="Profile" component={Profile} />
    </Tab.Navigator>
  );
}
