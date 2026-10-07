import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { pushManager } from './pushRuntime';
import type { PermissionState } from './types';

/**
 * OS notification permission for the Settings screen. Re-reads whenever the app returns to the
 * foreground (the user may have flipped it in system settings), and never prompts on its own.
 */
export function usePushPermission() {
  const [state, setState] = useState<PermissionState | 'loading'>('loading');
  const [canPrompt, setCanPrompt] = useState(false);
  const [unavailableReason, setReason] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const info = await pushManager.getPermissionInfo();
    setState(info.state);
    setCanPrompt(info.canPrompt);
    setReason(pushManager.unavailableReason());
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  /** Show the OS prompt (when it can still appear) and re-read the result. */
  const request = useCallback(async () => {
    const next = await pushManager.requestPermission();
    await refresh();
    return next;
  }, [refresh]);

  const openSettings = useCallback(() => pushManager.openSystemSettings(), []);

  return {
    state,
    /** True while the OS prompt can still be shown; false means only system settings can turn it on. */
    canPrompt,
    /** Set when Firebase is missing from this build: background pushes can't reach the phone, in-app alerts still work. */
    unavailableReason,
    request,
    openSettings,
    refresh,
  };
}
