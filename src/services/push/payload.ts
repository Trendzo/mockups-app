/**
 * Pure push-payload logic: FCM message -> normalised push -> screen to open.
 * No native imports; unit-tested.
 *
 * Payload convention (set by the backend when it sends to a retailer device):
 *   data.kind      inbox kind: order | refund | payout | kyc | system | issue | compliance | promotion
 *                  (new-order alerts: 'order', or one of NEW_ORDER_KINDS)
 *   data.deepLink  web-style path the event points at, e.g. "/retailer/orders/ord_..."
 *   data.orderId   optional; used when a deepLink is absent
 * Android channel: `orders` for new-order / order pushes, `general` for everything else.
 */
import { routeForDeepLink, RouteTarget } from '../../utils/orders';
import { ChannelId, ParsedPush, PushNavData, RemoteMessageLike } from './types';

export const CHANNEL_ORDERS: ChannelId = 'orders';
export const CHANNEL_GENERAL: ChannelId = 'general';

/** `kind` values that mean "a new order is waiting to be accepted". */
export const NEW_ORDER_KINDS = new Set([
  'new_order',
  'order_new',
  'order.new',
  'order_placed',
  'order.placed',
  'order_routing',
  'order.routing',
]);

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** First non-empty string among the given data keys. */
function pick(data: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = str(data[k]);
    if (v) return v;
  }
  return '';
}

/** Order pushes (incl. new-order alerts) ring on the loud channel. */
export function channelFor(kind: string, explicit?: string | null): ChannelId {
  if (explicit === CHANNEL_ORDERS || explicit === CHANNEL_GENERAL) return explicit;
  const k = kind.toLowerCase();
  if (NEW_ORDER_KINDS.has(k) || k === 'order' || /^order[._]/.test(k)) return CHANNEL_ORDERS;
  return CHANNEL_GENERAL;
}

/** Normalise any FCM message (or a notification's own data bag) to the app convention. */
export function parsePush(message: RemoteMessageLike | null | undefined): ParsedPush {
  const data = (message?.data ?? {}) as Record<string, unknown>;
  const kind = (pick(data, 'kind', 'type') || 'system').toLowerCase();
  const orderId = pick(data, 'orderId', 'order_id') || null;
  const rawLink = pick(data, 'deepLink', 'deeplink', 'link');
  const deepLink = rawLink || (orderId ? `/retailer/orders/${encodeURIComponent(orderId)}` : null);
  const title = str(message?.notification?.title) || pick(data, 'title');
  const body = str(message?.notification?.body) || pick(data, 'body', 'message');
  const explicitChannel = str(message?.notification?.android?.channelId) || pick(data, 'channelId', 'channel_id');
  const isNewOrder =
    NEW_ORDER_KINDS.has(kind) || (kind === 'order' && /\bnew order/i.test(`${title} ${body}`));
  return {
    kind,
    deepLink,
    orderId,
    title,
    body,
    channelId: channelFor(kind, explicitChannel || null),
    messageId: str(message?.messageId) || null,
    isNewOrder,
    hasNotificationBlock: !!(message?.notification && (message.notification.title || message.notification.body)),
  };
}

/** Where a tap on this push goes. Unknown or missing links land on the inbox so the tap is never wasted. */
export function targetForPush(nav: PushNavData | null | undefined): RouteTarget {
  const link =
    nav?.deepLink || (nav?.orderId ? `/retailer/orders/${encodeURIComponent(nav.orderId)}` : null);
  return routeForDeepLink(link) ?? { name: 'Notifications' };
}

/**
 * The data bag stored on a locally displayed notification (Notifee data values must be strings), so a tap
 * can be routed from either the FCM message or the local notification.
 */
export function navDataOf(p: Pick<ParsedPush, 'kind' | 'deepLink' | 'orderId'>): Record<string, string> {
  const out: Record<string, string> = { kind: p.kind };
  if (p.deepLink) out.deepLink = p.deepLink;
  if (p.orderId) out.orderId = p.orderId;
  return out;
}

/** Read nav data back from a tapped notification's (string-valued) data bag. */
export function navDataFrom(data: Record<string, unknown> | null | undefined): PushNavData {
  const d = data ?? {};
  return {
    kind: pick(d, 'kind', 'type') || undefined,
    deepLink: pick(d, 'deepLink', 'deeplink', 'link') || null,
    orderId: pick(d, 'orderId', 'order_id') || null,
  };
}

/** Notification for one freshly routed order seen by the poll. */
export function newOrderNotification(order: {
  id: string;
  itemCount: number;
  grandTotalLabel: string;
}): { id: string; title: string; body: string; data: Record<string, string> } {
  const n = order.itemCount;
  return {
    id: `order-new-${order.id}`,
    title: 'New order',
    body: `${n} item${n === 1 ? '' : 's'} · ${order.grandTotalLabel} — accept it now`,
    data: navDataOf({ kind: 'order.new', deepLink: `/retailer/orders/${encodeURIComponent(order.id)}`, orderId: order.id }),
  };
}

/** Notification when several orders landed between two polls. */
export function newOrdersSummaryNotification(count: number): {
  id: string;
  title: string;
  body: string;
  data: Record<string, string>;
} {
  return {
    id: 'order-new-batch',
    title: `${count} new orders`,
    body: 'Accept them now',
    data: navDataOf({ kind: 'order.new', deepLink: '/retailer/orders', orderId: null }),
  };
}
