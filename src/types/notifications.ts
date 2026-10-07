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

/** Every tile the dashboard can show, in the order the web portal lists them (ids are the server's). */
export const DASHBOARD_TILES: { id: DashboardTile; label: string; hint: string }[] = [
  { id: 'sales', label: 'Sales chart', hint: 'Sales over the last week' },
  { id: 'orders', label: 'Orders snapshot', hint: 'New, to pack, shipped and returns' },
  { id: 'inventory', label: 'Inventory health', hint: 'Low and out-of-stock items' },
  { id: 'top_products', label: 'Top products', hint: 'What is selling best' },
  { id: 'recent_products', label: 'Recent products', hint: 'Latest items you added' },
  { id: 'compliance', label: 'Compliance reminders', hint: 'KYC, tax and document due dates' },
];

/**
 * GET/PUT /retailer/notification-prefs.
 *
 * PUT REPLACES the whole row: any field left out resets to its server default, so the app always
 * sends the full object it last read (see `prefsPayload`).
 */
export interface NotificationPrefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  dailyDigestEnabled: boolean;
  /**
   * The server stores a free string (its own default is 'en-IN'); the app offers en/hi/mr/ta. Kept as
   * the server sent it until the user picks a language.
   */
  language: NotificationLanguage | string;
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
