# Granting admin access

## How an admin is defined

There is **no** hard-coded admin email, environment variable, or sign-up flag.
An admin is a row in `public.user_roles`:

```sql
user_id uuid references auth.users(id),  -- the account's UID, not its email
role    text check (role in ('admin'))
```

`src/app/admin/page.tsx` checks three things, in order:

1. A valid Supabase session (`supabase.auth.getUser()`).
2. A `user_roles` row with `role = 'admin'` for that user.
3. `aal2` (TOTP MFA) for the session, then `public.is_admin()` via RPC.

`public.is_admin()` (created in `202611180001_initial_schema.sql` and tightened
in `202611190001_require_admin_mfa.sql`) itself requires both the role row **and**
`auth.jwt() ->> 'aal' = 'aal2'`, so all admin RLS policies inherit the MFA
requirement. An ordinary authenticated user cannot grant themselves the role:
`user_roles` has RLS enabled with only a `SELECT` policy, no `INSERT` policy.

## One-time setup

1. **Apply the migrations in order** (SQL Editor or `supabase db push`):
   - `supabase/migrations/202611180001_initial_schema.sql`
   - `supabase/migrations/202611190001_require_admin_mfa.sql`
   - `supabase/migrations/202611190002_admin_catalog_media.sql`
   - `supabase/migrations/202611190003_brand_description.sql`
   - `supabase/migrations/202611190004_site_appearance.sql`

   Without them `user_roles`, `products`, `coupons`, `orders`, `audit_logs` and
   `is_admin()` do not exist, and `/admin` throws on its first query. The third
   migration adds the catalog/media tables (`brands`, `categories`,
   `product_images`, `product_variants`, `site_media`, `site_settings`), the
   `pnyshop-media` public storage bucket, and variant-aware checkout functions.
   The fourth migration adds the brand `description` column used by the brand
   manager. The fifth migration adds the storefront appearance columns to the
   single-row `site_settings` table: the amazing-offer timer (title, active
   flag, start/end), the product strip (title, mode, limit) and the footer
   about/copyright texts.

2. **Configure the environment.** Copy `.env.example` to `.env.local` and fill in
   at least `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   and `SUPABASE_SECRET_KEY`. Without these, `src/lib/supabase/env.ts` throws
   `Missing required environment variable: SUPABASE_URL` and `/api/public-config`
   returns 500.

3. **Configure Supabase Auth** for the email OTP flow: enable the email provider,
   set the OTP length to 8, use `supabase/templates/confirm-signup.html` for
   **Confirm signup** and `supabase/templates/magic-link.html` for **Magic Link**
   (both must render `{{ .Token }}`), and configure SMTP. `/login` is OTP-only;
   accounts created there have no password.

4. **Sign in once** at `/login` with the intended admin email so the row exists in
   `auth.users`, then find its UID:

   ```sql
   select id, email from auth.users where email = 'admin@example.com';
   ```

5. **Grant the role** in the Supabase SQL Editor (runs with elevated privileges;
   do not expose the secret key to the browser):

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin'
   from auth.users
   where email = 'admin@example.com'
   on conflict (user_id, role) do nothing;

   -- Verify:
   select * from public.user_roles where role = 'admin';

   -- Revoke later, if needed:
   -- delete from public.user_roles
   -- where user_id = (select id from auth.users where email = 'admin@example.com')
   --   and role = 'admin';
   ```

6. **Enroll MFA.** Open `/admin/mfa` while signed in as that user, scan the TOTP
   QR code with an authenticator app, and verify the 6-digit code. This upgrades
   the session to `aal2`; `/admin` redirects here automatically when the session
   is still `aal1`.

7. Open `/admin`. Signed-in users without the role (or without `aal2` after the
   RPC check) are sent to `/`, not back to `/login`, to avoid a redirect loop.

## Image uploads (phase 1)

Product, banner and logo images are uploaded through the shared
`ImageUploader` component, which posts the file to the server-side route
`/api/admin/media`. The route re-checks the admin role **and** `aal2`,
validates the file type (JPG/PNG/WebP/AVIF) and size (max 8 MB), applies a
rate limit, and only then writes to the public `pnyshop-media` bucket with the
service role. Deleting an image uses `DELETE /api/admin/media` with the stored
object path.

The legacy ImgBB route `api/upload-image.js` was removed; `IMGBB_API_KEY` is no
longer used. Keep `SUPABASE_SECRET_KEY` server-side only.

## Storefront appearance (phase 3)

`/admin/media` manages the public storefront look and is available to admins
with `aal2`:

- **General settings** — logo, favicon, phone, email, address, social links and
  the footer about/copyright texts. These write the single `site_settings`
  row (`id = 1`) through server actions that re-check `is_admin()`.
- **Amazing timer** — title, active flag and optional start/end window for the
  countdown on the home page.
- **Product strip** — title, selection mode (`newest`, `bestseller`,
  `discount`) and item limit (1–24). The home page reads active catalog
  products with this configuration.
- **Site media** — every image is stored in `site_media` under a placement
  (`hero`, `banner_r1`…`banner_r4`, `spotlight`, `category_circle`,
  `product_strip`, `amazing_timer`, `other`), with an optional mobile image,
  link, title, sort order, active flag and display window. Uploads go through
  the same `/api/admin/media` route; deleting a media row also removes its
  files from the public `pnyshop-media` bucket.

The public can read active media and settings through the row-level-security
policies from `202611190002_admin_catalog_media.sql`; writes stay
admin-only.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Missing required environment variable: SUPABASE_URL` | `.env.local` is missing or empty |
| `/api/public-config` → 500 | Same as above |
| `relation "public.user_roles" does not exist` / `function is_admin()` error | Migrations not applied |
| `ERR_TOO_MANY_REDIRECTS` between `/admin` and `/login` | Fixed in `src/app/admin/page.tsx`; was caused by redirecting a signed-in non-admin to `/login?next=/admin` |
| Redirected to `/admin/mfa` forever | TOTP factor not verified; session is still `aal1` |
| Login code never arrives | Supabase SMTP / email templates / 8-digit OTP not configured |
| `admin.html` password login fails | Legacy static page; use `/admin`. It calls `signInWithPassword`, but accounts are created with OTP only |

Keep `supabase/.temp/` and any `.env*` files out of version control; the secret
key belongs in server-side code (`src/lib/supabase/admin.ts`) only.
