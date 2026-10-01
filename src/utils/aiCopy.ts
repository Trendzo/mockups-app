import { ProductCopy } from '../types/api';
import type { AiCopyField } from '../store/productDraft';

/**
 * Shape guard for the server's `copy` field (submission / bulk job / quick
 * mockups). Anything malformed is treated as "no copy" rather than trusted.
 */
export function toProductCopy(raw: unknown): ProductCopy | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const copy = { name: str(r.name), description: str(r.description), descriptionLong: str(r.descriptionLong) };
  return copy.name || copy.description || copy.descriptionLong ? copy : null;
}

/** Toast after images land in the wizard, worded by what the AI copy actually filled. */
export function aiCopyToast(imagesLabel: string, filled: AiCopyField[]): string {
  if (!filled.length) return `${imagesLabel} - add product details`;
  const hasName = filled.includes('name');
  const hasDesc = filled.includes('description') || filled.includes('descriptionLong');
  const what = hasName && hasDesc ? 'name & description' : hasName ? 'name' : 'description';
  return `${imagesLabel} - ${what} drafted by AI, review before publishing`;
}
