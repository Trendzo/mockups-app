import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state that spins only for the user's own pull. Binding a
 * RefreshControl to a query's isRefetching made it spin on every background
 * poll/refetch too — and on iOS showing the spinner scrolls the list down to
 * reveal it, so polled pages jumped every few seconds.
 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  return { refreshing, onRefresh };
}
