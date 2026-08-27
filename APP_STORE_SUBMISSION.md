# Trendzo Retailer — App Store & Google Play submission

Store name: **Trendzo Retailer**. Bundle ID (iOS) is `com.trendzo.retailer`; the Android package name is `com.trendzomockup`. The public URLs below are served from the live API host.

## App identity

- Store / display name: `Trendzo Retailer`
- iOS bundle identifier: `com.trendzo.retailer`
- Android package name: `com.trendzomockup`
- Internal RN module name: `TrendzoMockup` (registration key — do not change)
- Subtitle / short tagline: `AI Catalog for Retailers`
- Primary category: `Business`
- Secondary category: `Graphics & Design`
- Content rights: The app displays third-party/user-provided content; confirm Trendzo has the necessary rights. The Terms require users to hold those rights.
- Copyright: `2026 Trendzo`
- Default language: English (United States) – en-US

## Store listing copy

### Promotional / short text

Create polished fashion catalog visuals, manage products and inventory, and run retailer workflows from one app.

Google Play short description (≤80 chars): `AI catalog & retail operations for approved fashion retailers.`

### Full description

Trendzo Retailer is a catalog and retail operations app for approved fashion retailers.

Photograph garments and create AI-assisted catalog mockups, then review and organize the results for your product catalog. Manage products, variants, pricing and stock, scan items for point-of-sale workflows, and export inventory data when needed.

Key features:

- AI-assisted garment catalog mockups
- Product, variant and inventory management
- Garment and model photo capture or upload
- Catalog and inventory CSV export
- Point-of-sale scanning and retailer workflows
- Retailer onboarding, KYC and business profile management

An approved Trendzo retailer account is required. AI output should always be reviewed before publication.

### Keywords (App Store)

`retail,catalog,AI mockup,inventory,POS,fashion,garment,product photos,store`

## Public URLs

Verified against `src/config/legal.ts`. Confirm all five return HTTP 200 before submitting.

- Support URL: `https://api.trendzonow.com/support`
- Marketing URL: `https://api.trendzonow.com/`
- Privacy Policy URL: `https://api.trendzonow.com/privacy/retailer`
- Account deletion information: `https://api.trendzonow.com/account-deletion`
- Terms of Service: `https://api.trendzonow.com/terms`

## App Review / demo access (both stores)

- Sign-in required: **Yes** (all functionality is behind login)
- Demo phone: `9179621765`
- Demo OTP: `1234`

### Review notes

Trendzo Retailer is a retailer-only business app. A permanent review account is provided.

To sign in (standard MSG91 phone-OTP; this number has a fixed OTP configured on MSG91, so no live SMS is needed):

1. Keep the country set to India (+91).
2. Enter phone number 9179621765.
3. Tap Send OTP.
4. Enter OTP 1234 and tap Verify & log in.

The demo account must remain active and contain sample catalog, inventory and AI mockup data. Main areas are Home, Catalog and Profile. Account deletion is available under Profile → Delete account. Privacy, Terms and Support links are available from both the login and profile screens.

AI generation can take up to two minutes depending on provider load. The app does not contain advertising, in-app purchases or subscriptions.

- App Store Connect: add a real review contact first name, last name, phone number and monitored email address.
- Google Play: enter the same credentials under **App access → All functionality restricted**, with these step-by-step instructions.

### Guideline 2.1 "Information Needed" — Notes field template

Apple's generic 2.1 request asks for 7 specific items. Reply in the **Resolution Center** thread (attachments allowed there — attach the screen recording directly) and also paste an updated version of this block into **App Review Information → Notes** so future submissions don't get flagged for the same reason.

```
1. Screen recording (record on a physical iPhone, latest iOS, screen only — no
   external camera capture):
   - Launch the app cold.
   - Sign in with the phone-OTP flow below (shows the only login flow the app has).
   - Home → start a new AI garment mockup: trigger the camera-permission prompt,
     photograph/upload a garment, run generation, review the result.
   - Photo library prompt: save a generated mockup, or upload from library.
   - Catalog: browse/organize generated mockups into the product catalog.
   - Product/Inventory: create or edit a product, variant, price, stock count.
   - POS: scan a product (barcode/QR) to show the point-of-sale flow.
   - Location prompt: Profile/store-address screen ("detect store address on map").
   - Profile → KYC: open the KYC screen and show a document upload.
   - Profile → Delete account: show the full account-deletion flow end to end.
   The app has no in-app purchases, subscriptions, or public user-generated
   content (catalog content is private to the retailer's own account, not
   shared/visible to other users), so those sections don't apply.

2. Devices/OS tested before submission:
   [FILL IN — e.g. "iPhone 14 Pro, iOS 17.x; iPhone SE (3rd gen), iOS 17.x;
   iPad 10th gen, iPadOS 17.x" — list what was actually tested via TestFlight]

3. App function & target audience:
   Trendzo Retailer is a B2B catalog and retail-operations tool for approved
   fashion retailers (not a consumer app). It solves the problem of retailers
   needing professional product photography without a studio: retailers
   photograph garments and the app generates AI-assisted catalog mockups,
   which they review before publishing. Beyond catalog generation, it unifies
   product/variant/inventory management, POS scanning, and retailer
   onboarding/KYC in one app. Target audience: verified fashion retail
   businesses and their staff, 18+.

4. Setup / access instructions:
   Sign-in is required for all functionality. Use the demo account below —
   country fixed to India (+91), phone 9179621765, tap Send OTP, enter fixed
   OTP 1234, tap Verify & log in. This is a real MSG91 phone-OTP flow with a
   fixed OTP configured on the number, so no live SMS is needed. The demo
   account is pre-loaded with sample catalog, inventory, AI mockup and KYC
   data. Main areas: Home, Catalog, Profile.

5. External services used:
   - MSG91 — phone number OTP delivery/verification for login
   - [FILL IN — name of the AI image-generation provider used for catalog
     mockups, e.g. OpenAI / Google Gemini / Stability / other]
   - AWS (EC2 + CloudFront) — backend API hosting
   - Vercel — retailer web portal (billing/payouts/orders, linked from Profile)
   - [FILL IN — name of the payment/payout processor if retailer payouts are
     settled through a third party, e.g. Razorpay / other]

6. Regional differences:
   The app currently operates in India only. The phone-OTP login defaults to
   +91, and retailer KYC/payout onboarding is configured for Indian banking
   and compliance requirements. There are no other active regions; App Store
   availability is limited to India accordingly.

7. Regulated industry / authorization documentation:
   The app collects KYC documents and financial/payout information as part of
   verifying fashion retailer businesses before they can transact through the
   platform. [FILL IN — attach in the Resolution Center reply, not this text
   field: (a) Trendzo's business registration/incorporation document, and
   (b) proof of the payment/payout processor relationship named in item 5 —
   e.g. a signed partner/merchant agreement or dashboard confirmation.]
```

