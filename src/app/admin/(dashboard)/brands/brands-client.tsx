"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Brand } from "@/types/database";
import { ImageUploader } from "@/components/admin/image-uploader";
import {
  createBrand,
  deleteBrand,
  toggleBrand,
  updateBrand,
  type BrandInput,
} from "@/lib/admin/actions/brands";
import styles from "./brands.module.css";

type FormState = BrandInput & { id?: number };

const emptyForm: FormState = {
  name: "",
  slug: "",
  description: "",
  logo_url: null,
  is_active: true,
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

export function BrandsClient({
  brands,
  loadError,
}: {
  brands: Brand[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    loadError ? "برندها از پایگاه داده خوانده نشدند." : "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const visibleBrands = brands.filter((brand) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${brand.name} ${brand.slug} ${brand.description}`.toLowerCase().includes(query);
  });

  function openCreate() {
    setForm({ ...emptyForm });
    setFieldErrors({});
    setNotice("");
  }

  function openEdit(brand: Brand) {
    setForm({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      description: brand.description,
      logo_url: brand.logo_url,
      is_active: brand.is_active,
    });
    setFieldErrors({});
    setNotice("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !form) return;
    setBusy(true);
    setNotice("");
    setFieldErrors({});
    const result = form.id
      ? await updateBrand(form.id, form)
      : await createBrand(form);
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

  async function toggle(brand: Brand) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const result = await toggleBrand(brand.id, !brand.is_active);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  async function remove(brand: Brand) {
    if (busy) return;
    if (!window.confirm(`برند «${brand.name}» حذف شود؟`)) return;
    setBusy(true);
    setNotice("");
    const result = await deleteBrand(brand.id);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>برندها</h1>
          <p>مدیریت برندهای کاتالوگ محصولات</p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={openCreate}
          disabled={busy}
        >
          <i className="fas fa-plus" aria-hidden="true" /> افزودن برند
        </button>
      </header>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {form && (
        <form className={styles.form} onSubmit={submit} noValidate>
          <h2>{form.id ? "ویرایش برند" : "برند جدید"}</h2>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>نام برند *</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          name: event.target.value,
                          slug: current.id || current.slug
                            ? current.slug
                            : slugify(event.target.value),
                        }
                      : current,
                  )
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
                  onClick={() =>
                    setForm({ ...form, slug: slugify(form.name) })
                  }
                >
                  از نام بساز
                </button>
              </div>
              {fieldErrors.slug && (
                <small className={styles.error}>{fieldErrors.slug}</small>
              )}
            </label>

            <label className={`${styles.field} ${styles.full}`}>
              <span>توضیح</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                rows={3}
                maxLength={1000}
              />
              {fieldErrors.description && (
                <small className={styles.error}>{fieldErrors.description}</small>
              )}
            </label>

            <div className={`${styles.field} ${styles.full}`}>
              <ImageUploader
                label="لوگوی برند"
                value={form.logo_url}
                onChange={(url) => setForm({ ...form, logo_url: url })}
                maxSizeMB={4}
                compress={{ maxWidth: 800, quality: 0.85 }}
              />
            </div>

            <label className={`${styles.field} ${styles.inline}`}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  setForm({ ...form, is_active: event.target.checked })
                }
              />
              <span>برند فعال باشد</span>
            </label>
          </div>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "در حال ذخیره…" : "ذخیرهٔ برند"}
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

      <div className={styles.toolbar}>
        <label>
          <i className="fas fa-search" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجوی نام، اسلاگ یا توضیح برند"
          />
        </label>
        <span>{visibleBrands.length.toLocaleString("fa-IR")} برند</span>
        {search && (
          <button type="button" className={styles.small} onClick={() => setSearch("")}>
            پاک کردن
          </button>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>لوگو</th>
              <th>نام</th>
              <th>اسلاگ</th>
              <th>توضیح</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {visibleBrands.map((brand) => (
              <tr key={brand.id}>
                <td>
                  {brand.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.logo_url} alt={brand.name} />
                  ) : (
                    <span className={styles.logoPlaceholder}>
                      <i className="fas fa-image" aria-hidden="true" />
                    </span>
                  )}
                </td>
                <td>{brand.name}</td>
                <td dir="ltr">{brand.slug}</td>
                <td className={styles.muted}>{brand.description || "—"}</td>
                <td>
                  <button
                    type="button"
                    className={`${styles.status} ${brand.is_active ? styles.statusActive : ""}`}
                    onClick={() => toggle(brand)}
                    disabled={busy}
                  >
                    {brand.is_active ? "فعال" : "غیرفعال"}
                  </button>
                </td>
                <td className={styles.actions}>
                  <button
                    type="button"
                    aria-label={`ویرایش ${brand.name}`}
                    onClick={() => openEdit(brand)}
                    disabled={busy}
                  >
                    <i className="fas fa-pen" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    aria-label={`حذف ${brand.name}`}
                    onClick={() => remove(brand)}
                    disabled={busy}
                  >
                    <i className="fas fa-trash" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {visibleBrands.length === 0 && (
              <tr>
                <td colSpan={6}>
                  {brands.length === 0
                    ? "برندی ثبت نشده است."
                    : "برندی با این جستجو یافت نشد."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
