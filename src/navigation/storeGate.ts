/**
 * The retailer app's gate: given the `/retailer/me` snapshot, which MODE the app runs in and
 * what the retailer may still do. Pure and dependency-free so RootNavigator, the banner,
 * the screens and the unit tests all agree.
 *
 * Rule source = the web portal (webprotal/src/lib/gate.ts `deriveGate`, GateNotice, the
 * store Status tab) checked against what the backend really enforces. The portal keeps a
 * blocked store INSIDE the portal behind a banner; the app now does the same, instead of
 * swapping the whole app for the "pending approval" screen.
 *
 * MODES
 *   pending     retailer not approved yet (pending_approval), or no store provisioned yet
 *               -> PendingApprovalScreen (+ Kyc), exactly as before.
 *   legal       store is operating (onboarding / active / paused) but the current Retailer
 *               Terms and/or Privacy Policy are not accepted -> TermsScreen only. Same gate
 *               as before for onboarding/active; it now also covers a PAUSED store, which
 *               trades again (the web shows the same modal regardless of lifecycle). Never
 *               shown to suspended / terminated / closed stores: they cannot go live, and a
 *               terminated account's accept POST is a 403, so the gate would be a trap.
 *   full        retailer active + store onboarding/active -> the whole app, no banner.
 *   restricted  retailer active + store paused/suspended/terminated, or account
 *               terminated/closed -> the whole app (initial route Main) with a banner that
 *               says why and points at StoreStatus / AccountStatus / Kyc.
 *
 * PER-STATE TABLE (account state wins over store state; closed wins over its own suspended
 * store, which the closure cascade creates).
 *
 *  state               who/what                          mode        banner CTA
 *  ------------------  --------------------------------  ----------  ------------------------
 *  retailer_pending    retailer.status = pending_approval pending     -
 *  no_store            retailer active, store missing     pending     -
 *  ready               store onboarding | active          full        -
 *  store_paused        store paused (self-serve/KYC)      restricted  Resume / Resubmit KYC
 *  store_suspended     store suspended by admin           restricted  Open status & appeal
 *  store_terminated    store terminated (account active)  restricted  Open status & appeal
 *  account_terminated  retailer.status = terminated       restricted  Open status & appeal
 *  account_closed      retailer.status = closed           restricted  Request reopen
 *
 *  abilities           viewOrders handleOrders counterBilling editCatalog readOnly appeal reopen
 *  ready                  yes        yes        active only     yes        no       -      -
 *  store_paused           yes        yes        yes (backend)   NO         no       -      -
 *  store_suspended        yes        yes (1)    no              NO         no       yes    -
 *  store_terminated       yes        no         no              NO         YES      yes    -
 *  account_terminated     yes        no         no              NO         YES      yes    -
 *  account_closed         NO (2)     no         no              NO         YES      no (3) yes
 *  pending / no_store     no         no         no              no         -        -      -
 *
 *  (1) The backend only checks the ACCOUNT (not the store) for order actions, so in-flight
 *      orders of a suspended store can still be finished; the web only hides the nav entry.
 *  (2) GET /retailer/orders answers 403 RetailerNotApproved for a closed account.
 *  (3) A closed account's store is suspended too, but that is the owner's own decision:
 *      nothing to contest. The AccountStatus thread stays open as a message channel
 *      (it follows the server's `canAppeal`), the CTA is "Request reopen".
 *
 *  Backend facts these rows encode: catalogue writes need store onboarding|active
 *  (assertCanPublish); POS selling needs store active|paused (create-pos-sale.ts);
 *  a terminated ACCOUNT is read-only for every non-GET except POST /account/appeal;
 *  appeals are open only for a suspended/terminated store; resume is owner-only
 *  (store.resume) and 409s when pauseReason === 'kyc_overdue' (lifts itself once KYC is
 *  approved); close-request needs change_requests.submit AND owner/manager.
 *
 * `readOnly` is the app's own stance (terminated + closed): hide write CTAs for store
 * settings, catalogue, billing, etc. Combine with the permission check: `can(key) && !readOnly`.
 */

export type AppMode = 'pending' | 'legal' | 'full' | 'restricted';

