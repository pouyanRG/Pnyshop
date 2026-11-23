"use server";

import type { Product } from "@/types/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "../require-admin";
import { writeAudit } from "../audit";
import {
  asBoolean,
  asNumber,
  asString,
  hasFieldErrors,
  slugify,
  type FieldErrors,
} from "../validation";

export type ProductImageInput = {
  id?: number;
  url: string;
  alt: string;
  sort_order: number;
  is_primary: boolean;
};

export type ProductVariantInput = {
  id?: string;
  sku: string;
  color_name: string;
  color_code: string;
  size: string;
  price: number;
  discount: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
};

export type ProductSpecificationInput = {
  key: string;
  value: string;
};

export type ProductInput = {
  name: string;
  slug: string;
  brand_id: number | null;
  category_id: number | null;
  description: string;
  warranty: string;
  status: "draft" | "published";
  is_hot: boolean;
  price: number;
  stock: number;
  discount: number;
  images: ProductImageInput[];
  variants: ProductVariantInput[];
  specifications: ProductSpecificationInput[];
};

export type ProductResult = {
  ok: boolean;
  message: string;
  fieldErrors?: FieldErrors;
  productId?: number;
};

function must(
  result: { error: { message: string } | null },
  what: string,
) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

function normalizeImages(
  value: ProductInput["images"],
): ProductImageInput[] {
  if (!Array.isArray(value)) return [];
  const images = value
    .filter((image) => image && typeof image === "object")
    .map((image, index) => ({
      id: asNumber((image as { id?: unknown }).id) ?? undefined,
      url: asString((image as { url?: unknown }).url).slice(0, 1000),
      alt: asString((image as { alt?: unknown }).alt).slice(0, 200),
      sort_order:
        asNumber((image as { sort_order?: unknown }).sort_order) ?? index,
      is_primary: asBoolean((image as { is_primary?: unknown }).is_primary),
    }))
    .filter((image) => image.url.length > 0)
    .slice(0, 20);

  let primaryAssigned = false;
  return images.map((image) => {
    const isPrimary = image.is_primary && !primaryAssigned;
    if (isPrimary) primaryAssigned = true;
    return { ...image, is_primary: isPrimary };
  });
}

function normalizeVariants(
  value: ProductInput["variants"],
): ProductVariantInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((variant) => variant && typeof variant === "object")
    .map((variant) => {
      const record = variant as Record<string, unknown>;
      return {
        id: typeof record.id === "string" ? record.id : undefined,
        sku: asString(record.sku).slice(0, 80),
        color_name: asString(record.color_name).slice(0, 80),
        color_code: asString(record.color_code).slice(0, 20),
        size: asString(record.size).slice(0, 80),
        price: asNumber(record.price) ?? 0,
        discount: asNumber(record.discount) ?? 0,
        stock: asNumber(record.stock) ?? 0,
        image_url: asString(record.image_url) || null,
        is_active: asBoolean(record.is_active ?? true),
      };
    })
    .slice(0, 200);
}

function normalizeSpecifications(
  value: ProductInput["specifications"],
): ProductSpecificationInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      key: asString((item as { key?: unknown }).key).slice(0, 80),
      value: asString((item as { value?: unknown }).value).slice(0, 500),
    }))
    .filter((item) => item.key.length > 0)
    .slice(0, 60);
}

function validate(input: ProductInput): FieldErrors {
  const errors: FieldErrors = {};
  const name = asString(input.name);
  const slug = slugify(asString(input.slug) || name);
  const images = normalizeImages(input.images);
  const variants = normalizeVariants(input.variants);

  if (!name) errors.name = "عنوان محصول الزامی است.";
  else if (name.length > 200) errors.name = "عنوان محصول حداکثر ۲۰۰ حرف باشد.";
  if (!slug) errors.slug = "اسلاگ معتبر نیست.";
  if (images.length === 0) errors.images = "حداقل یک تصویر برای محصول الزامی است.";
  if (images.length > 20) errors.images = "حداکثر ۲۰ تصویر مجاز است.";
  if (variants.length > 200)
    errors.variants = "حداکثر ۲۰۰ واریانت مجاز است.";

  const price = asNumber(input.price);
  const stock = asNumber(input.stock);
  const discount = asNumber(input.discount) ?? 0;

  if (variants.length === 0) {
    if (price === null || price < 0) errors.price = "قیمت محصول معتبر نیست.";
    if (stock === null || !Number.isInteger(stock) || stock < 0)
      errors.stock = "موجودی محصول باید عددی صحیح و نامنفی باشد.";
  }
  if (discount < 0 || discount > 100)
    errors.discount = "تخفیف محصول بین ۰ تا ۱۰۰ درصد باشد.";

  variants.forEach((variant, index) => {
    if (variant.price < 0)
      errors.variants = `واریانت ${index + 1}: قیمت نامعتبر است.`;
    if (variant.discount < 0 || variant.discount > 100)
      errors.variants = `واریانت ${index + 1}: تخفیف باید بین ۰ تا ۱۰۰ باشد.`;
    if (!Number.isInteger(variant.stock) || variant.stock < 0)
      errors.variants = `واریانت ${index + 1}: موجودی نامعتبر است.`;
  });

  return errors;
}

