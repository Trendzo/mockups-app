import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon, IconSet } from './Icon';
import { PressableScale } from './PressableScale';
import { colors, spacing } from '../theme/theme';

export interface BottomNavTab {
  key: string;
  icon: string;
  /** Icon family - defaults to Ionicons ('ion'). Use 'mci' for MaterialCommunityIcons glyphs. */
  set?: IconSet;
  label: string;
  active?: boolean;
  /** Count bubble on the icon (e.g. new orders waiting). Hidden at 0. */
  badge?: number;
  onPress: () => void;
}

/** Floating bottom nav (pill), matching the app's floating-bar style. */
export function BottomNav({ tabs }: { tabs: BottomNavTab[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) + 8 }]}
    >
      <View style={styles.bar}>
        {tabs.map((t) => {
          const tint = t.active ? colors.ink : colors.inkMuted;
          return (
            <PressableScale key={t.key} onPress={t.onPress} style={styles.tab} haptic>
              <View>
                <Icon name={t.icon} set={t.set} size={22} color={tint} />
                {t.badge ? (
                  <View style={styles.badge}>
                    <AppText variant="navCounter" color={colors.accentInk} style={styles.badgeText}>
                      {t.badge > 9 ? '9+' : t.badge}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText variant="meta" color={tint} style={styles.label}>
                {t.label}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minWidth: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 11, lineHeight: 13 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: { fontSize: 9, lineHeight: 11 },
});
