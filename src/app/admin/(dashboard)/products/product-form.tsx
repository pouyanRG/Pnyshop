"use client";

import { useState } from "react";
import type { Brand, Category } from "@/types/database";
import type { AdminProduct } from "@/types/admin";
import { createBrand } from "@/lib/admin/actions/brands";
import {
  createProduct,
  updateProduct,
  type ProductImageInput,
  type ProductInput,
  type ProductVariantInput,
} from "@/lib/admin/actions/products";
import { ProductImages } from "./product-images";
import { ProductVariants } from "./product-variants";
import styles from "./product-form.module.css";

type SpecRow = { key: string; value: string };

type FormState = {
  name: string;
  slug: string;
  brand_id: number | null;
  category_id: number | null;
  description: string;
  warranty: string;
  status: "draft" | "published";
  price: number;
  stock: number;
  discount: number;
  images: ProductImageInput[];
  variants: ProductVariantInput[];
  specifications: SpecRow[];
};

const STEPS = [
  { key: "base", label: "اطلاعات پایه" },
  { key: "category", label: "دسته‌بندی" },
  { key: "images", label: "تصاویر" },
  { key: "variants", label: "وارینت‌ها" },
  { key: "specs", label: "مشخصات فنی" },
  { key: "preview", label: "پیش‌نمایش و ذخیره" },
] as const;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‌\s_]+/g, "-")
    .replace(/[^a-z0-9آ-ی-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type CategoryNode = Category & { children: CategoryNode[] };

function buildTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map<number, CategoryNode>();
  for (const category of categories) {
    nodes.set(category.id, { ...category, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent_id !== null && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (list: CategoryNode[]) => {
    list.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    list.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function flatten(
  nodes: CategoryNode[],
  depth = 0,
): Array<Category & { depth: number }> {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flatten(node.children, depth + 1),
  ]);
}

function specificationsFromJson(value: unknown): SpecRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
    key,
    value: typeof item === "string" ? item : String(item ?? ""),
  }));
}

function initialState(product?: AdminProduct | null): FormState {
  if (!product) {
    return {
      name: "",
      slug: "",
      brand_id: null,
      category_id: null,
      description: "",
      warranty: "",
      status: "draft",
      price: 0,
      stock: 0,
      discount: 0,
      images: [],
      variants: [],
      specifications: [],
    };
  }

  return {
    name: product.name,
    slug: product.slug ?? "",
    brand_id: product.brand_id,
    category_id: product.category_id,
    description: product.description,
    warranty: product.warranty,
    status: product.status,
    price: product.price,
    stock: product.stock,
    discount: product.discount,
    images: product.product_images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      sort_order: image.sort_order,
      is_primary: image.is_primary,
    })),
    variants: product.product_variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      color_name: variant.color_name,
      color_code: variant.color_code,
      size: variant.size,
      price: variant.price,
      discount: variant.discount,
      stock: variant.stock,
      image_url: variant.image_url,
      is_active: variant.is_active,
    })),
    specifications: specificationsFromJson(product.specifications),
  };
}