function specificationsToObject(
  items: ProductSpecificationInput[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items) {
    if (item.key && !(item.key in result)) result[item.key] = item.value;
  }
  return result;
}

function buildLegacyColors(variants: ProductVariantInput[]) {
  const colors = new Map<
    string,
    { name: string; code: string | null; image: string | null; stock: number }
  >();
  for (const variant of variants) {
    const name = variant.color_name || "پیش‌فرض";
    const entry = colors.get(name) ?? {
      name,
      code: variant.color_code || null,
      image: variant.image_url,
      stock: 0,
    };
    entry.stock += variant.stock;
    if (!entry.code && variant.color_code) entry.code = variant.color_code;
    if (!entry.image && variant.image_url) entry.image = variant.image_url;
    colors.set(name, entry);
  }
  return [...colors.values()];
}

async function reconcileImages(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: number,
  images: ProductImageInput[],
) {
  const { data: existing } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", productId);
  const existingIds = new Set((existing ?? []).map((row) => row.id));
  const keptIds = new Set<number>();

  const normalized = images.map((image, index) => ({
    ...image,
    sort_order: index,
    is_primary: image.is_primary,
  }));
  if (normalized.length > 0 && !normalized.some((image) => image.is_primary)) {
    normalized[0].is_primary = true;
  }

  for (const image of normalized) {
    if (image.id && existingIds.has(image.id)) {
      must(await supabase
        .from("product_images")
        .update({
          url: image.url,
          alt: image.alt,
          sort_order: image.sort_order,
          is_primary: image.is_primary,
        })
        .eq("id", image.id), "تصویر");
      keptIds.add(image.id);
    } else {
      const insertResult = await supabase
        .from("product_images")
        .insert({
          product_id: productId,
          url: image.url,
          alt: image.alt,
          sort_order: image.sort_order,
          is_primary: image.is_primary,
        })
        .select("id")
        .maybeSingle();
      must(insertResult, "تصویر");
      const { data } = insertResult;
      if (data?.id) keptIds.add(data.id);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    must(await supabase
      .from("product_images")
      .delete()
      .eq("product_id", productId)
      .in("id", toDelete), "حذف تصویر");
  }
}

async function reconcileVariants(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: number,
  variants: ProductVariantInput[],
) {
  const { data: existing } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  const existingIds = new Set((existing ?? []).map((row) => row.id));
  const keptIds = new Set<string>();

  for (const variant of variants) {
    if (variant.id && existingIds.has(variant.id)) {
      must(await supabase
        .from("product_variants")
        .update({
          sku: variant.sku,
          color_name: variant.color_name,
          color_code: variant.color_code,
          size: variant.size,
          price: variant.price,
          discount: variant.discount,
          stock: variant.stock,
          image_url: variant.image_url,
          is_active: variant.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", variant.id), "واریانت");
      keptIds.add(variant.id);
    } else {
      const insertResult = await supabase
        .from("product_variants")
        .insert({
          product_id: productId,
          sku: variant.sku,
          color_name: variant.color_name,
          color_code: variant.color_code,
          size: variant.size,
          price: variant.price,
          discount: variant.discount,
          stock: variant.stock,
          image_url: variant.image_url,
          is_active: variant.is_active,
        })
        .select("id")
        .maybeSingle();
      must(insertResult, "واریانت");
      const { data } = insertResult;
      if (data?.id) keptIds.add(data.id);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    must(await supabase
      .from("product_variants")
      .delete()
      .eq("product_id", productId)
      .in("id", toDelete), "حذف واریانت");
  }
}

async function resolveNames(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  categoryId: number | null,
  brandId: number | null,
) {
  let categoryName = "";
  let brandName = "";

  if (categoryId !== null) {
    const { data } = await supabase
      .from("categories")
      .select("name")
      .eq("id", categoryId)
      .maybeSingle();
    categoryName = data?.name ?? "";
  }
  if (brandId !== null) {
    const { data } = await supabase
      .from("brands")
      .select("name")
      .eq("id", brandId)
      .maybeSingle();
    brandName = data?.name ?? "";
  }

  return { categoryName, brandName };
}

async function assertIdsExist(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  categoryId: number | null,
  brandId: number | null,
): Promise<string | null> {
  if (categoryId !== null) {
    const { data } = await supabase
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .maybeSingle();
    if (!data) return "دسته‌بندی انتخاب‌شده معتبر نیست.";
  }
  if (brandId !== null) {
    const { data } = await supabase
      .from("brands")
      .select("id")
      .eq("id", brandId)
      .maybeSingle();
    if (!data) return "برند انتخاب‌شده معتبر نیست.";
  }
  return null;
}

export async function createProduct(
  input: ProductInput,
): Promise<ProductResult> {
  const admin = await requireAdmin();
  const fieldErrors = validate(input);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const name = asString(input.name);
  const slug = slugify(asString(input.slug) || name) || `product-${Date.now()}`;
  const images = normalizeImages(input.images);
  const variants = normalizeVariants(input.variants);
  const specifications = normalizeSpecifications(input.specifications);
  const categoryId = asNumber(input.category_id);
  const brandId = asNumber(input.brand_id);

  const invalid = await assertIdsExist(supabase, categoryId, brandId);
  if (invalid) return { ok: false, message: invalid };

  const { data: duplicate } = await supabase
    .from("products")
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

  const { categoryName, brandName } = await resolveNames(
    supabase,
    categoryId,
    brandId,
  );

  // Only active variants drive the storefront price, stock and colors.
  const sellable = variants.filter((variant) => variant.is_active);

  const productPrice =
    sellable.length > 0
      ? Math.min(...sellable.map((variant) => variant.price))
      : (asNumber(input.price) ?? 0);
  const productStock =
    sellable.length > 0
      ? sellable.reduce((sum, variant) => sum + variant.stock, 0)
      : (asNumber(input.stock) ?? 0);

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      name,
      slug,
      description: asString(input.description),
      warranty: asString(input.warranty).slice(0, 200),
      status: input.status,
      is_hot: asBoolean(input.is_hot),
      price: productPrice,
      stock: productStock,
      discount: sellable.length > 0 ? 0 : (asNumber(input.discount) ?? 0),
      category: categoryName,
      brand: brandName,
      category_id: categoryId,
      brand_id: brandId,
      image_url: images.find((image) => image.is_primary)?.url ?? images[0]?.url ?? null,
      gallery: images.map((image) => image.url),
      colors: buildLegacyColors(sellable),
      specifications: specificationsToObject(specifications),
      is_active: true,
    })
    .select("id")
    .maybeSingle();
  if (error || !product) {
    console.error("Could not create product:", error);
    return { ok: false, message: "ذخیرهٔ محصول انجام نشد." };
  }

  try {
    await reconcileImages(supabase, product.id, images);
    await reconcileVariants(supabase, product.id, variants);
  } catch (error) {
    console.error("Could not reconcile product media or variants:", error);
    return {
      ok: false,
      message: error instanceof Error
        ? error.message
        : "ذخیرهٔ تصاویر یا واریانت‌های محصول انجام نشد.",
    };
  }

  await writeAudit(admin, "create", "product", `محصول «${name}» ایجاد شد`);
  return {
    ok: true,
    message: `محصول «${name}» ذخیره شد.`,
    productId: product.id,
  };
}

export async function updateProduct(
  id: number,
  input: ProductInput,
): Promise<ProductResult> {
  const admin = await requireAdmin();
  const fieldErrors = validate(input);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { ok: false, message: "محصول یافت نشد." };

  const name = asString(input.name);
  const slug = slugify(asString(input.slug) || name) || `product-${Date.now()}`;
  const images = normalizeImages(input.images);
  const variants = normalizeVariants(input.variants);
  const specifications = normalizeSpecifications(input.specifications);
  const categoryId = asNumber(input.category_id);
  const brandId = asNumber(input.brand_id);

  const invalid = await assertIdsExist(supabase, categoryId, brandId);
  if (invalid) return { ok: false, message: invalid };

  const { data: duplicate } = await supabase
    .from("products")
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

  const { categoryName, brandName } = await resolveNames(
    supabase,
    categoryId,
    brandId,
  );

  // Only active variants drive the storefront price, stock and colors.
  const sellable = variants.filter((variant) => variant.is_active);

  const productPrice =
    sellable.length > 0
      ? Math.min(...sellable.map((variant) => variant.price))
      : (asNumber(input.price) ?? 0);
  const productStock =
    sellable.length > 0
      ? sellable.reduce((sum, variant) => sum + variant.stock, 0)
      : (asNumber(input.stock) ?? 0);

  const { error } = await supabase
    .from("products")
    .update({
      name,
      slug,
      description: asString(input.description),
      warranty: asString(input.warranty).slice(0, 200),
      status: input.status,
      price: productPrice,
      stock: productStock,
      discount: sellable.length > 0 ? 0 : (asNumber(input.discount) ?? 0),
      category: categoryName,
      brand: brandName,
      category_id: categoryId,
      brand_id: brandId,
      image_url: images.find((image) => image.is_primary)?.url ?? images[0]?.url ?? null,
      gallery: images.map((image) => image.url),
      colors: buildLegacyColors(sellable),
      specifications: specificationsToObject(specifications),
      is_hot: asBoolean(input.is_hot),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("Could not update product:", error);
    return { ok: false, message: "ذخیرهٔ محصول انجام نشد." };
  }

  try {
    await reconcileImages(supabase, id, images);
    await reconcileVariants(supabase, id, variants);
  } catch (error) {
    console.error("Could not reconcile product media or variants:", error);
    return {
      ok: false,
      message: error instanceof Error
        ? error.message
        : "ذخیرهٔ تصاویر یا واریانت‌های محصول انجام نشد.",
    };
  }

  await writeAudit(admin, "update", "product", `محصول «${name}» ویرایش شد`);
  return {
    ok: true,
    message: `محصول «${name}» ذخیره شد.`,
    productId: id,
  };
}

export async function deleteProduct(id: number): Promise<ProductResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: product } = await supabase
    .from("products")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!product) return { ok: false, message: "محصول یافت نشد." };

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    console.error("Could not delete product:", error);
    return { ok: false, message: "حذف محصول انجام نشد." };
  }

  await writeAudit(admin, "delete", "product", `محصول «${product.name}» حذف شد`);
  return { ok: true, message: `محصول «${product.name}» حذف شد.` };
}

