-- فاز ۲ — توضیح برند (خواستهٔ بخش «برندها»)
-- این فایل بعد از 202611190002 اجرا می‌شود و فایل‌های قبلی را تغییر نمی‌دهد.
alter table public.brands
  add column if not exists description text not null default '';
