import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  Icon,
  ListRow,
  Panel,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useApplyInventoryImport, useDryRunInventoryImport } from '../api/catalogHooks';
import { fetchInventoryTemplate } from '../api/inventoryImport';
import { errorMessage } from '../api/request';
import type {
  InventoryImportApplied,
  InventoryImportDryRun,
  InventoryImportError,
} from '../types/catalog';
import {
  buildErrorReport,
  describeCounts,
  describeImportError,
  fileRowFor,
  importErrorsFromApiError,
  importPlanLabel,
  importReasonLabel,
  judgeDryRun,
  MAX_IMPORT_ROWS,
  ParseResult,
  parseInventoryCsv,
} from '../utils/inventoryImport';
import { pickCsvText } from '../utils/pickCsv';
import { savedMessage, saveTextFile } from '../utils/saveFile';
import { usePermissions } from '../utils/usePermission';
import { plural } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

/** Parse errors / server errors / plan lines shown before "and N more". */
const LIST_PREVIEW = 30;

type Stage =
  | { kind: 'idle' }
  | { kind: 'parsed'; fileName: string; parsed: ParseResult }
  | {
      kind: 'previewed';
      fileName: string;
      parsed: ParseResult;
      dry: InventoryImportDryRun;
      /** Set when applying was refused (422): the rows the server objected to. */
      applyFailure?: { message: string; errors: InventoryImportError[] };
    }
  | { kind: 'done'; result: InventoryImportApplied };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Bulk stock update from a CSV: pick the file, check it (dry run, nothing written),
 * read the plan and the per-row problems, then apply. Same columns and rules as the
 * web portal, so the template and exports from either round-trip.
 */