export async function duplicateProduct(id: number): Promise<ProductResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!product) return { ok: false, message: "محصول یافت نشد." };

  const { data: images } = await supabase
    .from("product_images")
    .select("url, alt, sort_order, is_primary")
    .eq("product_id", id)
    .order("sort_order", { ascending: true });
  const { data: variants } = await supabase
    .from("product_variants")
    .select(
      "sku, color_name, color_code, size, price, discount, stock, image_url, is_active",
    )
    .eq("product_id", id);

  const slug = `${product.slug ?? "product"}-copy-${Date.now()}`;
  const { data: created, error } = await supabase
    .from("products")
    .insert({
      name: `${product.name} (کپی)`,
      slug,
      description: product.description,
      warranty: product.warranty,
      status: "draft",
      is_hot: product.is_hot,
      price: product.price,
      stock: product.stock,
      discount: product.discount,
      category: product.category,
      brand: product.brand,
      category_id: product.category_id,
      brand_id: product.brand_id,
      image_url: product.image_url,
      gallery: product.gallery,
      colors: product.colors,
      specifications: product.specifications,
      is_active: product.is_active,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) {
    console.error("Could not duplicate product:", error);
    return { ok: false, message: "کپی محصول انجام نشد." };
  }

  for (const image of images ?? []) {
    await supabase.from("product_images").insert({
      product_id: created.id,
      url: image.url,
      alt: image.alt,
      sort_order: image.sort_order,
      is_primary: image.is_primary,
    });
  }
  for (const variant of variants ?? []) {
    await supabase.from("product_variants").insert({
      product_id: created.id,
      sku: variant.sku,
      color_name: variant.color_name,
      color_code: variant.color_code,
      size: variant.size,
      price: variant.price,
      discount: variant.discount,
      stock: variant.stock,
      image_url: variant.image_url,
      is_active: variant.is_active,
    });
  }

  await writeAudit(
    admin,
    "create",
    "product",
    `محصول «${product.name}» کپی شد`,
  );
  return {
    ok: true,
    message: `محصول «${product.name}» به‌عنوان پیش‌نویس کپی شد.`,
    productId: created.id,
  };
}

