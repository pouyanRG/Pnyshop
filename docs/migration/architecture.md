# Pnyshop architecture and migration status

## Target

- **Web:** Next.js App Router, React, strict TypeScript and the existing
  Persian RTL storefront styles.
- **Database and auth:** PostgreSQL and Supabase Auth. Keep privileged keys in
  server-only code; use row-level security for browser access.
- **Files:** Supabase Storage for managed product and storefront media.
- **Integrations:** Gemini and Resend remain server-side integrations.
- **Deployment:** Vercel is configured by the existing project structure;
  deployment status has not been verified.

## Current implementation

- `/` renders the existing storefront markup and styles through Next.js.
- `/login` uses one email-only Supabase OTP flow for both existing and new
  users. The eight-digit code is verified with `verifyOtp` and is not stored in
  the browser; the email and resend deadline are kept in `sessionStorage` so a
  refresh preserves the verification step and its 45-second cooldown.
  Authenticated users are redirected server-side. Admins must complete TOTP
  MFA before the admin route or admin-protected row-level-security policies
  allow access.
- `/login` and the storefront share one theme hook. The root layout applies the
  saved light/dark theme before rendering to avoid a theme flash; an unset
  preference defaults to light.
- `/profile` reads the authenticated user's profile and orders server-side,
  allows editing non-sensitive profile fields, and keeps email, wallet balance
  and points read-only. Profile updates are subject to the database grants and
  row-level security policies.
- `/product?id=<numeric-id>` reads an active catalog product and related
  products from Supabase; signed-in users can update their cart and wishlist.
- `/cart` requires authentication, reads the user's JSONB cart and current
  active product prices/stock from Supabase, and persists cart edits through
  the user's row-level-security-protected profile.
- The new cart intentionally does not submit payment: the real payment gateway
  is not configured. Its payment control stays disabled rather than simulating
  checkout success. The home page's mobile cart link points to `/cart`.
- `/checkout` requires authentication, loads the JSONB cart and active catalog,
  validates coupon and shipping inputs, and calls the atomic
  `create_checkout_order` database function.
- `/admin` is protected by Supabase `is_admin()` and provides product, coupon,
  order-status and audit-log management against RLS-protected tables.
  `/admin/media` additionally manages the storefront appearance: the
  single-row `site_settings` (logo, favicon, contact details, social links,
  footer texts, amazing-timer window and product-strip configuration) and the
  `site_media` placements (hero slider, banners, spotlight and other slots).
  Public reads of active media and settings are allowed by RLS; writes require
  an admin session with `aal2`.
- `/` keeps the legacy storefront shell but renders its content from Supabase:
  the logo, favicon, footer texts and social links come from `site_settings`;
  the hero slider, banners, spotlight and extra category circles come from
  `site_media`; the category circles and the amazing/product strips come from
  the active `categories` and `products` rows. The search-results overlay
  loads the published catalog in the browser and supports text search,
  category/mode selection, brand/color/price/rating filters, sorting, chunked
  rendering, wishlist toggles and add-to-cart.
- `/ai` provides the Gemini-backed storefront assistant through a server-only
  Next.js API route; it does not expose the Gemini key to the browser.
- Supabase browser, server and privileged clients are defined under
  `src/lib/supabase/`.
- The existing multi-page storefront uses `Js/supabase-bridge.js` to keep its
  current page behavior while routing authentication and data access through
  Supabase Auth and PostgREST.
- The browser receives only the Supabase URL and publishable key from
  `/api/public-config`; the secret key remains server-only.
- `supabase/migrations/202611180001_initial_schema.sql` defines profiles,
  roles, products, coupons, orders, storefront settings, audit logs, OTP and
  rate-limit tables with row-level security.
- Checkout uses the `create_checkout_order` database function to price items
  from the catalog and insert pending orders atomically. No client-side action
  can mark an order paid. An authorized admin or a verified payment-provider
  callback must confirm payment; that transition rechecks inventory and coupon
  limits atomically. A real payment provider is not configured yet, and the
  cart is not cleared automatically.
- Checkout, admin, AI and remaining legacy flows have not yet been ported into
  the Next.js application. The home page account link points to `/profile`;
  product search and some product-card behavior remain legacy/incomplete.
- The catalog storage bucket is private and admin-only. Public storefront media
  must be served through an explicitly designed public asset path or signed URL.
- Upstash Redis is not currently used; the application does not yet have a
  cache or transient-data requirement that justifies an additional dependency.

## Verification and blockers

- Auth behavior depends on Supabase project settings that are not changed by
  local code. Enable the email provider, set the OTP length to eight, and use
  `supabase/templates/confirm-signup.html` for **Confirm signup** and
  `supabase/templates/magic-link.html` for **Magic Link**. Both templates must
  display `{{ .Token }}` and omit `{{ .ConfirmationURL }}` so the email contains
  a code, not a sign-in link. Configure the project's dedicated trusted SMTP
  sender and server-side Auth rate limits in Supabase; the SMTP configuration
  cannot be verified or changed by this codebase.
  CAPTCHA is intentionally not enabled; the browser cooldown is only a UX
  guard, not a substitute for Supabase-side rate limits.
- The login UI uses Supabase SSR browser cookies. Moving auth exchange to
  server-managed `HttpOnly` cookies and recording terms acceptance/version
  server-side remain API tasks.
- Apply `supabase/migrations/202611190001_require_admin_mfa.sql` to enforce
  `aal2` inside `is_admin()` and all RLS policies that rely on it. The admin
  route guides authorized admins through TOTP enrollment and challenge.
- `/checkout`, `/admin`, `/ai`, `/cart` and `/product` are implemented in the
  Next.js App Router. Live Supabase reads and writes remain blocked until the
  migration is applied and the configured project URL/database are reachable.
- `/ai` has a server-only Gemini API route, but `GEMINI_API_KEY` is currently
  empty or unavailable in the local environment.
- Supabase Auth health responds successfully using the configured public
  project URL.
- The `products` REST endpoint is not available yet (HTTP 404), so the schema
  migration has not been applied.
- The new login and profile routes build and render, but live profile/order
  reads, profile updates and authenticated flows depend on the Supabase schema
  migration being applied; they have not been verified against live data.
- The configured PostgreSQL connection hostname could not be resolved from
  this environment. No schema writes were attempted.
- No production deployment or end-to-end application behavior has been
  verified. Continue with the migration only after the configured database
  connection is reachable and the schema is applied.
