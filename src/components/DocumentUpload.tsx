import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { AppImage } from './AppImage';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { StatusChip, StatusTone, toneForStatus } from './StatusChip';
import { useToast } from './Toast';
import { uploadDocument } from '../api/onboarding';
import { inferMimeType } from '../utils/image';
import { colors, radii, spacing } from '../theme/theme';

interface DocumentUploadProps {
  label: string;
  required?: boolean;
  value?: string | null; // uploaded url
  status?: string; // doc status chip (missing / pending_review / verified / rejected)
  error?: string | null;
  onUploaded: (url: string) => void;
  onClear?: () => void;
}

/** One document row: pick an image → upload → show thumbnail + status chip. */
export function DocumentUpload({
  label,
  required,
  value,
  status,
  error,
  onUploaded,
  onClear,
}: DocumentUploadProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
      maxWidth: 2400,
      maxHeight: 2400,
    });
    if (res.errorCode) {
      toast.show(res.errorMessage ?? 'Could not open library', 'error');
      return;
    }
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    setBusy(true);
    try {
      const result = await uploadDocument({
        uri: asset.uri,
        name: asset.fileName ?? `doc_${Date.now()}.jpg`,
        type: asset.type ?? inferMimeType(asset.uri),
      });
      onUploaded(result.url);
    } catch (e: any) {
      toast.show(e?.message ?? 'Upload failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const chipTone: StatusTone = status
    ? toneForStatus(status)
    : value
    ? 'success'
    : required
    ? 'warning'
    : 'neutral';
  // Optional docs show no chip (they used to read "optional"); still not required.
  const chipLabel = status ?? (value ? 'uploaded' : required ? 'required' : null);

  return (
    <View style={[styles.row, error ? styles.rowError : null]}>
      <PressableScale onPress={pick} toScale={0.98} style={styles.thumbBox} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.ink} />
        ) : value ? (
          <AppImage uri={value} radius={radii.sm} containerStyle={styles.thumb} />
        ) : (
          <Icon name="cloud-upload-outline" size={22} color={colors.inkMuted} />
        )}
      </PressableScale>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1} style={styles.flex}>
            {label}
            {required ? ' *' : ''}
          </AppText>
          {chipLabel ? <StatusChip label={chipLabel} tone={chipTone} /> : null}
        </View>
        <PressableScale onPress={pick} disabled={busy} style={styles.action}>
          <AppText variant="meta" color={colors.ink}>
            {value ? 'Replace file' : 'Upload file'}
          </AppText>
        </PressableScale>
        {error ? (
          <AppText variant="meta" color={colors.danger}>
            {error}
          </AppText>
        ) : null}
      </View>

      {value && onClear ? (
        <PressableScale onPress={onClear} style={styles.clear} toScale={0.9}>
          <Icon name="close" size={16} color={colors.meta} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.sm + 2,
  },
  rowError: { borderColor: colors.danger },
  thumbBox: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: 48, height: 48 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  action: { alignSelf: 'flex-start', marginTop: 2 },
  clear: { padding: spacing.xs },
});
