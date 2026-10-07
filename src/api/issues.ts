import { http, req } from './request';
import type { CreateIssueInput, IssueDetail, IssueFilters, IssueRow } from '../types/issues';

/**
 * Customer issues / disputes — GET|POST /retailer/issues[/…].
 * Permissions: list + detail `disputes.view`, create `issues.create`,
 * reply + hand-back `disputes.respond`.
 */

/** Query string for GET /retailer/issues; unset filters are left out. */
export function issueListParams(f: IssueFilters = {}): Record<string, string | number> {
  const p: Record<string, string | number> = {};
  if (f.status) p.status = f.status;
  if (f.awaitingParty) p.awaitingParty = f.awaitingParty;
  if (f.kind) p.kind = f.kind;
  if (f.orderId) p.orderId = f.orderId;
  if (f.limit) p.limit = Math.min(200, Math.max(1, Math.floor(f.limit)));
  return p;
}

/** Most recently active first (server order). */
export async function listIssues(filters: IssueFilters = {}): Promise<IssueRow[]> {
  const params = issueListParams(filters);
  const data = await req<unknown>(() => http.get('/retailer/issues', { params }));
  return Array.isArray(data) ? (data as IssueRow[]) : [];
}

/** The issue with its message thread and status history. */
export async function getIssue(id: string): Promise<IssueDetail> {
  const d = await req<IssueDetail>(() => http.get(`/retailer/issues/${encodeURIComponent(id)}`));
  return { ...d, evidence: d.evidence ?? [], messages: d.messages ?? [], transitions: d.transitions ?? [] };
}

/**
 * Raise a dispute on an order (or a return). The web portal files both "Raise
 * dispute" and "Request refund" with kind `dispute`; so does this.
 */
export const createIssue = (input: CreateIssueInput) =>
  req<{ issueId: string }>(() =>
    http.post('/retailer/issues', {
      kind: input.kind ?? 'dispute',
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.returnId ? { returnId: input.returnId } : {}),
      subject: input.subject.trim(),
      description: input.description.trim(),
      evidence: input.evidence ?? [],
    }),
  );

/** Reply on the thread. `attachments` are already-uploaded photo URLs. */
export const postIssueMessage = (id: string, body: string, attachments: string[] = []) =>
  req<{ messageId: string }>(() =>
    http.post(`/retailer/issues/${encodeURIComponent(id)}/messages`, {
      body: body.trim(),
      attachments,
    }),
  );

/** Return the ball to Trendzo. 409 unless the issue is awaiting the store. */
export const handBackIssue = (id: string) =>
  req<{ id: string }>(() => http.post(`/retailer/issues/${encodeURIComponent(id)}/hand-back`, {}));