export function ProductForm({
  product,
  categories,
  brands,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  categories: Category[];
  brands: Brand[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(product));
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [brandList, setBrandList] = useState(brands);
  const [newBrandName, setNewBrandName] = useState("");

  const tree = buildTree(categories);
  const flatCategories = flatten(tree);
  const selectedCategory = categories.find((item) => item.id === form.category_id);

  async function quickAddBrand() {
    const name = newBrandName.trim();
    if (!name || busy) return;
    setBusy(true);
    setNotice("");
    const result = await createBrand({
      name,
      slug: "",
      description: "",
      logo_url: null,
      is_active: true,
    });
    if (result.ok && result.brandId) {
      setBrandList((current) => [
        ...current,
        {
          id: result.brandId!,
          name,
          slug: slugify(name),
          description: "",
          logo_url: null,
          is_active: true,
          created_at: "",
          updated_at: "",
        },
      ]);
      setForm({ ...form, brand_id: result.brandId });
      setNewBrandName("");
      setNotice(`برند «${name}» ایجاد شد.`);
    } else {
      setNotice(result.message);
    }
    setBusy(false);
  }

  function applySpecTemplate() {
    if (!selectedCategory) {
      setNotice("ابتدا در مرحلهٔ دسته‌بندی یک دسته انتخاب کنید.");
      return;
    }
    const template = Array.isArray(selectedCategory.spec_template)
      ? (selectedCategory.spec_template as Array<{
          key?: unknown;
          label?: unknown;
        }>)
      : [];
    if (template.length === 0) {
      setNotice("این دسته قالب مشخصات ندارد.");
      return;
    }
    setForm({
      ...form,
      specifications: template.map((field) => ({
        key: typeof field.key === "string" ? field.key : "",
        value: "",
      })),
    });
    setNotice("قالب مشخصات دسته به جدول منتقل شد؛ مقادیر را کامل کنید.");
  }

  async function save(status: "draft" | "published") {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setFieldErrors({});

    const payload: ProductInput = {
      ...form,
      status,
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
      discount: Number(form.discount) || 0,
      specifications: form.specifications.filter((row) => row.key.trim()),
    };

    const result = product?.id
      ? await updateProduct(product.id, payload)
      : await createProduct(payload);

    if (result.ok) {
      onSaved(result.message);
      return;
    }

    setNotice(result.message);
    setFieldErrors(result.fieldErrors ?? {});
    const errors = result.fieldErrors ?? {};
    if (errors.images) setStepIndex(2);
    else if (errors.variants) setStepIndex(3);
    else setStepIndex(0);
    setBusy(false);
  }

  function goTo(index: number) {
    setStepIndex(index);
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <header className={styles.dialogHeader}>
          <div>
            <h1>{product?.id ? `ویرایش «${product.name}»` : "محصول جدید"}</h1>
            <p>مراحل ویزارد: {STEPS[stepIndex].label}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="بستن"
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </header>

        <nav className={styles.steps} aria-label="مراحل محصول">
          {STEPS.map((step, index) => (
            <button
              type="button"
              key={step.key}
              className={`${styles.step} ${index === stepIndex ? styles.stepActive : ""} ${index < stepIndex ? styles.stepDone : ""}`}
              onClick={() => goTo(index)}
              aria-current={index === stepIndex ? "step" : undefined}
            >
              <span className={styles.stepNumber}>{index + 1}</span>
              {step.label}
            </button>
          ))}
        </nav>

        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}

        <div className={styles.dialogBody}>
          {stepIndex === 0 && (
            <div className={styles.stepContent}>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span>عنوان محصول *</span>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    maxLength={200}
                    autoFocus
                  />
                  {fieldErrors.name && (
                    <small className={styles.error}>{fieldErrors.name}</small>
                  )}
                </label>

                <label className={styles.field}>
                  <span>اسلاگ</span>
                  <div className={styles.slugRow}>
                    <input
                      value={form.slug}
                      onChange={(event) =>
                        setForm({ ...form, slug: event.target.value })
                      }
                      dir="ltr"
                      maxLength={160}
                    />
                    <button
                      type="button"
                      className={styles.small}
                      onClick={() => setForm({ ...form, slug: slugify(form.name) })}
                    >
                      از عنوان بساز
                    </button>
                  </div>
                  {fieldErrors.slug && (
                    <small className={styles.error}>{fieldErrors.slug}</small>
                  )}
                </label>

                <label className={styles.field}>
                  <span>برند</span>
                  <select
                    value={form.brand_id === null ? "" : String(form.brand_id)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        brand_id: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">بدون برند</option>
                    {brandList.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={styles.field}>
                  <span>افزودن سریع برند</span>
                  <div className={styles.slugRow}>
                    <input
                      value={newBrandName}
                      placeholder="نام برند جدید"
                      onChange={(event) => setNewBrandName(event.target.value)}
                      maxLength={120}
                    />
                    <button
                      type="button"
                      className={styles.small}
                      onClick={quickAddBrand}
                      disabled={busy || !newBrandName.trim()}
                    >
                      افزودن
                    </button>
                  </div>
                </div>

                <label className={`${styles.field} ${styles.full}`}>
                  <span>توضیحات</span>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    rows={5}
                  />
                </label>

                <label className={styles.field}>
                  <span>گارانتی</span>
                  <input
                    value={form.warranty}
                    onChange={(event) =>
                      setForm({ ...form, warranty: event.target.value })
                    }
                    placeholder="مثلاً ۱۸ ماه گارانتی شرکت"
                    maxLength={200}
                  />
                </label>

                <label className={styles.field}>
                  <span>وضعیت</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as FormState["status"],
                      })
                    }
                  >
                    <option value="draft">پیش‌نویس</option>
                    <option value="published">منتشرشده</option>
                  </select>
                </label>

                <label className={styles.field}>
                  <span>قیمت پایه (تومان)</span>
                  <input
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        price: Number(event.target.value) || 0,
                      })
                    }
                  />
                  {fieldErrors.price && (
                    <small className={styles.error}>{fieldErrors.price}</small>
                  )}
                </label>

                <label className={styles.field}>
                  <span>تخفیف پایه (٪)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.discount}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        discount: Number(event.target.value) || 0,
                      })
                    }
                  />
                  {fieldErrors.discount && (
                    <small className={styles.error}>{fieldErrors.discount}</small>
                  )}
                </label>

                <label className={styles.field}>
                  <span>موجودی پایه</span>
                  <input
                    type="number"
                    min={0}
                    value={form.stock}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        stock: Number(event.target.value) || 0,
                      })
                    }
                  />
                  {fieldErrors.stock && (
                    <small className={styles.error}>{fieldErrors.stock}</small>
                  )}
                </label>
              </div>
              <p className={styles.hint}>
                اگر وارینت تعریف کنید، قیمت و موجودی محصول از وارینت‌ها محاسبه
                می‌شود و این مقادیر پایه نادیده گرفته می‌شوند.
              </p>
            </div>
          )}

          {stepIndex === 1 && (
            <div className={styles.stepContent}>
              <h2>انتخاب دسته‌بندی</h2>
              <p className={styles.hint}>
                دسته‌ای را انتخاب کنید؛ انتخاب دسته برای پیش‌نویس مشخصات فنی مهم
                است.
              </p>
              <div className={styles.categoryPicker}>
                <button
                  type="button"
                  className={`${styles.categoryOption} ${form.category_id === null ? styles.categorySelected : ""}`}
                  onClick={() => setForm({ ...form, category_id: null })}
                >
                  بدون دسته
                </button>
                {flatCategories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    className={`${styles.categoryOption} ${form.category_id === category.id ? styles.categorySelected : ""}`}
                    style={{
                      paddingInlineStart: `calc(var(--space-3) + ${category.depth} * var(--space-5))`,
                    }}
                    onClick={() =>
                      setForm({ ...form, category_id: category.id })
                    }
                  >
                    {category.name}
                  </button>
                ))}
                {flatCategories.length === 0 && (
                  <p className={styles.emptyState}>
                    دسته‌ای تعریف نشده است؛ ابتدا از مسیر «دسته‌بندی‌ها» دسته بسازید.
                  </p>
                )}
              </div>
            </div>
          )}

          {stepIndex === 2 && (
            <div className={styles.stepContent}>
              <h2>تصاویر محصول</h2>
              <ProductImages
                images={form.images}
                onChange={(images) => setForm({ ...form, images })}
              />
              {fieldErrors.images && (
                <small className={styles.error}>{fieldErrors.images}</small>
              )}
            </div>
          )}

          {stepIndex === 3 && (
            <div className={styles.stepContent}>
              <h2>وارینت‌ها</h2>
              <ProductVariants
                variants={form.variants}
                onChange={(variants) => setForm({ ...form, variants })}
                basePrice={Number(form.price) || 0}
              />
              {fieldErrors.variants && (
                <small className={styles.error}>{fieldErrors.variants}</small>
              )}
            </div>
          )}

          {stepIndex === 4 && (
            <div className={styles.stepContent}>
              <div className={styles.specHeader}>
                <h2>مشخصات فنی</h2>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={applySpecTemplate}
                >
                  دریافت قالب دسته
                  {selectedCategory ? ` (${selectedCategory.name})` : ""}
                </button>
              </div>
              <p className={styles.hint}>
                اگر دسته‌ای انتخاب شده باشد، قالب مشخصات همان دسته را می‌توانید
                با یک کلیک به جدول اضافه کنید.
              </p>
              <div className={styles.specTable}>
                <div className={`${styles.specRow} ${styles.specHead}`}>
                  <span>کلید</span>
                  <span>مقدار</span>
                  <span />
                </div>
                {form.specifications.map((row, index) => (
                  <div className={styles.specRow} key={index}>
                    <input
                      value={row.key}
                      placeholder="مثلاً ram"
                      dir="ltr"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          specifications: form.specifications.map(
                            (item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, key: event.target.value }
                                : item,
                          ),
                        })
                      }
                    />
                    <input
                      value={row.value}
                      placeholder="مثلاً ۸ گیگابایت"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          specifications: form.specifications.map(
                            (item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, value: event.target.value }
                                : item,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className={styles.iconDanger}
                      onClick={() =>
                        setForm({
                          ...form,
                          specifications: form.specifications.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                      aria-label={`حذف مشخصه ${index + 1}`}
                    >
                      <i className="fas fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() =>
                    setForm({
                      ...form,
                      specifications: [
                        ...form.specifications,
                        { key: "", value: "" },
                      ],
                    })
                  }
                >
                  افزودن مشخصه
                </button>
              </div>
            </div>
          )}

          {stepIndex === 5 && (
            <div className={styles.stepContent}>
              <h2>پیش‌نمایش</h2>
              <div className={styles.preview}>
                <div className={styles.previewMain}>
                  <b>{form.name || "بدون عنوان"}</b>
                  <span dir="ltr">{form.slug}</span>
                  <p>{form.description || "توضیحی ثبت نشده است."}</p>
                  <div className={styles.previewMeta}>
                    <span>
                      برند: {brandList.find((item) => item.id === form.brand_id)?.name || "—"}
                    </span>
                    <span>
                      دسته: {selectedCategory?.name || "—"}
                    </span>
                    <span>گارانتی: {form.warranty || "—"}</span>
                    <span>
                      وضعیت: {form.status === "published" ? "منتشرشده" : "پیش‌نویس"}
                    </span>
                  </div>
                </div>
                <div className={styles.previewImages}>
                  {form.images.map((image) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${image.url}-${image.sort_order}`}
                      src={image.url}
                      alt={image.alt || "تصویر محصول"}
                    />
                  ))}
                  {form.images.length === 0 && (
                    <span className={styles.emptyState}>تصویری نیست</span>
                  )}
                </div>
              </div>

              <h3>وارینت‌ها ({form.variants.length.toLocaleString("fa-IR")})</h3>
              {form.variants.length > 0 ? (
                <div className={styles.previewVariants}>
                  {form.variants.map((variant, index) => (
                    <div className={styles.previewVariant} key={index}>
                      <span
                        className={styles.previewSwatch}
                        style={{ background: variant.color_code || "transparent" }}
                      />
                      <span>
                        {variant.color_name || "—"} / {variant.size || "—"}
                      </span>
                      <span>{variant.price.toLocaleString("fa-IR")} تومان</span>
                      <span>موجودی: {variant.stock.toLocaleString("fa-IR")}</span>
                      <span>SKU: {variant.sku || "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.hint}>
                  قیمت پایه: {form.price.toLocaleString("fa-IR")} تومان — موجودی:{" "}
                  {form.stock.toLocaleString("fa-IR")}
                </p>
              )}

              <h3>مشخصات ({form.specifications.length.toLocaleString("fa-IR")})</h3>
              {form.specifications.length > 0 && (
                <ul className={styles.previewSpecs}>
                  {form.specifications.map((row, index) => (
                    <li key={index}>
                      <b>{row.key}</b>
                      <span>{row.value || "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className={styles.dialogFooter}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            disabled={busy || stepIndex === 0}
          >
            قبلی
          </button>
          <div className={styles.footerActions}>
            {stepIndex === STEPS.length - 1 ? (
              <>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => save("draft")}
                  disabled={busy}
                >
                  {busy ? "در حال ذخیره…" : "ذخیرهٔ پیش‌نویس"}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => save("published")}
                  disabled={busy}
                >
                  {busy ? "در حال ذخیره…" : "انتشار محصول"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={() =>
                  setStepIndex((index) =>
                    Math.min(STEPS.length - 1, index + 1),
                  )
                }
                disabled={busy}
              >
                بعدی
              </button>
            )}
            {stepIndex !== STEPS.length - 1 && (
              <button type="button" className={styles.link} onClick={onClose}>
                انصراف
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
