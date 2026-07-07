# Trendzo Mockup — App Store Connect submission

The public URLs below become live after the nested `backend/backend` repository is deployed to Render.

## App Information

- Name: `Trendzo Mockup`
- Subtitle: `AI Catalog for Retailers`
- Primary category: `Business`
- Secondary category: `Graphics & Design`
- Content rights: Select **Yes**, the app displays third-party/user-provided content, and confirm that Trendzo has the necessary rights. The Terms require users to hold those rights.
- Age rating: Answer the questionnaire accurately. With the current retailer-only feature set and no objectionable content, the expected result is `4+`.
- Copyright: `2026 Trendzo`

## Version information

### Promotional text

Create polished fashion catalog visuals, manage products and inventory, and run retailer workflows from one app.

### Description

Trendzo Mockup is a catalog and retail operations app for approved fashion retailers.

Photograph garments and create AI-assisted catalog mockups, then review and organize the results for your product catalog. Manage products, variants, pricing and stock, scan items for point-of-sale workflows, and export inventory data when needed.

Key features:

- AI-assisted garment catalog mockups
- Product, variant and inventory management
- Garment and model photo capture or upload
- Catalog and inventory CSV export
- Point-of-sale scanning and retailer workflows
- Retailer onboarding, KYC and business profile management

An approved Trendzo retailer account is required. AI output should always be reviewed before publication.

### Keywords

`retail,catalog,AI mockup,inventory,POS,fashion,garment,product photos,store`

### URLs

- Support URL: `https://backend-qpmx.onrender.com/support`
- Marketing URL: `https://backend-qpmx.onrender.com/`
- Privacy Policy URL: `https://backend-qpmx.onrender.com/privacy`
- Account deletion information: `https://backend-qpmx.onrender.com/account-deletion`
- Terms of Service: `https://backend-qpmx.onrender.com/terms`

## App Review Information

- Sign-in required: **Yes**
- Demo phone: `9179621765`
- Demo OTP: `1234`

### Review notes

Trendzo Mockup is a retailer-only business app. A permanent App Review account is provided.

To sign in:

1. Keep the country set to India (+91).
2. Enter phone number 9179621765.
3. Tap Send OTP. No SMS is required for this App Review account.
4. Enter OTP 1234 and tap Verify & log in.

The demo account must remain active and contain sample catalog, inventory and AI mockup data. Main areas are Home, Catalog and Profile. Account deletion is available under Profile → Delete account. Privacy, Terms and Support links are available from both the login and profile screens.

AI generation can take up to two minutes depending on provider load. The app does not contain advertising, in-app purchases or subscriptions.

Add a real review contact first name, last name, phone number and monitored email address in App Store Connect.

## App Privacy answers

For every data type below select:

- Data linked to the user: **Yes**
- Used for tracking: **No**
- Purpose: **App Functionality**

Declare these data types:

- Contact Info: Name, Email Address, Phone Number, Physical Address
- Financial Info: Payment Info, Other Financial Info
- Location: Precise Location
- Purchases: Purchase History
- User Content: Photos or Videos, Customer Support, Other User Content
- Identifiers: User ID, Device ID
- Other Data: Other Data Types

Do not select advertising, third-party advertising, developer advertising, or cross-app tracking purposes.

## Pricing, availability and monetization

- Price: `Free`
- Availability: Select the countries where approved retailer onboarding and support are operational; start with `India` if that is currently the only supported market.
- In-App Purchases: None
- Subscriptions: None
- In-App Events: None required
- Game Center: Not used
- Promo Codes: Not applicable

## Screenshots and review checklist

- Upload screenshots for every device class App Store Connect requests. The target currently supports iPhone and iPad.
- Show Home, AI catalog setup/results, Catalog, Product/Inventory and Profile/POS where possible.
- Do not include placeholder data, debug menus, development server URLs or personal data in screenshots.
- Accessibility claims are optional; only claim features that have been tested.
- Select **No** for non-exempt encryption/export compliance because the app uses standard HTTPS and no proprietary encryption. `ITSAppUsesNonExemptEncryption` is already set to false.
- Confirm all five public URLs return HTTP 200 before submitting.
- Keep the Render service awake/reliable during review and do not delete or suspend the demo account.

## Render environment values required before deployment

```text
APP_REVIEW_PHONE=+919179621765
APP_REVIEW_OTP=1234
PUBLIC_APP_NAME=Trendzo Mockup
PUBLIC_COMPANY_NAME=Trendzo
PUBLIC_SUPPORT_EMAIL=trendzodevelopment@gmail.com
```

Also set `PUBLIC_SUPPORT_PHONE` and `PUBLIC_BUSINESS_ADDRESS` if they should appear on the legal pages. Replace the support email above if it is not the monitored Trendzo support address.
