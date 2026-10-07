import React, { useEffect, useState } from 'react';
import { BottomSheet, Field, PrimaryButton, SheetSurface } from '../../components';
import { SheetTitle, sheetStyles } from './OrderActionSheets';
import type { CashRefundDue } from '../../types/returns';
import { formatPaise } from '../../utils/money';

/**
 * Confirm the notes were handed to the customer for a cash-on-delivery refund.
 * The amount is shown, never typed: the server demands an exact match with the
 * refund leg, so a free field could only ever be rejected. Paid exactly once —
 * a double submit comes back as 409, not a second payment.
 */
export function CashRefundSheet({
  visible,
  due,
  busy,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  due: CashRefundDue;
  busy?: boolean;
  onSubmit: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (visible) setNote('');
  }, [visible]);
  const amount = formatPaise(due.amountPaise);
  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} avoidKeyboard dismissable={!busy}>
      <SheetSurface style={sheetStyles.sheet}>
        <SheetTitle
          title={`Hand over ${amount} in cash`}
          message="Confirm only once the customer has the notes in hand. This records money leaving your till — you are repaid in your next payout."
        />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          maxLength={300}
          multiline
          style={sheetStyles.multiline}
          boxed
        />
        <PrimaryButton
          label={`Confirm ${amount} handed over`}
          tone="accent"
          loading={busy}
          onPress={() => onSubmit(note.trim())}
        />
        <PrimaryButton label="Cancel" tone="surface" disabled={busy} onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}
