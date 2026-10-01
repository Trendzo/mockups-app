# Reply to App Review — paste into App Store Connect

**Before sending, replace the four `[FILL IN]` markers below.** Everything else
is verified against the shipped build. Also attach the screen recording, and
paste sections 2–7 into **App Review Information → Notes** for future
submissions, as Apple asked.

---

Thank you for the review. The requested information follows.

## 1. Screen recording

A screen recording captured on a physical iPhone running the latest iOS is
attached. It begins with launching the app from the home screen and walks
through the typical user flow: signing in, the registration/application flow,
the AI mockup generation core feature, catalog management, KYC document upload,
the account closure flow, and every system permission prompt the app presents.

Notes on the items listed in your message:

- **Account registration, login and deletion** — all three are shown. Account
  closure is covered in section 4 below.
- **Paid content, purchases or subscriptions** — the app contains none. There is
  no in-app purchase, no subscription, and no payment processing of any kind.
  See section 5.
- **User-generated content** — retailers upload photographs of their own stock
  and their own business documents. This content is private to the uploading
  retailer's authenticated account and is never visible to any other user. The
  app has no social feed, no public posting surface, and no way for one user to
  see another's content, so there is no in-app reporting or blocking mechanism —
  there is no other user's content to report. Moderation is performed by our
  team server-side; see section 7.
- **Permission prompts** — the recording shows the camera, photo library, and
  location prompts as they appear to a new user. The app requests no other
  permissions. It does **not** use App Tracking Transparency, does not access
  contacts, and performs no tracking; our privacy manifest declares
  `NSPrivacyTracking = false`.

## 2. Devices and operating systems tested

- iPhone 13 (iPhone14,5) — iOS 26.6 — physical device
- [FILL IN: every other physical device and iOS version actually tested]

## 3. App functions and target audience

**Trendzo Retailer is a business-to-business tool for registered apparel retail
businesses in India.** It is not a consumer shopping app. There is no public
storefront, and members of the general public cannot use it — every account is
manually reviewed and approved by our team before any core feature unlocks.

**The problem it solves.** A small or mid-size clothing retailer cannot afford
professional studio photography for every item they stock, yet needs
studio-quality imagery to list and sell those goods online. Commissioning a
photoshoot is slow and costly per garment, which puts good product imagery out
of reach for most independent retailers.

**How the app solves it.** The retailer photographs a garment in their own shop
using their phone — the front, and optionally the back, pattern, logo and label.
The app uploads these to the Trendzo backend, which generates studio-quality
product images and on-model renders from them. The retailer reviews the
results, then turns the accepted images into a catalog product with variants,
pricing and inventory.

**Supporting functions.** Business registration with administrator approval;
business KYC document verification; product catalog with variants, pricing,
inventory and HSN codes; a store online/offline control for order acceptance;
and a read-only view of earnings and payout schedule.

**Value provided.** It replaces a paid photoshoot with a phone photograph,
letting an independent retailer produce professional listing imagery in minutes
at a fraction of the cost.

## 4. Setup and access instructions

**Sign-in is required for all functionality.** There is no guest or browse-only
mode — the login screen is the only screen available when signed out.

**Demo account**

- Phone number: **9179621765**
- OTP: **1234**

This number is configured with a fixed OTP, so no live SMS is required. On the
login screen, keep the default "Phone" method, enter the 10-digit number after
the `+91` prefix, tap continue, then enter the 4-digit OTP. This account is
approved and active, with sample catalog data, so all core features are
reachable immediately.

**Reaching the main features.** The bottom bar has Home, Create, Catalog and
Profile.

- **Create** starts the AI mockup flow — the core feature. Select or photograph
  a garment, choose an output type (product shot, male model, female model),
  wait for generation, review the results, then complete the short product
  wizard to publish it to the catalog.
- **Catalog** lists published products and their variants and inventory.
- **Profile** holds KYC, change requests, account closure, and links to our
  Privacy Policy, Terms and Support.

**Sample files.** No special sample file is needed — any clear photograph of a
garment against a plain background works in the mockup flow.

**Account closure.** Account closure is initiated in-app at **Profile → Request
account closure**, without contacting support. We would like to be transparent
about how this works: confirming the request closes the account and suspends
the store, after which the user can no longer sign in and their catalog and
media are removed from active access, and personal account details are
anonymized. Because every account is a GST-registered business, we are required
under Indian tax law to retain invoices, orders, payout records and related
accounting data for a statutory period, so those records are preserved for
exactly as long as the law requires and for no other purpose. The retention
notice is shown in the app before the user confirms, and is documented at
https://api.trendzonow.com/account-deletion

