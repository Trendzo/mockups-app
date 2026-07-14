import { AppState, Platform } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';

// React Native has no browser "window focus" event, so React Query's
// refetchOnWindowFocus never fires on its own. Bridge it to AppState: whenever
// the app returns to the foreground, mark it focused → stale queries refetch,
// so admin-side changes show up without a manual reload.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => {
      handleFocus(state === 'active');
    });
    return () => sub.remove();
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Short freshness window so navigating to / focusing a screen refetches,
      // instead of serving 5-minute-old data.
      staleTime: 10 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