export type GateState =
  | 'retailer_pending'
  | 'no_store'
  | 'ready'
  | 'store_paused'
  | 'store_suspended'
  | 'store_terminated'
  | 'account_terminated'
  | 'account_closed';

/** Where a banner CTA goes (all registered routes). */
export type GateTarget = 'StoreStatus' | 'AccountStatus' | 'Kyc';

export interface GateBanner {
  tone: 'warning' | 'danger';
  title: string;
  message: string;
  cta: { label: string; target: GateTarget };
}

export type ResumeBlock = 'permission' | 'kyc_overdue' | null;

export interface GateAbilities {
  /** May open the Orders list / order detail (read). */
  viewOrders: boolean;
  /** May accept / pack / hand over / deliver in-flight orders. Combine with orders.* keys. */
  handleOrders: boolean;
  /**
   * The store's state allows counter sales. ALSO needs store.posBillingEnabled and the
   * pos.sell permission (the opt-in lives outside the lifecycle).
   */
  counterBilling: boolean;
  /** Catalogue create / edit / publish is allowed in this state. Combine with listings.*. */
  editCatalog: boolean;
  /** The state allows the retailer to contest it (suspended / terminated store or account). */
  appeal: boolean;
  /** The account is closed: a reopen request can be filed (owner / manager only server-side). */
  reopen: boolean;
  resume: {
    /** The store is paused, so a Resume control belongs on the screen at all. */
    available: boolean;
    /** Resume can actually be pressed: available, owner, and not a KYC pause. */
    allowed: boolean;
    /** Why `allowed` is false although `available` is true. */
    blockedBy: ResumeBlock;
  };
}

export interface StoreGate {
  mode: AppMode;
  state: GateState;
  /** The in-app banner; null unless mode === 'restricted' (or a legal gate over a paused store). */
  banner: GateBanner | null;
  /** Terminated / closed: no writes except the status actions (appeal, reopen). */
  readOnly: boolean;
  abilities: GateAbilities;
  legal: { terms: boolean; privacy: boolean };
}

/** Structural subset of `RetailerMe` (src/types/onboarding.ts) - keeps this file import-free. */
export interface GateMe {
  retailer?: { status?: string | null } | null;
  store?: { status?: string | null; pauseReason?: string | null } | null;
  termsAcceptanceRequired?: boolean;
  privacyAcceptanceRequired?: boolean;
  pendingAccountRequest?: 'account_deletion' | 'account_reopen' | null;
}

/** `usePermissions().can`; defaults to "everything allowed" (owner) when not supplied. */
export type CanCheck = (key: string) => boolean;

/** pauseReason stamped by the KYC auto-pause; only an admin / KYC approval lifts it. */
export const KYC_OVERDUE_PAUSE = 'kyc_overdue';

const NONE: Omit<GateAbilities, 'resume'> = {
  viewOrders: false,
  handleOrders: false,
  counterBilling: false,
  editCatalog: false,
  appeal: false,
  reopen: false,
};

const NO_RESUME: GateAbilities['resume'] = { available: false, allowed: false, blockedBy: null };

/** The fine-grained state; account state beats store state. */
export function gateState(me: GateMe | null | undefined): GateState {
  const account = me?.retailer?.status;
  if (!account) return 'retailer_pending';
  if (account === 'terminated') return 'account_terminated';
  if (account === 'closed') return 'account_closed';
  if (account !== 'active') return 'retailer_pending'; // pending_approval / anything unknown
  const store = me?.store?.status;
  if (!store) return 'no_store';
  if (store === 'onboarding' || store === 'active') return 'ready';
  if (store === 'paused') return 'store_paused';
  if (store === 'suspended') return 'store_suspended';
  if (store === 'terminated') return 'store_terminated';
  return 'no_store'; // a status this build does not know: do not open the app on a guess
}