## 5. External services, tools and platforms

| Service | Role in the app |
|---|---|
| Trendzo backend (`api.trendzonow.com`) | Our own first-party API. Handles accounts, applications, catalog, KYC, uploads and earnings. |
| **[FILL IN: AI provider name]** | Generates the product images and on-model mockups. Called server-side by our backend; the app itself only calls our own API. |
| **MSG91** | Sends and verifies the one-time password used for phone sign-in and registration. |
| **OpenStreetMap Nominatim** | Geocoding for the store-address picker, restricted to India. |
| **OpenStreetMap tile servers** | Map tiles displayed in the address picker. |
| **unpkg CDN** | Serves the Leaflet map library used by that address picker. |
| **Trendzo web portal** (hosted on Vercel) | Opened in Safari for full billing, order and payout statements. Not embedded in the app. |

**No payment processor is integrated in the app.** The app contains no StoreKit,
no in-app purchase, no subscription, and no third-party payment SDK. The
earnings screen is read-only and informational; the "request early payout"
control submits a request that our staff review, and no money moves within the
app. Merchant settlements are handled entirely outside the app.

**No tracking or analytics SDKs.** The app contains no advertising, analytics,
attribution or crash-reporting SDK — no Firebase, Crashlytics, Sentry,
Amplitude, Mixpanel, Segment, OneSignal or Google Analytics.

## 6. Regional differences

**The app is offered in India only, and behaves identically for every user
within that single region.** There are no region-gated features, no
locale-conditional content, and no country-based variation of any kind.

The app is built specifically for the Indian market: phone entry is fixed to the
+91 dial code with no country selector; a GSTIN is required to register; PAN and
IFSC are collected for tax identity and bank settlement; addresses use 6-digit
Indian pincodes and address search is restricted to India; prices are shown in
Indian rupees with Indian digit grouping; and TCS appears in the payout
breakdown. These are fixed characteristics of the product, not regional
switches.

## 7. Regulated industry and protected third-party material

**Regulated activity.** The app does not offer financial, lending, healthcare or
securities services. It collects business KYC and bank settlement details for a
single purpose: to verify a merchant's identity when onboarding them onto the
Trendzo platform, and to remit that merchant their own sales proceeds.

At registration we collect the legal business name, GSTIN, owner name, email and
phone, business address and pincode, and optionally PAN and bank account details.
Supporting documents are the GST certificate, PAN, address proof, bank proof and
a storefront photograph. A recurring verification cycle re-checks these; each
document is reviewed individually and may be rejected with a written reason
shown to the retailer. Sensitive fields — GSTIN, bank account, legal name and
address — cannot be edited freely after approval; changes go through an
administrator-reviewed request.

[FILL IN: if Trendzo holds any licence, registration or written authorization
relevant to handling merchant KYC or payouts, name and attach it here. If none
is required for this activity, state that instead.]

**Content moderation.** Although retailer content is private to each account,
we moderate it server-side: a listing can be taken down by an administrator with
a reason shown to the retailer, and an account can be paused, suspended or
terminated. The app provides an in-app appeal channel with attachments for a
retailer to contest any such action.

**Protected third-party material.** The app bundles no licensed third-party
media beyond nine example photographs used as visual guidance on the
configuration screen, which are sourced from Unsplash under its free-use
licence, and three open-licensed typefaces (Inter, Ionicons and Material
Community Icons). All other imagery in the app is either uploaded by the
retailer or generated for that retailer. Retailers grant us the right to process
the photographs they upload under our Terms of Service, and are responsible for
holding the rights to the goods they photograph.

---

# Checklist before you send

- [ ] Attach the screen recording (physical iPhone, latest iOS, starts at launch)
- [ ] Fill in **devices tested** (section 2)
- [ ] Fill in the **AI provider name** (section 5)
- [ ] Fill in or remove the **authorization** paragraph (section 7)
- [ ] **Verify the demo account 9179621765 is active with a store and sample
      catalog data** — if it is not, the reviewer sees only the pending-approval
      screen and will reject again
- [ ] Redeploy `legal-pages/account-deletion.html` — it has been corrected to
      describe the real flow ("Request account closure"). The live page at
      api.trendzonow.com must match the app before review
- [ ] Paste sections 2–7 into App Review Information → **Notes**
- [ ] If you upload a new build, bump `CURRENT_PROJECT_VERSION` (currently 4)

**Not mentioned in the reply, deliberately:** the POS Scan screen and the
Creations screen are registered in the navigator but unreachable in this build.
Do not film or describe them.
