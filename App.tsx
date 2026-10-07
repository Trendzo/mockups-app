/**
 * Trendzo Mockup — app root.
 * Providers: GestureHandler → SafeArea → QueryClient → Toast → Navigation.
 */
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/api/queryClient';
import { ToastProvider } from './src/components';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme/theme';
import { flushPendingPushLink, initPush, navigationRef } from './src/services/push';

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.canvas },
};

function App() {
  // Phone push: channels, token registration, tap routing. A no-op (logged) without Firebase.
  useEffect(() => {
    initPush();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <NavigationContainer
              theme={navTheme}
              ref={navigationRef}
              onReady={flushPendingPushLink}
              onStateChange={flushPendingPushLink}
            >
              <RootNavigator />
            </NavigationContainer>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
