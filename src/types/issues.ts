/**
 * Customer issues as the store sees them (GET /retailer/issues). One entity for
 * queries, complaints and disputes; every retailer-raised item is filed as a
 * `dispute` (the web portal does the same and presents all of them as "Disputes").
 */
import type { StatusTone } from '../components/StatusChip';

export type IssueKind = 'query' | 'complaint' | 'dispute';

/**
 * The server only writes open | requested_evidence | escalated | decided; the
 * `awaiting_*` / `resolved` / `closed` values exist in the web portal's union and
 * are tolerated so a future server change cannot crash a row.
 */
export type IssueStatus =
  | 'open'
  | 'requested_evidence'
  | 'escalated'
  | 'decided'
  | 'awaiting_consumer'
  | 'awaiting_retailer'
  | 'awaiting_admin'
  | 'resolved'
  | 'closed';

export type IssueDecision = 'refund' | 'fresh_delivery' | 'pickup' | 'no_refund' | 'split';

/** Whose move it is. `none` is only valid as a list filter / on a closed issue. */
export type AwaitingParty = 'admin' | 'retailer' | 'consumer' | 'none';

/** GET /retailer/issues row. */
export interface IssueRow {
  id: string;
  kind: IssueKind;
  storeId?: string;
  orderId: string | null;
  returnId: string | null;
  openedByActorType: 'consumer' | 'retailer' | 'admin' | 'delivery_agent' | 'system' | string;
  subject: string;
  description: string;
  evidence: string[];
  status: IssueStatus;
  awaitingParty: AwaitingParty;
  decision: IssueDecision | null;
  decisionNote: string | null;
  decidedAt: string | null;
  /** Money moved off (negative) or onto this store's payout by the decision. */
  payoutAdjustmentPaise: number | null;
  lastMessageAt: string;
  createdAt: string;
  closedAt: string | null;
}

export interface IssueMessage {
  id: string;
  senderType: 'consumer' | 'retailer' | 'admin' | 'system' | string;
  senderId: string;
  body: string;
  attachments: string[];
  at: string;
}

export interface IssueTransition {
  id: string;
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus;
  awaitingPartyTo: AwaitingParty | null;
  actorType: string;
  actorId: string;
  reason: string | null;
  at: string;
}

/** GET /retailer/issues/:id */
export interface IssueDetail extends IssueRow {
  messages: IssueMessage[];
  transitions: IssueTransition[];
}

/** Query string of GET /retailer/issues (limit 1-200, server default 100). */
export interface IssueFilters {
  status?: 'open' | 'requested_evidence' | 'decided' | 'escalated';
  awaitingParty?: AwaitingParty;
  kind?: IssueKind;
  orderId?: string;
  limit?: number;
}

/** POST /retailer/issues body. At least one of orderId / returnId is required. */
export interface CreateIssueInput {
  kind?: IssueKind;
  orderId?: string;
  returnId?: string;
  subject: string;
  description: string;
  evidence?: string[];
}

export const ISSUE_SUBJECT_MAX = 200;
export const ISSUE_DESCRIPTION_MAX = 5000;
export const ISSUE_MESSAGE_MAX = 5000;

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: 'Open', tone: 'warning' },
  requested_evidence: { label: 'Evidence requested', tone: 'pending' },
  escalated: { label: 'Escalated', tone: 'danger' },
  decided: { label: 'Decided', tone: 'success' },
  awaiting_consumer: { label: 'Awaiting customer', tone: 'pending' },
  awaiting_retailer: { label: 'Awaiting you', tone: 'warning' },
  awaiting_admin: { label: 'Awaiting Trendzo', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export function issueStatusMeta(status: string): { label: string; tone: StatusTone } {
  return (
    STATUS_META[status] ?? {
      label: status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      tone: 'neutral',
    }
  );
}

export const ISSUE_DECISION_LABEL: Record<IssueDecision, string> = {
  refund: 'Refund',
  fresh_delivery: 'Fresh delivery',
  pickup: 'Pickup',
  no_refund: 'No refund',
  split: 'Split',
};

export function issueDecisionLabel(d?: string | null): string {
  if (!d) return '—';
  return ISSUE_DECISION_LABEL[d as IssueDecision] ?? d.replace(/_/g, ' ');
}

export const AWAITING_LABEL: Record<AwaitingParty, string> = {
  admin: 'Trendzo',
  retailer: 'Your store',
  consumer: 'Customer',
  none: 'Nobody',
};

const FINISHED: string[] = ['decided', 'resolved', 'closed'];

/** An issue is finished once decided/resolved/closed — no one is awaited any more. */
export const isIssueFinished = (i: Pick<IssueRow, 'status'>): boolean => FINISHED.includes(i.status);

/** The ball is in the store's court (drives the "Needs your response" cue). */
export function needsRetailerResponse(i: Pick<IssueRow, 'status' | 'awaitingParty'>): boolean {
  if (isIssueFinished(i)) return false;
  return i.awaitingParty === 'retailer' || i.status === 'awaiting_retailer';
}

/** Message authors, as a person would say it. */
export const SENDER_LABEL: Record<string, string> = {
  consumer: 'Customer',
  retailer: 'Store',
  admin: 'Trendzo',
  system: 'System',
};