export function InventoryImportScreen({ navigation }: ScreenProps<'InventoryImport'>) {
  const toast = useToast();
  const { can } = usePermissions();
  const allowed = can('inventory.import');
  const dryRun = useDryRunInventoryImport();
  const apply = useApplyInventoryImport();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [picking, setPicking] = useState(false);
  const [busyFile, setBusyFile] = useState(false);

  const header = (
    <ScreenHeader overline="Inventory" title="Import from CSV" onBack={() => navigation.goBack()} />
  );

  if (!allowed) {
    return (
      <Screen edges={['top']}>
        {header}
        <EmptyState
          icon="lock-closed-outline"
          title="Not available for your role"
          message="Ask the store owner or a manager to import inventory."
        />
      </Screen>
    );
  }

  const chooseFile = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const file = await pickCsvText();
      if (!file) return;
      setStage({ kind: 'parsed', fileName: file.name, parsed: parseInventoryCsv(file.text) });
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't open that file"), 'error');
    } finally {
      setPicking(false);
    }
  };

  const downloadTemplate = async () => {
    if (busyFile) return;
    setBusyFile(true);
    try {
      const csv = await fetchInventoryTemplate();
      if (!csv) throw new Error('The template came back empty.');
      toast.show(savedMessage(await saveTextFile('inventory-template.csv', csv)), 'success');
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't download the template"), 'error');
    } finally {
      setBusyFile(false);
    }
  };

  const saveReport = async (
    errors: ReadonlyArray<{ row: number; sku?: string; message: string }>,
  ) => {
    if (busyFile) return;
    setBusyFile(true);
    try {
      const saved = await saveTextFile(`inventory-import-errors-${today()}.csv`, buildErrorReport(errors));
      toast.show(savedMessage(saved), 'success');
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't save the report"), 'error');
    } finally {
      setBusyFile(false);
    }
  };

  const runDryRun = async (fileName: string, parsed: ParseResult) => {
    try {
      const result = await dryRun.mutateAsync(parsed.rows);
      setStage({ kind: 'previewed', fileName, parsed, dry: result });
      if (result.errors.length > 0) {
        toast.show(plural(result.errors.length, 'row') + ' would fail', 'error');
      }
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't check the file"), 'error');
    }
  };

  const runApply = async (s: Extract<Stage, { kind: 'previewed' }>) => {
    try {
      const result = await apply.mutateAsync(s.parsed.rows);
      setStage({ kind: 'done', result });
      toast.show(
        describeCounts(result.applied) ? `Imported: ${describeCounts(result.applied)}` : 'Nothing needed changing',
        'success',
      );
    } catch (e) {
      // 422: a row failed (or too many new products) and NOTHING was applied.
      const rows = importErrorsFromApiError(e);
      setStage({
        ...s,
        applyFailure: { message: errorMessage(e, "Couldn't apply the import"), errors: rows },
      });
      toast.show('Nothing was applied', 'error');
    }
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {header}

        {stage.kind === 'idle' ? (
          <Idle picking={picking} busy={busyFile} onChoose={chooseFile} onTemplate={downloadTemplate} />
        ) : null}

        {stage.kind === 'parsed' ? (
          <Parsed
            stage={stage}
            checking={dryRun.isPending}
            busy={busyFile}
            onCheck={() => runDryRun(stage.fileName, stage.parsed)}
            onReplace={chooseFile}
            onReport={() =>
              saveReport(
                stage.parsed.errors.map((e) => ({ row: e.row, message: e.message })),
              )
            }
          />
        ) : null}

        {stage.kind === 'previewed' ? (
          <Previewed
            stage={stage}
            checking={dryRun.isPending}
            applying={apply.isPending}
            busy={busyFile}
            onApply={() => runApply(stage)}
            onRecheck={() => runDryRun(stage.fileName, stage.parsed)}
            onReplace={chooseFile}
            onReport={() => {
              const rows = stage.applyFailure?.errors.length
                ? stage.applyFailure.errors
                : stage.dry.errors;
              saveReport(
                rows.map((e) => ({
                  row: fileRowFor(e.row, stage.parsed.sourceRows),
                  sku: e.sku,
                  message: importReasonLabel(e.reason) + (e.detail ? ` (${e.detail})` : ''),
                })),
              );
            }}
          />
        ) : null}

        {stage.kind === 'done' ? (
          <Done
            result={stage.result}
            onOpenProduct={(id) => navigation.navigate('ProductDetail', { id })}
            onDone={() => navigation.goBack()}
            onAgain={() => setStage({ kind: 'idle' })}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// ---- stages ------------------------------------------------------------------

function Idle({
  picking,
  busy,
  onChoose,
  onTemplate,
}: {
  picking: boolean;
  busy: boolean;
  onChoose: () => void;
  onTemplate: () => void;
}) {
  return (
    <>
      <Panel title="How it works">
        <Step n={1} text="Download the template, or export your inventory, and edit it in a spreadsheet." />
        <Step n={2} text="Keep the header row. Each row needs a sku and a stock count." />
        <Step
          n={3}
          text="Choose the file here. We check it first and show exactly what would change. Nothing is saved until you apply."
        />
        <AppText variant="meta" color={colors.meta}>
          Up to {MAX_IMPORT_ROWS.toLocaleString('en-IN')} rows. If any row has a problem, nothing is
          applied, so you can fix the file and try again.
        </AppText>
      </Panel>
      <Panel title="Columns">
        <AppText variant="meta" color={colors.meta}>
          <AppText variant="bodyMedium" color={colors.ink}>sku</AppText> and{' '}
          <AppText variant="bodyMedium" color={colors.ink}>stock</AppText> are the minimum. Without a sku,
          give <AppText variant="bodyMedium" color={colors.ink}>product_name</AppText> with{' '}
          <AppText variant="bodyMedium" color={colors.ink}>variant_label</AppText> to find the variant.
          Optional: <AppText variant="bodyMedium" color={colors.ink}>price_paise</AppText> to change a price.
          To add new variants or products also use{' '}
          <AppText variant="bodyMedium" color={colors.ink}>attributes</AppText> (Size=M|Color=Red),{' '}
          <AppText variant="bodyMedium" color={colors.ink}>brand</AppText>,{' '}
          <AppText variant="bodyMedium" color={colors.ink}>category</AppText> and{' '}
          <AppText variant="bodyMedium" color={colors.ink}>gender</AppText> (her, him or unisex).
        </AppText>
      </Panel>
      <PrimaryButton label="Choose CSV file" tone="accent" loading={picking} onPress={onChoose} />
      <PrimaryButton
        label="Download template"
        tone="surface"
        loading={busy}
        onPress={onTemplate}
      />
    </>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNo}>
        <AppText variant="meta" color={colors.accentInk}>
          {n}
        </AppText>
      </View>
      <AppText variant="body" color={colors.ink} style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

function FileCard({ name, onReplace }: { name: string; onReplace: () => void }) {
  return (
    <View style={styles.fileCard}>
      <Icon name="document-text-outline" size={20} color={colors.ink} />
      <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1} style={styles.flex}>
        {name}
      </AppText>
      <PressableScale onPress={onReplace} hitSlop={10} haptic={false}>
        <AppText variant="bodyMedium" color={colors.ink}>
          Replace
        </AppText>
      </PressableScale>
    </View>
  );
}

function Tiles({ items }: { items: { label: string; value: number; tone?: 'danger' | 'success' | 'warning' }[] }) {
  return (
    <View style={styles.tiles}>
      {items.map((t) => (
        <View key={t.label} style={styles.tile}>
          <AppText
            variant="cardTitle"
            color={
              t.value > 0 && t.tone === 'danger'
                ? colors.danger
                : t.value > 0 && t.tone === 'success'
                  ? colors.success
                  : t.value > 0 && t.tone === 'warning'
                    ? '#B8860B'
                    : colors.ink
            }
            style={styles.tileValue}
          >
            {t.value}
          </AppText>
          <AppText variant="meta" color={colors.meta} numberOfLines={1}>
            {t.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function Parsed({
  stage,
  checking,
  busy,
  onCheck,
  onReplace,
  onReport,
}: {
  stage: Extract<Stage, { kind: 'parsed' }>;
  checking: boolean;
  busy: boolean;
  onCheck: () => void;
  onReplace: () => void;
  onReport: () => void;
}) {
  const { parsed } = stage;
  const problems = parsed.errors.length;
  return (
    <>
      <FileCard name={stage.fileName} onReplace={onReplace} />
      <Tiles
        items={[
          { label: 'Rows ready', value: parsed.rows.length, tone: 'success' },
          { label: 'Skipped', value: parsed.skipped, tone: 'warning' },
          { label: 'Problems', value: problems, tone: 'danger' },
        ]}
      />
      {parsed.skipped > 0 ? (
        <Banner
          tone="neutral"
          title={`${plural(parsed.skipped, 'row')} skipped`}
          message="They have neither a sku nor a product_name, so there is nothing to match them on."
        />
      ) : null}
      {problems > 0 ? (
        <Panel title={`${plural(problems, 'problem')} in this file`}>
          {parsed.errors.slice(0, LIST_PREVIEW).map((e, i) => (
            <AppText key={i} variant="meta" color={colors.ink}>
              {e.row > 0 ? `Row ${e.row}: ` : ''}
              {e.message}
            </AppText>
          ))}
          {problems > LIST_PREVIEW ? (
            <AppText variant="meta" color={colors.meta}>
              …and {problems - LIST_PREVIEW} more
            </AppText>
          ) : null}
          <PrimaryButton label="Save problem list" tone="surface" loading={busy} onPress={onReport} />
        </Panel>
      ) : parsed.rows.length === 0 ? (
        <Banner
          tone="warning"
          title="Nothing to import"
          message="Every row is missing both a sku and a product_name."
        />
      ) : null}
      {problems > 0 || parsed.rows.length === 0 ? (
        <PrimaryButton label="Choose another file" tone="accent" onPress={onReplace} />
      ) : (
        <PrimaryButton
          label={`Check ${plural(parsed.rows.length, 'row')}`}
          tone="accent"
          loading={checking}
          onPress={onCheck}
        />
      )}
    </>
  );
}

function Previewed({
  stage,
  checking,
  applying,
  busy,
  onApply,
  onRecheck,
  onReplace,
  onReport,
}: {
  stage: Extract<Stage, { kind: 'previewed' }>;
  checking: boolean;
  applying: boolean;
  busy: boolean;
  onApply: () => void;
  onRecheck: () => void;
  onReplace: () => void;
  onReport: () => void;
}) {
  const { dry, parsed, applyFailure } = stage;
  const verdict = judgeDryRun(dry);
  const { summary } = dry;
  // After a refused apply, show what the server said then (the data may have moved).
  const errors = applyFailure?.errors.length ? applyFailure.errors : dry.errors;
  const blocked = !verdict.canApply || !!applyFailure;
  const writes = dry.plan.filter((p) => p.action !== 'no_change' && p.action !== 'error');
  const counts = describeCounts(summary);

  return (
    <>
      <FileCard name={stage.fileName} onReplace={onReplace} />
      <Tiles
        items={[
          { label: 'Stock updates', value: summary.stockUpdates, tone: 'success' },
          { label: 'New variants', value: summary.variantCreates, tone: 'success' },
          { label: 'New products', value: summary.listingCreates, tone: 'success' },
          { label: 'No change', value: summary.noChange },
          { label: 'Errors', value: errors.length, tone: 'danger' },
        ]}
      />

      {applyFailure ? (
        <Banner
          tone="danger"
          title="Nothing was applied"
          message={
            applyFailure.errors.length > 0
              ? 'The server refused the import because of the rows below. Fix the file and choose it again.'
              : applyFailure.message
          }
        />
      ) : null}
      {verdict.blockers.map((b) => (
        <Banner key={b} tone={errors.length > 0 ? 'danger' : 'neutral'} title={b} />
      ))}

      {errors.length > 0 ? (
        <Panel title={`${plural(errors.length, 'row')} would fail`}>
          {errors.slice(0, LIST_PREVIEW).map((e, i) => (
            <AppText key={i} variant="meta" color={colors.ink}>
              {describeImportError(e, parsed.sourceRows)}
            </AppText>
          ))}
          {errors.length > LIST_PREVIEW ? (
            <AppText variant="meta" color={colors.meta}>
              …and {errors.length - LIST_PREVIEW} more
            </AppText>
          ) : null}
          <PrimaryButton label="Save problem list" tone="surface" loading={busy} onPress={onReport} />
        </Panel>
      ) : null}

      {writes.length > 0 ? (
        <Panel title={`Plan: ${plural(writes.length, 'change')}`}>
          {writes.slice(0, LIST_PREVIEW).map((p, i) => {
            const l = importPlanLabel(p);
            return (
              <View key={i} style={styles.planRow}>
                <View style={styles.planTag}>
                  <AppText variant="meta" color={colors.ink} style={styles.planTagText}>
                    {l.tag}
                  </AppText>
                </View>
                <AppText variant="meta" color={colors.ink} style={styles.flex} numberOfLines={2}>
                  {l.text}
                </AppText>
              </View>
            );
          })}
          {writes.length > LIST_PREVIEW ? (
            <AppText variant="meta" color={colors.meta}>
              …and {writes.length - LIST_PREVIEW} more
            </AppText>
          ) : null}
        </Panel>
      ) : null}

      <PrimaryButton
        label={counts ? `Apply ${counts}` : 'Nothing to apply'}
        tone="accent"
        disabled={blocked || checking}
        loading={applying}
        onPress={onApply}
      />
      <PrimaryButton label="Check again" tone="surface" loading={checking} onPress={onRecheck} />
    </>
  );
}

function Done({
  result,
  onOpenProduct,
  onDone,
  onAgain,
}: {
  result: InventoryImportApplied;
  onOpenProduct: (listingId: string) => void;
  onDone: () => void;
  onAgain: () => void;
}) {
  const a = result.applied;
  return (
    <>
      <Banner
        tone="success"
        title={describeCounts(a) ? 'Import applied' : 'Nothing needed changing'}
        message={describeCounts(a) || 'Every row already matched your current stock.'}
      />
      <Tiles
        items={[
          { label: 'Stock updates', value: a.stockUpdates, tone: 'success' },
          { label: 'New variants', value: a.variantCreates, tone: 'success' },
          { label: 'New products', value: a.listingCreates, tone: 'success' },
          { label: 'Price updates', value: a.priceUpdates, tone: 'success' },
        ]}
      />
      {result.createdListings.length > 0 ? (
        <Panel title="New draft products">
          <AppText variant="meta" color={colors.meta}>
            New products land as drafts. Add photos and details before publishing.
          </AppText>
          {result.createdListings.slice(0, LIST_PREVIEW).map((l) => (
            <ListRow
              key={l.listingId}
              label={l.name}
              style={styles.softRow}
              onPress={() => onOpenProduct(l.listingId)}
            />
          ))}
          {result.createdListings.length > LIST_PREVIEW ? (
            <AppText variant="meta" color={colors.meta}>
              …and {result.createdListings.length - LIST_PREVIEW} more in your catalog
            </AppText>
          ) : null}
        </Panel>
      ) : null}
      <PrimaryButton label="Done" tone="accent" onPress={onDone} />
      <PrimaryButton label="Import another file" tone="surface" onPress={onAgain} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepNo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  tileValue: { fontSize: 24, lineHeight: 28 },
  planRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  planTag: {
    minWidth: 78,
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignItems: 'center',
  },
  planTagText: { fontSize: 11, lineHeight: 15 },
  softRow: { backgroundColor: colors.canvas },
});
