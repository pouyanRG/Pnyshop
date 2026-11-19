"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "../require-admin";
import { writeAudit } from "../audit";
import {
  asString,
  hasFieldErrors,
  slugify,
  type FieldErrors,
} from "../validation";

export type BrandInput = {
  name: string;
  slug: string;
  description: string;
  logo_url: string | null;
  is_active: boolean;
};

export type BrandResult = {
  ok: boolean;
  message: string;
  fieldErrors?: FieldErrors;
  brandId?: number;
};

function validate(input: BrandInput): FieldErrors {
  const errors: FieldErrors = {};
  const name = asString(input.name);
  const slug = slugify(asString(input.slug) || name);
  const description = asString(input.description);

  if (!name) errors.name = "نام برند الزامی است.";
  else if (name.length > 120) errors.name = "نام برند حداکثر ۱۲۰ حرف باشد.";
  if (!slug) errors.slug = "اسلاگ معتبر نیست.";
  if (description.length > 1000)
    errors.description = "توضیح برند حداکثر ۱۰۰۰ حرف باشد.";

  return errors;
}

export async function createBrand(input: BrandInput): Promise<BrandResult> {
  const admin = await requireAdmin();
  const fieldErrors = validate(input);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const name = asString(input.name);
  const slug = slugify(asString(input.slug) || name);

  const { data: duplicate } = await supabase
    .from("brands")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (duplicate) {
    return {
      ok: false,
      message: "این اسلاگ قبلاً استفاده شده است.",
      fieldErrors: { slug: "اسلاگ تکراری است." },
    };
  }

  const { data, error } = await supabase
    .from("brands")
    .insert({
      name,
      slug,
      description: asString(input.description),
      logo_url: asString(input.logo_url) || null,
      is_active: input.is_active,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Could not create brand:", error);
    return { ok: false, message: "ذخیرهٔ برند انجام نشد." };
  }

  await writeAudit(admin, "create", "brand", `برند «${name}» ایجاد شد`);
  return { ok: true, message: `برند «${name}» ذخیره شد.`, brandId: data?.id };
}

export async function updateBrand(
  id: number,
  input: BrandInput,
): Promise<BrandResult> {
  const admin = await requireAdmin();
  const fieldErrors = validate(input);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const name = asString(input.name);
  const slug = slugify(asString(input.slug) || name);

  const { data: duplicate } = await supabase
    .from("brands")
    .select("id")
    .eq("slug", slug)
    .neq("id", id)
    .maybeSingle();
  if (duplicate) {
    return {
      ok: false,
      message: "این اسلاگ قبلاً استفاده شده است.",
      fieldErrors: { slug: "اسلاگ تکراری است." },
    };
  }

  const { error } = await supabase
    .from("brands")
    .update({
      name,
      slug,
      description: asString(input.description),
      logo_url: asString(input.logo_url) || null,
      is_active: input.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("Could not update brand:", error);
    return { ok: false, message: "ذخیرهٔ برند انجام نشد." };
  }

  await writeAudit(admin, "update", "brand", `برند «${name}» ویرایش شد`);
  return { ok: true, message: `برند «${name}» ذخیره شد.` };
}

export async function deleteBrand(id: number): Promise<BrandResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!brand) return { ok: false, message: "برند یافت نشد." };

  const { data: used } = await supabase
    .from("products")
    .select("id")
    .eq("brand_id", id)
    .limit(1);
  if (used && used.length > 0) {
    return {
      ok: false,
      message: "محصولاتی از این برند استفاده می‌کنند؛ ابتدا آن‌ها را تغییر دهید.",
    };
  }

  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) {
    console.error("Could not delete brand:", error);
    return { ok: false, message: "حذف برند انجام نشد." };
  }

  await writeAudit(admin, "delete", "brand", `برند «${brand.name}» حذف شد`);
  return { ok: true, message: `برند «${brand.name}» حذف شد.` };
}

export async function toggleBrand(
  id: number,
  isActive: boolean,
): Promise<BrandResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("brands")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Could not toggle brand:", error);
    return { ok: false, message: "تغییر وضعیت برند انجام نشد." };
  }
  await writeAudit(
    admin,
    "update",
    "brand",
    `وضعیت برند با شناسهٔ ${id} به ${isActive ? "فعال" : "غیرفعال"} تغییر کرد`,
  );
  return { ok: true, message: "وضعیت برند به‌روزرسانی شد." };
}
