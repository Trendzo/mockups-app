import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Chip } from '../../components';
import { AiCopyField, useProductDraft } from '../../store/productDraft';
import { colors, spacing } from '../../theme/theme';

/**
 * Caption under a wizard field that AI copy can fill. Says so when the current
 * value came from the AI draft, and - whenever the latest suggestion differs
 * from what's in the field (retailer's own text, an emptied field, or an older
 * AI fill) - offers a one-tap swap. Prefill itself never overwrites text.
 */
export function AiCopyHint({ field }: { field: AiCopyField }) {
  const value = useProductDraft((s) => s[field]);
  const filled = useProductDraft((s) => !!s.aiFilled[field]);
  const suggestion = useProductDraft((s) => s.aiCopy?.[field]?.trim() ?? '');
  const accept = useProductDraft((s) => s.acceptAiSuggestion);

  const offer = !!suggestion && suggestion !== value.trim();
  if (!filled && !offer) return null;
  return (
    <View style={styles.wrap}>
      {filled ? (
        <AppText variant="meta" color={colors.meta} style={styles.caption}>
          ✨ Drafted by AI - review before publishing
        </AppText>
      ) : null}
      {offer ? (
        <View style={styles.row}>
          <Chip label={filled ? '✨ Use newer AI suggestion' : '✨ Use AI suggestion'} onPress={() => accept(field)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: -spacing.xs, gap: spacing.xs },
  caption: { marginLeft: 2 },
  row: { flexDirection: 'row' },
});