export function storeGate(me: GateMe | null | undefined, can: CanCheck = () => true): StoreGate {
  const state = gateState(me);
  const legal = {
    terms: me?.termsAcceptanceRequired === true,
    privacy: me?.privacyAcceptanceRequired === true,
  };
  const kycOverdue = me?.store?.pauseReason === KYC_OVERDUE_PAUSE;
  const storeActive = me?.store?.status === 'active';

  let abilities: GateAbilities;
  let readOnly = false;
  let banner: GateBanner | null = null;

  switch (state) {
    case 'ready':
      abilities = {
        ...NONE,
        viewOrders: true,
        handleOrders: true,
        counterBilling: storeActive,
        editCatalog: true,
        resume: NO_RESUME,
      };
      break;

    case 'store_paused': {
      const canResume = can('store.resume');
      const blockedBy: ResumeBlock = kycOverdue ? 'kyc_overdue' : canResume ? null : 'permission';
      abilities = {
        ...NONE,
        viewOrders: true,
        handleOrders: true,
        counterBilling: true,
        resume: { available: true, allowed: blockedBy === null, blockedBy },
      };
      banner = pausedBanner(blockedBy);
      break;
    }

    case 'store_suspended':
      abilities = {
        ...NONE,
        viewOrders: true,
        handleOrders: true,
        appeal: true,
        resume: NO_RESUME,
      };
      banner = {
        tone: 'danger',
        title: 'Storefront suspended',
        message:
          'Trendzo has suspended your storefront, so customers cannot order. You can still finish orders in progress. ' +
          'Contest the decision or ask what is needed to restore it in the message thread.',
        cta: { label: 'Open status & appeal', target: 'AccountStatus' },
      };
      break;

    case 'store_terminated':
      readOnly = true;
      abilities = { ...NONE, viewOrders: true, appeal: true, resume: NO_RESUME };
      banner = {
        tone: 'danger',
        title: 'Storefront terminated - read-only',
        message:
          'Your storefront was terminated by Trendzo. You can still view your orders and records, but nothing can be created or changed. ' +
          'If you think this is a mistake, appeal it from the status page.',
        cta: { label: 'Open status & appeal', target: 'AccountStatus' },
      };
      break;

    case 'account_terminated':
      readOnly = true;
      abilities = { ...NONE, viewOrders: true, appeal: true, resume: NO_RESUME };
      banner = {
        tone: 'danger',
        title: 'Account terminated - read-only',
        message:
          'You can still view your orders, invoices and statements for your records, but nothing can be created or changed. ' +
          'If you think this is a mistake, appeal it from the status page - the thread goes straight to the Trendzo team.',
        cta: { label: 'Open status & appeal', target: 'AccountStatus' },
      };
      break;

    case 'account_closed': {
      readOnly = true;
      abilities = { ...NONE, reopen: true, resume: NO_RESUME };
      const pending = me?.pendingAccountRequest === 'account_reopen';
      banner = {
        tone: 'warning',
        title: pending ? 'Reopen request pending' : 'Account closed',
        message: pending
          ? "Your reopen request is with the Trendzo team. You'll regain full access once it's approved."
          : 'Your storefront is offline at your request. Your data is kept - request a reopen and an admin will restore everything.',
        cta: { label: pending ? 'View status' : 'Request reopen', target: 'AccountStatus' },
      };
      break;
    }

    default: // retailer_pending, no_store
      abilities = { ...NONE, resume: NO_RESUME };
  }

  const legalDue = legal.terms || legal.privacy;
  let mode: AppMode;
  if (state === 'retailer_pending' || state === 'no_store') mode = 'pending';
  else if (legalDue && (state === 'ready' || state === 'store_paused')) mode = 'legal';
  else if (state === 'ready') mode = 'full';
  else mode = 'restricted';

  return { mode, state, banner, readOnly, abilities, legal };
}

function pausedBanner(blockedBy: ResumeBlock): GateBanner {
  if (blockedBy === 'kyc_overdue') {
    return {
      tone: 'warning',
      title: 'Storefront paused for KYC',
      message:
        'Your storefront was paused because KYC re-verification is overdue. It resumes on its own once your KYC is approved. ' +
        'Orders in progress and counter billing keep working.',
      cta: { label: 'Resubmit KYC', target: 'Kyc' },
    };
  }
  const resume =
    blockedBy === 'permission'
      ? 'Only the store owner can resume it.'
      : 'Resume it whenever you are ready.';
  return {
    tone: 'warning',
    title: 'Storefront paused',
    message: `Customers cannot place new orders. You can still finish orders in progress and bill at the counter. ${resume}`,
    cta: {
      label: blockedBy === 'permission' ? 'View status' : 'Resume storefront',
      target: 'StoreStatus',
    },
  };
}