export async function updateProductQuick(
  id: number,
  input: { price?: number; stock?: number; is_active?: boolean },
): Promise<ProductResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: variants } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", id)
    .limit(1);
  const hasVariants = (variants?.length ?? 0) > 0;
  if (hasVariants && (input.price !== undefined || input.stock !== undefined)) {
    return {
      ok: false,
      message: "این محصول واریانت دارد؛ قیمت و موجودی را از فرم واریانت‌ها تغییر دهید.",
    };
  }

  const update: Partial<Product> = { updated_at: new Date().toISOString() };
  if (input.price !== undefined) {
    const price = asNumber(input.price);
    if (price === null || price < 0) {
      return { ok: false, message: "قیمت معتبر نیست." };
    }
    update.price = price;
  }
  if (input.stock !== undefined) {
    const stock = asNumber(input.stock);
    if (stock === null || !Number.isInteger(stock) || stock < 0) {
      return { ok: false, message: "موجودی معتبر نیست." };
    }
    update.stock = stock;
  }
  if (input.is_active !== undefined) {
    update.is_active = input.is_active;
  }

  const { error } = await supabase
    .from("products")
    .update(update)
    .eq("id", id);
  if (error) {
    console.error("Could not update product quickly:", error);
    return { ok: false, message: "ویرایش سریع انجام نشد." };
  }

  await writeAudit(admin, "update", "product", `ویرایش سریع محصول ${id}`);
  return { ok: true, message: "محصول به‌روزرسانی شد." };
}

