import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_LABEL_CONFIG,
  LabelConfig,
  LabelSizeKey,
  isLabelSize,
  mergeLabelConfig,
} from '../utils/labelHtml';

interface LabelSettingsState {
  size: LabelSizeKey;
  config: LabelConfig;
  setSize: (size: LabelSizeKey) => void;
  setConfig: (patch: Partial<LabelConfig>) => void;
  reset: () => void;
}

/**
 * How the counter likes its price tags (size, which fields, QR vs barcode). Persisted to AsyncStorage —
 * the app's counterpart of the web portal keeping `pos.labelConfig` in localStorage — so the same
 * house style comes back every time.
 */
export const useLabelSettings = create<LabelSettingsState>()(
  persist(
    (set) => ({
      size: 'md',
      config: DEFAULT_LABEL_CONFIG,
      setSize: (size) => set({ size }),
      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      reset: () => set({ size: 'md', config: DEFAULT_LABEL_CONFIG }),
    }),
    {
      name: 'trendzo.pos.labels.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ size: s.size, config: s.config }),
      // Never trust what's on disk: keep known keys of the right type, fall back to defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { size?: unknown; config?: unknown };
        return {
          ...current,
          size: isLabelSize(p.size) ? p.size : current.size,
          config: mergeLabelConfig(p.config),
        };
      },
    },
  ),
);
