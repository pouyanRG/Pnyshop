"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "../require-admin";
import { writeAudit } from "../audit";
import {
  asNumber,
  asString,
  hasFieldErrors,
  slugify,
  type FieldErrors,
} from "../validation";

export type CategorySpecField = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  unit: string;
};

export type CategoryInput = {
  name: string;
  slug: string;
  parent_id: number | null;
  image_url: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
  spec_template: CategorySpecField[];
};

export type CategoryResult = {
  ok: boolean;
  message: string;
  fieldErrors?: FieldErrors;
  categoryId?: number;
};

const SPEC_TYPES = new Set(["text", "number", "select"]);

function validate(input: CategoryInput): FieldErrors {
  const errors: FieldErrors = {};
  const name = asString(input.name);
  const slug = slugify(asString(input.slug) || name);

  if (!name) errors.name = "نام دسته‌بندی الزامی است.";
  else if (name.length > 120) errors.name = "نام دسته‌بندی حداکثر ۱۲۰ حرف باشد.";
  if (!slug) errors.slug = "اسلاگ معتبر نیست.";
  if (input.icon && input.icon.length > 80)
    errors.icon = "آیکون حداکثر ۸۰ حرف باشد.";
  if (!Number.isInteger(input.sort_order))
    errors.sort_order = "ترتیب نمایش باید عدد صحیح باشد.";

  const template = Array.isArray(input.spec_template) ? input.spec_template : [];
  if (template.length > 30) {
    errors.spec_template = "قالب مشخصات حداکثر ۳۰ فیلد می‌تواند داشته باشد.";
  } else {
    template.forEach((field, index) => {
      if (!asString(field?.key))
        errors.spec_template = `فیلد ${index + 1} قالب مشخصات: کلید الزامی است.`;
      else if (!asString(field?.label))
        errors.spec_template = `فیلد ${index + 1} قالب مشخصات: عنوان الزامی است.`;
      else if (!SPEC_TYPES.has(asString(field?.type)))
        errors.spec_template = `فیلد ${index + 1} قالب مشخصات: نوع معتبر نیست.`;
    });
  }

  return errors;
}

function normalizeSpecTemplate(
  value: CategoryInput["spec_template"],
): CategorySpecField[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((field) => ({
    key: asString(field?.key).slice(0, 80),
    label: asString(field?.label).slice(0, 120),
    type: (SPEC_TYPES.has(asString(field?.type))
      ? asString(field?.type)
      : "text") as CategorySpecField["type"],
    unit: asString(field?.unit).slice(0, 40),
  }));
}

async function isDescendant(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  parentId: number,
  categoryId: number,
): Promise<boolean> {
  const { data: rows } = await supabase
    .from("categories")
    .select("id, parent_id");
  if (!rows) return false;

  let cursor: number | null = parentId;
  let guard = 0;
  while (cursor !== null && guard < 50) {
    if (cursor === categoryId) return true;
    const current = rows.find((row) => row.id === cursor);
    cursor = current?.parent_id ?? null;
    guard += 1;
  }
  return false;
}

export async function createCategory(
  input: CategoryInput,
): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const fieldErrors = validate(input);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const name = asString(input.name);
  const slug = slugify(asString(input.slug) || name);
  const parentId = asNumber(input.parent_id);

  if (parentId !== null) {
    const { data: parent } = await supabase
      .from("categories")
      .select("id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) {
      return {
        ok: false,
        message: "دسته‌بندی مادر یافت نشد.",
        fieldErrors: { parent_id: "دسته‌بندی مادر معتبر نیست." },
      };
    }
  }

  const { data: duplicate } = await supabase
    .from("categories")
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
    .from("categories")
    .insert({
      name,
      slug,
      parent_id: parentId,
      image_url: asString(input.image_url) || null,
      icon: asString(input.icon),
      sort_order: input.sort_order,
      is_active: input.is_active,
      spec_template: normalizeSpecTemplate(input.spec_template),
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Could not create category:", error);
    return { ok: false, message: "ذخیرهٔ دسته‌بندی انجام نشد." };
  }

  await writeAudit(admin, "create", "category", `دسته‌بندی «${name}» ایجاد شد`);
  return {
    ok: true,
    message: `دسته‌بندی «${name}» ذخیره شد.`,
    categoryId: data?.id,
  };
}