export async function bulkUpdateProducts(
  ids: number[],
  input: { category_id?: number | null; is_active?: boolean },
): Promise<ProductResult> {
  const admin = await requireAdmin();
  if (ids.length === 0) return { ok: false, message: "محصولی انتخاب نشده است." };

  const supabase = await createSupabaseServerClient();
  const update: Partial<Product> = { updated_at: new Date().toISOString() };

  if (input.category_id !== undefined) {
    const categoryId = asNumber(input.category_id);
    if (categoryId !== null) {
      const { data: category } = await supabase
        .from("categories")
        .select("id, name")
        .eq("id", categoryId)
        .maybeSingle();
      if (!category) return { ok: false, message: "دسته‌بندی معتبر نیست." };
      update.category_id = categoryId;
      update.category = category.name;
    } else {
      update.category_id = null;
      update.category = "";
    }
  }
  if (input.is_active !== undefined) {
    update.is_active = input.is_active;
  }

  const { error } = await supabase
    .from("products")
    .update(update)
    .in("id", ids);
  if (error) {
    console.error("Could not bulk update products:", error);
    return { ok: false, message: "ویرایش گروهی انجام نشد." };
  }

  await writeAudit(
    admin,
    "update",
    "product",
    `${ids.length} محصول به‌صورت گروهی ویرایش شدند`,
  );
  return { ok: true, message: `${ids.length.toLocaleString("fa-IR")} محصول به‌روزرسانی شد.` };
}

export async function bulkDeleteProducts(ids: number[]): Promise<ProductResult> {
  const admin = await requireAdmin();
  if (ids.length === 0) return { ok: false, message: "محصولی انتخاب نشده است." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("products").delete().in("id", ids);
  if (error) {
    console.error("Could not bulk delete products:", error);
    return { ok: false, message: "حذف گروهی انجام نشد." };
  }

  await writeAudit(
    admin,
    "delete",
    "product",
    `${ids.length} محصول به‌صورت گروهی حذف شدند`,
  );
  return { ok: true, message: `${ids.length.toLocaleString("fa-IR")} محصول حذف شد.` };
}