The bracketed `[FILL IN]` items need real values before this is sent — the AI provider and payout processor are configured in the backend, not this client repo, so confirm the exact names there.

## Data collection

The app collects the following, all **linked to the user**, used for **app functionality only**, and **not used for tracking / advertising**:

- Contact Info: Name, Email Address, Phone Number, Physical Address
- Financial Info: Payment Info, Other Financial Info
- Location: Precise Location
- Purchases: Purchase History
- User Content: Photos or Videos, Customer Support, Other User Content
- Identifiers: User ID, Device ID
- Other Data: Other Data Types

Do not select advertising, third-party advertising, developer advertising, or cross-app tracking.

- App Store Connect (App Privacy): for each type set *Data linked to the user* = **Yes**, *Used for tracking* = **No**, purpose = **App Functionality**.
- Google Play (Data safety): mark each type as *collected*, *linked to the user*, **not** used for tracking, purpose *App functionality*. Because payment info and KYC are collected, also complete the financial-features declaration.

## Pricing & monetization

- Price: `Free`
- In-App Purchases / Subscriptions: None
- Availability: Select the countries where approved retailer onboarding and support are operational; start with `India` if that is currently the only supported market.
- App Store extras (In-App Events, Game Center, Promo Codes): not used.

## App Store Connect specifics

- Screenshots: upload for every device class App Store Connect requests (currently iPhone and iPad). Show Home, AI catalog setup/results, Catalog, Product/Inventory and Profile/POS where possible.
- Encryption / export compliance: select **No** for non-exempt encryption. The app uses standard HTTPS only; `ITSAppUsesNonExemptEncryption` is already set to false in Info.plist.
- Age rating: answer the questionnaire accurately. Expected result with the current retailer-only feature set is `4+`.
- Signing: the iOS bundle ID is `com.trendzo.retailer` (the leftover `com.tiffsy.*` prefix was removed). Register/confirm the App ID and provisioning profile for it (team `3LCA4AA483`); a record created under any other bundle ID cannot be reused.

## Google Play Console specifics

### Create app form

- App name: `Trendzo Retailer`
- Package name: `com.trendzomockup` (permanent once created — must match the uploaded `.aab`)
- Default language: English (United States) – en-US
- App or game: **App**
- Free or paid: **Free**
- Declarations: confirm Developer Program Policies **and** US export laws.

### Required before publishing

- Store listing: app name, short description (above), full description, app icon (512×512), feature graphic (1024×500), and at least 2 phone screenshots.
- Privacy Policy URL (must be live): `https://api.trendzonow.com/privacy/retailer`
- App access: **All functionality restricted** + the demo login and instructions above.
- Ads: **No**.
- Content rating: complete the IARC questionnaire (expected *Everyone*).
- Target audience: 18+ (retailer/business app, not directed at children).
- Data safety form: as mapped above.
- Target API level: the uploaded `.aab` must target the current Google minimum (Android 14 / API 34 or higher) or the upload will be rejected.

## Screenshot / review checklist

- Do not include placeholder data, debug menus, development server URLs or personal data in screenshots.
- Accessibility claims are optional; only claim features that have been tested.
- Confirm all five public URLs return HTTP 200 before submitting.
- Keep the Render service awake/reliable during review and do not delete or suspend the demo account.

## Render environment values required before deployment

```text
PUBLIC_APP_NAME=Trendzo Retailer
PUBLIC_COMPANY_NAME=Trendzo
PUBLIC_SUPPORT_EMAIL=trendzodevelopment@gmail.com
```

Also set `PUBLIC_SUPPORT_PHONE` and `PUBLIC_BUSINESS_ADDRESS` if they should appear on the legal pages. Replace the support email above if it is not the monitored Trendzo support address.