export async function updateCategory(
  id: number,
  input: CategoryInput,
): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const fieldErrors = validate(input);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const name = asString(input.name);
  const slug = slugify(asString(input.slug) || name);
  const parentId = asNumber(input.parent_id);

  const { data: current } = await supabase
    .from("categories")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { ok: false, message: "دسته‌بندی یافت نشد." };

  if (parentId !== null) {
    if (parentId === id) {
      return {
        ok: false,
        message: "دسته‌بندی نمی‌تواند مادر خودش باشد.",
        fieldErrors: { parent_id: "دسته‌بندی مادر معتبر نیست." },
      };
    }
    if (await isDescendant(supabase, parentId, id)) {
      return {
        ok: false,
        message: "دسته‌بندی مادر نمی‌تواند از زیرمجموعه‌های همین دسته باشد.",
        fieldErrors: { parent_id: "دسته‌بندی مادر معتبر نیست." },
      };
    }
  }

  const { data: duplicate } = await supabase
    .from("categories")
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
    .from("categories")
    .update({
      name,
      slug,
      parent_id: parentId,
      image_url: asString(input.image_url) || null,
      icon: asString(input.icon),
      sort_order: input.sort_order,
      is_active: input.is_active,
      spec_template: normalizeSpecTemplate(input.spec_template),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("Could not update category:", error);
    return { ok: false, message: "ذخیرهٔ دسته‌بندی انجام نشد." };
  }

  await writeAudit(
    admin,
    "update",
    "category",
    `دسته‌بندی «${name}» ویرایش شد`,
  );
  return { ok: true, message: `دسته‌بندی «${name}» ذخیره شد.` };
}

export async function deleteCategory(id: number): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: category } = await supabase
    .from("categories")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!category) return { ok: false, message: "دسته‌بندی یافت نشد." };

  const { data: children } = await supabase
    .from("categories")
    .select("id")
    .eq("parent_id", id)
    .limit(1);
  if (children && children.length > 0) {
    return { ok: false, message: "ابتدا زیرمجموعه‌های این دسته را حذف یا جابجا کنید." };
  }

  const { data: used } = await supabase
    .from("products")
    .select("id")
    .eq("category_id", id)
    .limit(1);
  if (used && used.length > 0) {
    return { ok: false, message: "محصولاتی در این دسته هستند؛ ابتدا آن‌ها را جابجا کنید." };
  }

  const { data: legacyUsed } = await supabase
    .from("products")
    .select("id")
    .eq("category", category.name)
    .limit(1);
  if (legacyUsed && legacyUsed.length > 0) {
    return {
      ok: false,
      message: "محصولات قدیمی با نام این دسته وجود دارند؛ ابتدا آن‌ها را به دستهٔ جدید منتقل کنید.",
    };
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) {
    console.error("Could not delete category:", error);
    return { ok: false, message: "حذف دسته‌بندی انجام نشد." };
  }

  await writeAudit(
    admin,
    "delete",
    "category",
    `دسته‌بندی «${category.name}» حذف شد`,
  );
  return { ok: true, message: `دسته‌بندی «${category.name}» حذف شد.` };
}

export async function toggleCategory(
  id: number,
  isActive: boolean,
): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Could not toggle category:", error);
    return { ok: false, message: "تغییر وضعیت دسته انجام نشد." };
  }
  await writeAudit(
    admin,
    "update",
    "category",
    `وضعیت دسته‌بندی با شناسهٔ ${id} به ${isActive ? "فعال" : "غیرفعال"} تغییر کرد`,
  );
  return { ok: true, message: "وضعیت دسته به‌روزرسانی شد." };
}

export async function moveCategory(
  id: number,
  direction: "up" | "down",
): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: category } = await supabase
    .from("categories")
    .select("id, parent_id, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!category) return { ok: false, message: "دسته‌بندی یافت نشد." };

  let siblingsQuery = supabase
    .from("categories")
    .select("id, sort_order");
  siblingsQuery =
    category.parent_id === null
      ? siblingsQuery.is("parent_id", null)
      : siblingsQuery.eq("parent_id", category.parent_id);
  const { data: siblings } = await siblingsQuery
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  const list = siblings ?? [];
  const index = list.findIndex((row) => row.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= list.length) {
    return { ok: false, message: "در این راستا جابجایی وجود ندارد." };
  }

  const reordered = [...list];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await Promise.all(
    reordered.map((row, position) =>
      supabase
        .from("categories")
        .update({ sort_order: position + 1, updated_at: new Date().toISOString() })
        .eq("id", row.id),
    ),
  );

  await writeAudit(
    admin,
    "update",
    "category",
    `ترتیب دسته‌بندی با شناسهٔ ${id} تغییر کرد`,
  );
  return { ok: true, message: "ترتیب دسته‌بندی به‌روزرسانی شد." };
}
