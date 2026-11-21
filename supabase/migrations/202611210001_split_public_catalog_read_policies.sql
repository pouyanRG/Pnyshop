-- Keep public reads independent from the admin-only is_admin() function.
drop policy if exists "Public can read active products" on public.products;
drop policy if exists "Admins can read all products" on public.products;

create policy "Public can read active products"
  on public.products for select to anon, authenticated
  using (is_active and status = 'published');
create policy "Admins can read all products"
  on public.products for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Public can read active brands" on public.brands;
drop policy if exists "Admins can read all brands" on public.brands;

create policy "Public can read active brands"
  on public.brands for select to anon, authenticated
  using (is_active);
create policy "Admins can read all brands"
  on public.brands for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Public can read active categories" on public.categories;
drop policy if exists "Admins can read all categories" on public.categories;

create policy "Public can read active categories"
  on public.categories for select to anon, authenticated
  using (is_active);
create policy "Admins can read all categories"
  on public.categories for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Public can read product images" on public.product_images;
drop policy if exists "Admins can read all product images" on public.product_images;

create policy "Public can read product images"
  on public.product_images for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products product
      where product.id = product_images.product_id
        and product.is_active
        and product.status = 'published'
    )
  );
create policy "Admins can read all product images"
  on public.product_images for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Public can read active variants" on public.product_variants;
drop policy if exists "Admins can read all variants" on public.product_variants;

create policy "Public can read active variants"
  on public.product_variants for select to anon, authenticated
  using (
    is_active
    and exists (
      select 1
      from public.products product
      where product.id = product_variants.product_id
        and product.is_active
        and product.status = 'published'
    )
  );
create policy "Admins can read all variants"
  on public.product_variants for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Users can read active coupons" on public.coupons;
drop policy if exists "Admins can read all coupons" on public.coupons;

create policy "Users can read active coupons"
  on public.coupons for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= current_date)
    and (ends_at is null or ends_at >= current_date)
    and (
      audience = 'all'
      or (
        (select auth.uid()) is not null
        and exists (
          select 1
          from public.profiles
          where profiles.id = (select auth.uid())
            and (
              (
                coupons.audience = 'newUsers'
                and profiles.created_at >= now() - make_interval(
                  days => coalesce(coupons.audience_days, 30)
                )
              )
              or (
                coupons.audience = 'oldUsers'
                and profiles.created_at <= now() - make_interval(
                  days => coalesce(coupons.audience_days, 365)
                )
              )
            )
        )
      )
    )
  );
create policy "Admins can read all coupons"
  on public.coupons for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Public can read storefront settings" on public.store_settings;
drop policy if exists "Admins can read all storefront settings" on public.store_settings;

create policy "Public can read storefront settings"
  on public.store_settings for select to anon, authenticated
  using (key in ('categoryTree', 'spotlightCards', 'slides', 'amazingTimer'));
create policy "Admins can read all storefront settings"
  on public.store_settings for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Public can read active site media" on public.site_media;
drop policy if exists "Admins can read all site media" on public.site_media;

create policy "Public can read active site media"
  on public.site_media for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );
create policy "Admins can read all site media"
  on public.site_media for select to authenticated
  using ((select public.is_admin()));
