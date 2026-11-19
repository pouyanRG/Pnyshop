-- =====================================================================
-- فاز ۳ — تنظیمات ظاهر سایت
-- افزودن فیلدهای تایمر شگفت‌انگیز، نوار محصولات و متن‌های فوتر به
-- جدول تک‌ردیفی site_settings. سیاست‌های RLS این جدول از مهاجرت
-- 202611190002 پوشش عمومی خواندن و نوشتن فقط برای ادمین را نگه
-- می‌دارند و نیازی به تغییر ندارند.
-- =====================================================================

alter table public.site_settings
  add column if not exists about_text text not null default '',
  add column if not exists copyright_text text not null default '',
  add column if not exists amazing_timer_title text not null default 'قسطی شگفت',
  add column if not exists amazing_timer_is_active boolean not null default true,
  add column if not exists amazing_timer_starts_at timestamptz,
  add column if not exists amazing_timer_ends_at timestamptz,
  add column if not exists product_strip_title text not null default 'جدیدترین محصولات',
  add column if not exists product_strip_mode text not null default 'newest',
  add column if not exists product_strip_limit integer not null default 12;

alter table public.site_settings
  drop constraint if exists site_settings_product_strip_mode_check;
alter table public.site_settings
  add constraint site_settings_product_strip_mode_check
  check (product_strip_mode in ('newest', 'bestseller', 'discount'));

alter table public.site_settings
  drop constraint if exists site_settings_product_strip_limit_check;
alter table public.site_settings
  add constraint site_settings_product_strip_limit_check
  check (product_strip_limit between 1 and 24);

alter table public.site_settings
  drop constraint if exists site_settings_amazing_timer_range_check;
alter table public.site_settings
  add constraint site_settings_amazing_timer_range_check
  check (
    amazing_timer_ends_at is null
    or amazing_timer_starts_at is null
    or amazing_timer_ends_at >= amazing_timer_starts_at
  );

-- مقادیر پیش‌فرض ردیف تک‌ردیفی (بدون بازنویسی مقادیر قابل‌تنظیم فعلی)
update public.site_settings
set
  about_text = coalesce(nullif(about_text, ''), 'فروشگاه اینترنتی Pnyshop مرجع تخصصی نقد و بررسی و فروش اینترنتی کالا در ایران. با رعایت جدیدترین اصول معماری رابط کاربری.'),
  copyright_text = coalesce(nullif(copyright_text, ''), '© ۱۴۰۵ تمامی حقوق این سایت محفوظ می‌باشد.'),
  amazing_timer_title = coalesce(nullif(amazing_timer_title, ''), 'قسطی شگفت'),
  product_strip_title = coalesce(nullif(product_strip_title, ''), 'جدیدترین محصولات')
where id = 1;
