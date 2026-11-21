"use server";

import type { CouponInput } from "@/types/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "../require-admin";
import { writeAudit } from "../audit";
import { asNumber, asString, hasFieldErrors, type FieldErrors } from "../validation";

export type { CouponInput } from "@/types/admin";

export type CouponResult = {
  ok: boolean;
  message: string;
  fieldErrors?: FieldErrors;
  couponId?: string;
};

const AUDIENCES = new Set(["all", "newUsers", "oldUsers"]);
const SCOPES = new Set(["all", "category"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function optionalNumber(
  value: unknown,
  field: string,
  errors: FieldErrors,
  label: string,
  { integer = false, min = 0 }: { integer?: boolean; min?: number } = {},
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = asNumber(value);
  if (parsed === null) {
    errors[field] = `${label} باید عدد باشد.`;
    return null;
  }
  if (integer && !Number.isInteger(parsed)) {
    errors[field] = `${label} باید عدد صحیح باشد.`;
    return null;
  }
  if (min !== undefined && parsed < min) {
    errors[field] = `${label} نمی‌تواند کمتر از ${min} باشد.`;
    return null;
  }
  return parsed;
}

function optionalDate(
  value: unknown,
  field: string,
  errors: FieldErrors,
  label: string,
): string | null {
  const raw = asString(value).trim();
  if (raw === "") return null;
  if (!DATE_PATTERN.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00`).getTime())) {
    errors[field] = `${label} معتبر نیست.`;
    return null;
  }
  return raw;
}

function validate(input: CouponInput): {
  errors: FieldErrors;
  values: NormalizedCoupon | null;
} {
  const errors: FieldErrors = {};

  const code = asString(input.code).toUpperCase();
  if (!code) errors.code = "کد تخفیف الزامی است.";
  else if (code.length > 40) errors.code = "کد تخفیف حداکثر ۴۰ حرف است.";
  else if (!/^[A-Z0-9_-]+$/.test(code))
    errors.code = "کد تخفیف فقط می‌تواند حرف، عدد، خط تیره و زیرخط داشته باشد.";

  const title = asString(input.title);
  if (title.length > 120) errors.title = "عنوان حداکثر ۱۲۰ حرف است.";

  const iconUrl = asString(input.icon_url);
  if (iconUrl.length > 1000) errors.icon_url = "لینک آیکون حداکثر ۱۰۰۰ حرف است.";

  const discountType = asString(input.discount_type);
  if (!["percent", "fixed"].includes(discountType))
    errors.discount_type = "نوع تخفیف معتبر نیست.";

  const discountValue = asNumber(input.discount_value);
  if (discountValue === null || discountValue < 0)
    errors.discount_value = "مقدار تخفیف باید عدد مثبت باشد.";
  else if (discountType === "percent" && discountValue > 100)
    errors.discount_value = "درصد تخفیف حداکثر ۱۰۰ می‌تواند باشد.";

  const minimumAmount = asNumber(input.minimum_amount);
  if (minimumAmount === null || minimumAmount < 0)
    errors.minimum_amount = "حداقل مبلغ خرید باید عدد مثبت باشد.";

  const sortOrder = asNumber(input.sort_order);
  if (sortOrder === null || !Number.isInteger(sortOrder))
    errors.sort_order = "ترتیب نمایش باید عدد صحیح باشد.";

  const audience = asString(input.audience);
  if (!AUDIENCES.has(audience)) errors.audience = "مخاطب تخفیف معتبر نیست.";

  const scope = asString(input.scope);
  if (!SCOPES.has(scope)) errors.scope = "دامنهٔ تخفیف معتبر نیست.";

  const scopeCategory = asString(input.scope_category);
  if (scope === "category" && !scopeCategory)
    errors.scope_category = "برای دامنهٔ دسته‌بندی، نام دسته‌بندی الزامی است.";
  if (scopeCategory.length > 120)
    errors.scope_category = "دسته‌بندی حداکثر ۱۲۰ حرف است.";

  const maximumDiscount = optionalNumber(
    input.maximum_discount,
    "maximum_discount",
    errors,
    "سقف تخفیف",
  );
  const usageLimit = optionalNumber(
    input.usage_limit,
    "usage_limit",
    errors,
    "محدودیت استفاده",
    { integer: true },
  );
  const audienceDays = optionalNumber(
    input.audience_days,
    "audience_days",
    errors,
    "بازهٔ مخاطب",
    { integer: true, min: 1 },
  );

  const startsAt = optionalDate(input.starts_at, "starts_at", errors, "تاریخ شروع");
  const endsAt = optionalDate(input.ends_at, "ends_at", errors, "تاریخ پایان");
  if (startsAt && endsAt && endsAt < startsAt)
    errors.ends_at = "تاریخ پایان باید بعد از تاریخ شروع باشد.";

  if (hasFieldErrors(errors)) return { errors, values: null };

  return {
    errors,
    values: {
      code,
      title,
      icon_url: iconUrl || null,
      discount_type: discountType as "percent" | "fixed",
      discount_value: discountValue ?? 0,
      minimum_amount: minimumAmount ?? 0,
      maximum_discount: maximumDiscount,
      usage_limit: usageLimit,
      sort_order: sortOrder ?? 0,
      starts_at: startsAt,
      ends_at: endsAt,
      audience: audience as "all" | "newUsers" | "oldUsers",
      audience_days: audienceDays,
      scope: scope as "all" | "category",
      scope_category: scope === "category" ? scopeCategory : null,
      is_active: input.is_active,
    },
  };
}

type NormalizedCoupon = {
  code: string;
  title: string;
  icon_url: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  minimum_amount: number;
  maximum_discount: number | null;
  usage_limit: number | null;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  audience: "all" | "newUsers" | "oldUsers";
  audience_days: number | null;
  scope: "all" | "category";
  scope_category: string | null;
  is_active: boolean;
};

export async function createCoupon(input: CouponInput): Promise<CouponResult> {
  const admin = await requireAdmin();
  const { errors, values } = validate(input);
  if (!values) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors: errors };
  }

  const supabase = await createSupabaseServerClient();

  const { data: duplicate } = await supabase
    .from("coupons")
    .select("id")
    .eq("code", values.code)
    .maybeSingle();
  if (duplicate) {
    return {
      ok: false,
      message: "این کد تخفیف قبلاً ثبت شده است.",
      fieldErrors: { code: "کد تخفیف تکراری است." },
    };
  }

  const { data, error } = await supabase
    .from("coupons")
    .insert(values)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("Could not create coupon:", error);
    return { ok: false, message: "ذخیرهٔ کد تخفیف انجام نشد." };
  }

  await writeAudit(admin, "create", "coupon", `کد تخفیف «${values.code}» ایجاد شد`);
  return { ok: true, message: `کد تخفیف «${values.code}» ذخیره شد.`, couponId: data.id };
}

export async function updateCoupon(
  id: string,
  input: CouponInput,
): Promise<CouponResult> {
  const admin = await requireAdmin();
  const { errors, values } = validate(input);
  if (!values) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors: errors };
  }

  const supabase = await createSupabaseServerClient();

  const { data: duplicate } = await supabase
    .from("coupons")
    .select("id")
    .eq("code", values.code)
    .neq("id", id)
    .maybeSingle();
  if (duplicate) {
    return {
      ok: false,
      message: "این کد تخفیف قبلاً ثبت شده است.",
      fieldErrors: { code: "کد تخفیف تکراری است." },
    };
  }

  const { error } = await supabase
    .from("coupons")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Could not update coupon:", error);
    return { ok: false, message: "ذخیرهٔ کد تخفیف انجام نشد." };
  }

  await writeAudit(admin, "update", "coupon", `کد تخفیف «${values.code}» ویرایش شد`);
  return { ok: true, message: `کد تخفیف «${values.code}» ذخیره شد.` };
}

export async function deleteCoupon(id: string): Promise<CouponResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: coupon } = await supabase
    .from("coupons")
    .select("code")
    .eq("id", id)
    .maybeSingle();
  if (!coupon) return { ok: false, message: "کد تخفیف یافت نشد." };

  const { error } = await supabase.from("coupons").delete().eq("id", id);
  if (error) {
    console.error("Could not delete coupon:", error);
    return { ok: false, message: "حذف کد تخفیف انجام نشد." };
  }

  await writeAudit(admin, "delete", "coupon", `کد تخفیف «${coupon.code}» حذف شد`);
  return { ok: true, message: `کد تخفیف «${coupon.code}» حذف شد.` };
}

export async function toggleCoupon(
  id: string,
  isActive: boolean,
): Promise<CouponResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("coupons")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Could not toggle coupon:", error);
    return { ok: false, message: "تغییر وضعیت کد تخفیف انجام نشد." };
  }
  await writeAudit(
    admin,
    "update",
    "coupon",
    `وضعیت کد تخفیف با شناسهٔ ${id} به ${isActive ? "فعال" : "غیرفعال"} تغییر کرد`,
  );
  return { ok: true, message: "وضعیت کد تخفیف به‌روزرسانی شد." };
}
