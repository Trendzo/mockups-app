/** Retailer notification inbox (GET /retailer/inbox) + delivery preferences. */

export type InboxKind =
  | 'order'
  | 'refund'
  | 'kyc'
  | 'system'
  | 'issue'
  | 'payout'
  | 'promotion'
  | 'compliance';

export interface InboxItem {
  id: string;
  kind: InboxKind | string;
  title: string;
  body: string;
  /** Web-portal route the event points at, e.g. "/retailer/orders/ord_…". */
  deepLink?: string | null;
  readAt: string | null;
  createdAt: string;
}

export type NotificationLanguage = 'en' | 'hi' | 'mr' | 'ta';

export type DashboardTile =
  | 'sales'
  | 'orders'
  | 'inventory'
  | 'top_products'
  | 'recent_products'
  | 'compliance';

/** GET/PUT /retailer/notification-prefs */
export interface NotificationPrefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  dailyDigestEnabled: boolean;
  language: NotificationLanguage;
  dashboardTiles: DashboardTile[];
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  dailyDigestEnabled: false,
  language: 'en',
  dashboardTiles: ['sales', 'orders', 'inventory', 'top_products'],
};

export const LANGUAGE_LABEL: Record<NotificationLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
  ta: 'தமிழ்',
};

export const INBOX_ICON: Record<string, string> = {
  order: 'bag-handle-outline',
  refund: 'return-down-back-outline',
  kyc: 'shield-checkmark-outline',
  system: 'information-circle-outline',
  issue: 'alert-circle-outline',
  payout: 'wallet-outline',
  promotion: 'pricetag-outline',
  compliance: 'document-text-outline',
};
