"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/types/database";
import { ImageUploader } from "@/components/admin/image-uploader";
import {
  createCategory,
  deleteCategory,
  moveCategory,
  toggleCategory,
  updateCategory,
  type CategoryInput,
  type CategorySpecField,
} from "@/lib/admin/actions/categories";
import styles from "./categories.module.css";

type CategoryNode = Category & { children: CategoryNode[] };

type FormState = CategoryInput & { id?: number };

const emptySpec: CategorySpecField = {
  key: "",
  label: "",
  type: "text",
  unit: "",
};

const emptyForm: FormState = {
  name: "",
  slug: "",
  parent_id: null,
  image_url: null,
  icon: "",
  sort_order: 0,
  is_active: true,
  spec_template: [],
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‌\s_]+/g, "-")
    .replace(/[^a-z0-9آ-ی-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

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

function flattenTree(nodes: CategoryNode[], depth = 0): Array<CategoryNode & { depth: number }> {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenTree(node.children, depth + 1),
  ]);
}

function specFieldCount(category: Category): number {
  return Array.isArray(category.spec_template)
    ? category.spec_template.length
    : 0;
}

export function CategoriesClient({
  categories,
  loadError,
}: {
  categories: Category[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    loadError ? "دسته‌بندی‌ها از پایگاه داده خوانده نشدند." : "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const tree = buildTree(categories);
  const flat = flattenTree(tree);

  function openCreate() {
    setForm({ ...emptyForm, sort_order: categories.length });
    setFieldErrors({});
    setNotice("");
  }

  function openEdit(category: Category) {
    const template = Array.isArray(category.spec_template)
      ? (category.spec_template as CategorySpecField[])
      : [];
    setForm({
      id: category.id,
      name: category.name,
      slug: category.slug,
      parent_id: category.parent_id,
      image_url: category.image_url,
      icon: category.icon,
      sort_order: category.sort_order,
      is_active: category.is_active,
      spec_template: template.map((field) => ({ ...emptySpec, ...field })),
    });
    setFieldErrors({});
    setNotice("");
  }

  function setSpec(index: number, patch: Partial<CategorySpecField>) {
    if (!form) return;
    setForm({
      ...form,
      spec_template: form.spec_template.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !form) return;
    setBusy(true);
    setNotice("");
    setFieldErrors({});
    const result = form.id
      ? await updateCategory(form.id, form)
      : await createCategory(form);
    if (result.ok) {
      setNotice(result.message);
      setForm(null);
      router.refresh();
    } else {
      setNotice(result.message);
      setFieldErrors(result.fieldErrors ?? {});
    }
    setBusy(false);
  }

  async function toggle(category: Category) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const result = await toggleCategory(category.id, !category.is_active);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  async function move(category: Category, direction: "up" | "down") {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const result = await moveCategory(category.id, direction);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  async function remove(category: Category) {
    if (busy) return;
    if (!window.confirm(`دسته‌بندی «${category.name}» حذف شود؟`)) return;
    setBusy(true);
    setNotice("");
    const result = await deleteCategory(category.id);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>دسته‌بندی‌ها</h1>
          <p>درخت دسته‌بندی، قالب مشخصات و ترتیب نمایش</p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={openCreate}
          disabled={busy}
        >
          <i className="fas fa-plus" aria-hidden="true" /> افزودن دسته
        </button>
      </header>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {form && (
        <form className={styles.form} onSubmit={submit} noValidate>
          <h2>{form.id ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"}</h2>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span>نام دسته *</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                maxLength={120}
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
                  maxLength={160}
                  dir="ltr"
                />
                <button
                  type="button"
                  className={styles.small}
                  onClick={() => setForm({ ...form, slug: slugify(form.name) })}
                >
                  از نام بساز
                </button>
              </div>
              {fieldErrors.slug && (
                <small className={styles.error}>{fieldErrors.slug}</small>
              )}
            </label>

            <label className={styles.field}>
              <span>دستهٔ مادر</span>
              <select
                value={form.parent_id === null ? "" : String(form.parent_id)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    parent_id: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              >
                <option value="">بدون مادر (ریشه)</option>
                {flat.map((category) => (
                  <option key={category.id} value={category.id}>
                    {`${"— ".repeat(category.depth)}${category.name}`}
                  </option>
                ))}
              </select>
              {fieldErrors.parent_id && (
                <small className={styles.error}>{fieldErrors.parent_id}</small>
              )}
            </label>

            <label className={styles.field}>
              <span>ترتیب نمایش</span>
              <input
                type="number"
                value={form.sort_order}
                onChange={(event) =>
                  setForm({
                    ...form,
                    sort_order: Number(event.target.value) || 0,
                  })
                }
              />
              {fieldErrors.sort_order && (
                <small className={styles.error}>{fieldErrors.sort_order}</small>
              )}
            </label>

            <div className={`${styles.field} ${styles.full}`}>
              <ImageUploader
                label="تصویر دسته‌بندی"
                value={form.image_url}
                onChange={(url) => setForm({ ...form, image_url: url })}
                maxSizeMB={4}
                compress={{ maxWidth: 800, quality: 0.85 }}
              />
            </div>

            <label className={styles.field}>
              <span>آیکون (کلاس Font Awesome)</span>
              <input
                value={form.icon}
                onChange={(event) =>
                  setForm({ ...form, icon: event.target.value })
                }
                placeholder="fas fa-mobile"
                maxLength={80}
                dir="ltr"
              />
              {fieldErrors.icon && (
                <small className={styles.error}>{fieldErrors.icon}</small>
              )}
            </label>

            <label className={`${styles.field} ${styles.inline}`}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  setForm({ ...form, is_active: event.target.checked })
                }
              />
              <span>دسته فعال باشد</span>
            </label>
          </div>

          <div className={styles.specBlock}>
            <div className={styles.specHeader}>
              <h3>قالب مشخصات فنی این دسته</h3>
              <button
                type="button"
                className={styles.small}
                onClick={() =>
                  setForm({
                    ...form,
                    spec_template: [...form.spec_template, { ...emptySpec }],
                  })
                }
              >
                افزودن فیلد
              </button>
            </div>
            <p className={styles.specHint}>
              این قالب در فرم محصولاتِ همین دسته به‌صورت خودکار پیش‌نویس می‌شود.
            </p>
            {form.spec_template.length === 0 && (
              <p className={styles.specEmpty}>فیلدی تعریف نشده است.</p>
            )}
            {form.spec_template.map((field, index) => (
              <div className={styles.specRow} key={index}>
                <input
                  value={field.label}
                  placeholder="عنوان (مثلاً حافظه)"
                  onChange={(event) => setSpec(index, { label: event.target.value })}
                />
                <input
                  value={field.key}
                  placeholder="کلید (ram)"
                  dir="ltr"
                  onChange={(event) => setSpec(index, { key: event.target.value })}
                />
                <select
                  value={field.type}
                  onChange={(event) =>
                    setSpec(index, {
                      type: event.target.value as CategorySpecField["type"],
                    })
                  }
                >
                  <option value="text">متن</option>
                  <option value="number">عدد</option>
                  <option value="select">انتخابی</option>
                </select>
                <input
                  value={field.unit}
                  placeholder="واحد (گیگابایت)"
                  onChange={(event) => setSpec(index, { unit: event.target.value })}
                />
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() =>
                    setForm({
                      ...form,
                      spec_template: form.spec_template.filter(
                        (_, fieldIndex) => fieldIndex !== index,
                      ),
                    })
                  }
                  aria-label={`حذف فیلد ${index + 1}`}
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </div>
            ))}
            {fieldErrors.spec_template && (
              <small className={styles.error}>{fieldErrors.spec_template}</small>
            )}
          </div>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "در حال ذخیره…" : "ذخیرهٔ دسته‌بندی"}
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setForm(null)}
              disabled={busy}
            >
              انصراف
            </button>
          </div>
        </form>
      )}

      <div className={styles.tree}>
        {flat.map((category) => (
          <div
            key={category.id}
            className={`${styles.row} ${category.is_active ? "" : styles.rowInactive}`}
            style={{ paddingInlineStart: `calc(var(--space-4) + ${category.depth} * var(--space-6))` }}
          >
            <div className={styles.rowMain}>
              <span className={styles.name}>
                {category.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={category.image_url} alt="" />
                ) : (
                  <span className={styles.imagePlaceholder}>
                    <i className="fas fa-folder" aria-hidden="true" />
                  </span>
                )}
                <span>
                  <b>{category.name}</b>
                  <small dir="ltr">{category.slug}</small>
                </span>
              </span>
              <span className={styles.meta}>
                {category.icon && (
                  <i className={category.icon} aria-hidden="true" title={category.icon} />
                )}
                {specFieldCount(category) > 0 && (
                  <span className={styles.badge}>
                    {specFieldCount(category).toLocaleString("fa-IR")} فیلد
                  </span>
                )}
                <span className={styles.badge}>
                  {category.sort_order.toLocaleString("fa-IR")}
                </span>
                <button
                  type="button"
                  className={`${styles.status} ${category.is_active ? styles.statusActive : ""}`}
                  onClick={() => toggle(category)}
                  disabled={busy}
                  title="تغییر وضعیت"
                >
                  {category.is_active ? "فعال" : "غیرفعال"}
                </button>
              </span>
              <span className={styles.actions}>
                <button
                  type="button"
                  aria-label="جابجایی به بالا"
                  onClick={() => move(category, "up")}
                  disabled={busy}
                >
                  <i className="fas fa-arrow-up" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="جابجایی به پایین"
                  onClick={() => move(category, "down")}
                  disabled={busy}
                >
                  <i className="fas fa-arrow-down" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`ویرایش ${category.name}`}
                  onClick={() => openEdit(category)}
                  disabled={busy}
                >
                  <i className="fas fa-pen" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  aria-label={`حذف ${category.name}`}
                  onClick={() => remove(category)}
                  disabled={busy}
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </span>
            </div>
          </div>
        ))}
        {flat.length === 0 && <p className={styles.empty}>دسته‌ای ثبت نشده است.</p>}
      </div>
    </div>
  );
}
