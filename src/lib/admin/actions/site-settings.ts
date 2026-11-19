"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRODUCT_STRIP_MODES, type SiteSettingsInput } from "@/types/admin";
import type { ProductStripMode } from "@/types/database";
import { requireAdmin } from "../require-admin";
import { writeAudit } from "../audit";
import { asNumber, asString, hasFieldErrors, type FieldErrors } from "../validation";

export type SiteSettingsResult = {
  ok: boolean;
  message: string;
  fieldErrors?: FieldErrors;
};

type NormalizedSiteSettings = {
  logo_url: string | null;
  favicon_url: string | null;
  phone: string;
  email: string;
  address: string;
  instagram_url: string;
  telegram_url: string;
  whatsapp_url: string;
  twitter_url: string;
  aparat_url: string;
  about_text: string;
  copyright_text: string;
  amazing_timer_title: string;
  amazing_timer_is_active: boolean;
  amazing_timer_starts_at: string | null;
  amazing_timer_ends_at: string | null;
  product_strip_title: string;
  product_strip_mode: ProductStripMode;
  product_strip_limit: number;
};

const STRIP_MODES = new Set<string>(PRODUCT_STRIP_MODES);

function optionalDate(
  value: unknown,
  field: string,
  errors: FieldErrors,
): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    errors[field] = "تاریخ معتبر نیست.";
    return null;
  }
  return parsed.toISOString();
}

function checkLength(
  value: unknown,
  field: string,
  max: number,
  errors: FieldErrors,
  label: string,
) {
  if (asString(value).length > max) {
    errors[field] = `${label} حداکثر ${max.toLocaleString("fa-IR")} حرف می‌تواند باشد.`;
  }
}

function normalize(input: SiteSettingsInput): {
  values: NormalizedSiteSettings | null;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};

  const email = asString(input.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "ایمیل معتبر نیست.";
  }

  const limit = asNumber(input.product_strip_limit);
  if (limit === null || !Number.isInteger(limit) || limit < 1 || limit > 24) {
    errors.product_strip_limit = "تعداد محصولات نوار باید عددی بین ۱ تا ۲۴ باشد.";
  }

  const mode = asString(input.product_strip_mode);
  if (!STRIP_MODES.has(mode)) {
    errors.product_strip_mode = "حالت نوار محصولات معتبر نیست.";
  }

  const startsAt = optionalDate(
    input.amazing_timer_starts_at,
    "amazing_timer_starts_at",
    errors,
  );
  const endsAt = optionalDate(
    input.amazing_timer_ends_at,
    "amazing_timer_ends_at",
    errors,
  );
  if (startsAt && endsAt && endsAt < startsAt) {
    errors.amazing_timer_ends_at = "پایان بازهٔ تایمر باید بعد از آغاز باشد.";
  }

  checkLength(input.phone, "phone", 40, errors, "شمارهٔ تماس");
  checkLength(input.address, "address", 400, errors, "آدرس");
  checkLength(input.instagram_url, "instagram_url", 300, errors, "لینک اینستاگرام");
  checkLength(input.telegram_url, "telegram_url", 300, errors, "لینک تلگرام");
  checkLength(input.whatsapp_url, "whatsapp_url", 300, errors, "لینک واتساپ");
  checkLength(input.twitter_url, "twitter_url", 300, errors, "لینک توییتر");
  checkLength(input.aparat_url, "aparat_url", 300, errors, "لینک آپارات");
  checkLength(input.about_text, "about_text", 1000, errors, "متن دربارهٔ فروشگاه");
  checkLength(input.copyright_text, "copyright_text", 300, errors, "متن کپی‌رایت");
  checkLength(
    input.amazing_timer_title,
    "amazing_timer_title",
    80,
    errors,
    "عنوان تایمر",
  );
  checkLength(
    input.product_strip_title,
    "product_strip_title",
    80,
    errors,
    "عنوان نوار محصولات",
  );
  checkLength(input.logo_url, "logo_url", 1000, errors, "لینک لوگو");
  checkLength(input.favicon_url, "favicon_url", 1000, errors, "لینک فاوآیکون");

  if (hasFieldErrors(errors)) return { values: null, errors };

  return {
    values: {
      logo_url: asString(input.logo_url) || null,
      favicon_url: asString(input.favicon_url) || null,
      phone: asString(input.phone).slice(0, 40),
      email: email.slice(0, 160),
      address: asString(input.address).slice(0, 400),
      instagram_url: asString(input.instagram_url).slice(0, 300),
      telegram_url: asString(input.telegram_url).slice(0, 300),
      whatsapp_url: asString(input.whatsapp_url).slice(0, 300),
      twitter_url: asString(input.twitter_url).slice(0, 300),
      aparat_url: asString(input.aparat_url).slice(0, 300),
      about_text: asString(input.about_text).slice(0, 1000),
      copyright_text: asString(input.copyright_text).slice(0, 300),
      amazing_timer_title: asString(input.amazing_timer_title).slice(0, 80),
      amazing_timer_is_active: input.amazing_timer_is_active,
      amazing_timer_starts_at: startsAt,
      amazing_timer_ends_at: endsAt,
      product_strip_title: asString(input.product_strip_title).slice(0, 80),
      product_strip_mode: mode as ProductStripMode,
      product_strip_limit: limit ?? 1,
    },
    errors,
  };
}

export async function updateSiteSettings(
  input: SiteSettingsInput,
): Promise<SiteSettingsResult> {
  const admin = await requireAdmin();
  const { values, errors } = normalize(input);
  if (!values) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors: errors };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("site_settings")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) {
    console.error("Could not update site settings:", error);
    return { ok: false, message: "ذخیرهٔ تنظیمات ظاهر سایت انجام نشد." };
  }

  await writeAudit(admin, "update", "site_settings", "تنظیمات ظاهر سایت به‌روزرسانی شد");
  return { ok: true, message: "تنظیمات ظاهر سایت ذخیره شد." };
}
