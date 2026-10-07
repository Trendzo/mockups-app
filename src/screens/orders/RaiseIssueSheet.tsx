import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, BottomSheet, Field, PrimaryButton, SheetSurface } from '../../components';
import { PhotoPicker, SheetTitle, sheetStyles } from './OrderActionSheets';
import { ISSUE_DESCRIPTION_MAX, ISSUE_SUBJECT_MAX } from '../../types/issues';
import { colors, spacing } from '../../theme/theme';

export type RaiseIssueMode = 'dispute' | 'refund';

const COPY: Record<RaiseIssueMode, { title: string; message: string; submit: string; subject: string }> = {
  dispute: {
    title: 'Raise a dispute',
    message: 'Tell Trendzo what went wrong with this order. An admin reviews it and replies in the thread.',
    submit: 'Raise dispute',
    subject: '',
  },
  refund: {
    title: 'Request a refund',
    message: 'Opens a dispute asking for a refund on this order — an admin reviews it.',
    submit: 'Request refund',
    subject: 'Refund request',
  },
};

/**
 * "Raise dispute" / "Request refund" on an order. Both file the same thing
 * (POST /retailer/issues, kind 'dispute'); only the wording and the starting
 * subject differ — the same as the web portal.
 */
export function RaiseIssueSheet({
  visible,
  mode,
  orderId,
  busy,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  mode: RaiseIssueMode;
  orderId: string;
  busy?: boolean;
  onSubmit: (input: { subject: string; description: string; evidence: string[] }) => void;
  onClose: () => void;
}) {
  const maxH = useWindowDimensions().height * 0.62;
  const copy = COPY[mode];
  const [subject, setSubject] = useState(copy.subject);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ subject?: string; description?: string }>({});

  useEffect(() => {
    if (visible) {
      setSubject(COPY[mode].subject);
      setDescription('');
      setPhotos([]);
      setErrors({});
    }
  }, [visible, mode]);

  const submit = () => {
    const e: { subject?: string; description?: string } = {};
    if (subject.trim().length < 3) e.subject = 'Add a short subject (at least 3 characters)';
    if (description.trim().length < 3) e.description = 'Describe the problem (at least 3 characters)';
    setErrors(e);
    if (e.subject || e.description) return;
    onSubmit({ subject: subject.trim(), description: description.trim(), evidence: photos });
  };

  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} avoidKeyboard dismissable={!busy}>
      <SheetSurface style={sheetStyles.sheet}>
        <SheetTitle title={copy.title} message={copy.message} />
        <ScrollView style={{ maxHeight: maxH }} keyboardShouldPersistTaps="handled">
          <View style={styles.fields}>
            <Field
              label="Subject"
              value={subject}
              onChangeText={(t) => {
                setSubject(t);
                setErrors((x) => ({ ...x, subject: undefined }));
              }}
              placeholder="e.g. Customer refused a good item"
              maxLength={ISSUE_SUBJECT_MAX}
              error={errors.subject}
              boxed
            />
            <Field
              label="Details"
              value={description}
              onChangeText={(t) => {
                setDescription(t);
                setErrors((x) => ({ ...x, description: undefined }));
              }}
              placeholder="What happened, and what do you want Trendzo to do?"
              multiline
              maxLength={ISSUE_DESCRIPTION_MAX}
              error={errors.description}
              style={sheetStyles.multiline}
              boxed
            />
            <View style={sheetStyles.block}>
              <AppText variant="sectionLabel" color={colors.meta}>
                Photos (optional)
              </AppText>
              <PhotoPicker folder={`disputes/${orderId}`} max={6} photos={photos} onChange={setPhotos} />
            </View>
          </View>
        </ScrollView>
        <PrimaryButton label={copy.submit} tone="accent" loading={busy} onPress={submit} />
        <PrimaryButton label="Cancel" tone="surface" disabled={busy} onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
});
