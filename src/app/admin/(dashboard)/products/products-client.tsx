"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { Brand, Category, Product } from "@/types/database";
import type { AdminProduct, ProductFilters } from "@/types/admin";
import {
  bulkDeleteProducts,
  bulkUpdateProducts,
  deleteProduct,
  duplicateProduct,
  updateProductQuick,
} from "@/lib/admin/actions/products";
import { ProductForm } from "./product-form";
import styles from "./products.module.css";

type QuickEditState = {
  id: number;
  name: string;
  price: string;
  stock: string;
  is_active: boolean;
};

function buildQuery(filters: ProductFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.category_id) params.set("category_id", filters.category_id);
  if (filters.brand_id) params.set("brand_id", filters.brand_id);
  if (filters.stock) params.set("stock", filters.stock);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort) params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/products?${query}` : "/admin/products";
}

function categoryLabels(categories: Category[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return (category: Category): string => {
    const parts: string[] = [];
    let cursor: Category | undefined = category;
    let guard = 0;
    while (cursor && guard < 20) {
      parts.unshift(cursor.name);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
      guard += 1;
    }
    return parts.join(" / ");
  };
}

export function ProductsClient({
  products,
  total,
  pageSize,
  filters,
  categories,
  brands,
  loadError,
}: {
  products: AdminProduct[];
  total: number;
  pageSize: number;
  filters: ProductFilters;
  categories: Category[];
  brands: Brand[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [filterDraft, setFilterDraft] = useState(filters);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [quickEdit, setQuickEdit] = useState<QuickEditState | null>(null);
  const [formProduct, setFormProduct] = useState<AdminProduct | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    loadError ? "محصولات از پایگاه داده خوانده نشدند." : "",
  );

  const labelOf = useMemo(() => categoryLabels(categories), [categories]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = products.length > 0 && selected.size === products.length;

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    router.push(buildQuery(filterDraft, 1) as Route);
  }

  function clearFilters() {
    setFilterDraft({
      q: "",
      category_id: "",
      brand_id: "",
      stock: "",
      status: "",
      sort: "newest",
      page: 1,
    });
    router.push("/admin/products");
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(products.map((item) => item.id)));
  }

  function toggleOne(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(
    action: (ids: number[]) => Promise<{ ok: boolean; message: string }>,
    confirmMessage?: string,
  ) {
    if (busy || selected.size === 0) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    setNotice("");
    const result = await action([...selected]);
    setNotice(result.message);
    setSelected(new Set());
    setBusy(false);
    router.refresh();
  }

  async function applyBulkCategory() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setNotice("");
    const result = await bulkUpdateProducts([...selected], {
      category_id: bulkCategory ? Number(bulkCategory) : null,
    });
    setNotice(result.message);
    setSelected(new Set());
    setBulkCategory("");
    setBusy(false);
    router.refresh();
  }

  async function remove(product: Product) {
    if (busy) return;
    if (!window.confirm(`محصول «${product.name}» حذف شود؟`)) return;
    setBusy(true);
    setNotice("");
    const result = await deleteProduct(product.id);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  async function duplicate(product: Product) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const result = await duplicateProduct(product.id);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  async function submitQuickEdit(event: FormEvent) {
    event.preventDefault();
    if (busy || !quickEdit) return;
    setBusy(true);
    setNotice("");
    const result = await updateProductQuick(quickEdit.id, {
      price: quickEdit.price === "" ? undefined : Number(quickEdit.price),
      stock: quickEdit.stock === "" ? undefined : Number(quickEdit.stock),
      is_active: quickEdit.is_active,
    });
    setNotice(result.message);
    setQuickEdit(null);
    setBusy(false);
    router.refresh();
  }

  function openCreate() {
    setFormProduct(null);
    setFormOpen(true);
  }

  function openEdit(product: AdminProduct) {
    setFormProduct(product);
    setFormOpen(true);
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>محصولات</h1>
          <p>جستجو، فیلتر، ویرایش گروهی و کاتالوگ کامل محصولات</p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={openCreate}
          disabled={busy}
        >
          <i className="fas fa-plus" aria-hidden="true" /> محصول جدید
        </button>
      </header>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      <form className={styles.filters} onSubmit={applyFilters}>
        <input
          value={filterDraft.q}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, q: event.target.value, page: 1 })
          }
          placeholder="جستجو در نام محصول…"
          aria-label="جستجوی محصول"
        />
        <select
          value={filterDraft.category_id}
          onChange={(event) =>
            setFilterDraft({
              ...filterDraft,
              category_id: event.target.value,
              page: 1,
            })
          }
          aria-label="فیلتر دسته‌بندی"
        >
          <option value="">همهٔ دسته‌ها</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {labelOf(category)}
            </option>
          ))}
        </select>
        <select
          value={filterDraft.brand_id}
          onChange={(event) =>
            setFilterDraft({
              ...filterDraft,
              brand_id: event.target.value,
              page: 1,
            })
          }
          aria-label="فیلتر برند"
        >
          <option value="">همهٔ برندها</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
        <select
          value={filterDraft.stock}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, stock: event.target.value, page: 1 })
          }
          aria-label="فیلتر موجودی"
        >
          <option value="">همهٔ موجودی‌ها</option>
          <option value="in">موجود</option>
          <option value="low">کم (۵ یا کمتر)</option>
          <option value="out">ناموجود</option>
        </select>
        <select
          value={filterDraft.status}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, status: event.target.value, page: 1 })
          }
          aria-label="فیلتر وضعیت"
        >
          <option value="">همهٔ وضعیت‌ها</option>
          <option value="published">منتشرشده</option>
          <option value="draft">پیش‌نویس</option>
          <option value="active">فعال</option>
          <option value="inactive">غیرفعال</option>
        </select>
        <select
          value={filterDraft.sort}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, sort: event.target.value, page: 1 })
          }
          aria-label="مرتب‌سازی"
        >
          <option value="newest">جدیدترین</option>
          <option value="oldest">قدیمی‌ترین</option>
          <option value="price_asc">قیمت: کم به زیاد</option>
          <option value="price_desc">قیمت: زیاد به کم</option>
          <option value="name">نام</option>
          <option value="stock">موجودی</option>
        </select>
        <button type="submit" className={styles.primary}>
          اعمال
        </button>
        <button type="button" className={styles.ghost} onClick={clearFilters}>
          پاک‌کردن
        </button>
      </form>

      {selected.size > 0 && (
        <div className={styles.bulkBar}>
          <span>
            {selected.size.toLocaleString("fa-IR")} محصول انتخاب شده
          </span>
          <button
            type="button"
            className={styles.ghost}
            onClick={() =>
              runBulk((ids) => bulkUpdateProducts(ids, { is_active: true }))
            }
            disabled={busy}
          >
            فعال‌کردن
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() =>
              runBulk((ids) => bulkUpdateProducts(ids, { is_active: false }))
            }
            disabled={busy}
          >
            غیرفعال‌کردن
          </button>
          <select
            value={bulkCategory}
            onChange={(event) => setBulkCategory(event.target.value)}
            aria-label="تغییر دستهٔ گروهی"
          >
            <option value="">انتخاب دسته…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {labelOf(category)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.ghost}
            onClick={applyBulkCategory}
            disabled={busy || !bulkCategory}
          >
            تغییر دسته
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() =>
              runBulk(bulkDeleteProducts, "محصولات انتخاب‌شده حذف شوند؟")
            }
            disabled={busy}
          >
            حذف گروهی
          </button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="انتخاب همه"
                />
              </th>
              <th>تصویر</th>
              <th>نام</th>
              <th>دسته</th>
              <th>برند</th>
              <th>قیمت</th>
              <th>موجودی</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className={selected.has(product.id) ? styles.rowSelected : ""}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggleOne(product.id)}
                    aria-label={`انتخاب ${product.name}`}
                  />
                </td>
                <td>
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt="" />
                  ) : (
                    <span className={styles.imagePlaceholder}>
                      <i className="fas fa-image" aria-hidden="true" />
                    </span>
                  )}
                </td>
                <td>
                  <b>{product.name}</b>
                  <small dir="ltr">{product.slug ?? ""}</small>
                </td>
                <td>{product.category || "—"}</td>
                <td>{product.brand || "—"}</td>
                <td>{product.price.toLocaleString("fa-IR")} تومان</td>
                <td>
                  <span
                    className={`${styles.stock} ${product.stock === 0 ? styles.stockOut : product.stock <= 5 ? styles.stockLow : ""}`}
                  >
                    {product.stock.toLocaleString("fa-IR")}
                  </span>
                </td>
                <td>
                  <span
                    className={`${styles.status} ${product.is_active && product.status === "published" ? styles.statusActive : ""}`}
                  >
                    {product.status === "draft"
                      ? "پیش‌نویس"
                      : product.is_active
                        ? "منتشرشده"
                        : "غیرفعال"}
                  </span>
                </td>
                <td className={styles.actions}>
                  <button
                    type="button"
                    aria-label={`ویرایش سریع ${product.name}`}
                    onClick={() =>
                      setQuickEdit({
                        id: product.id,
                        name: product.name,
                        price: String(product.price),
                        stock: String(product.stock),
                        is_active: product.is_active,
                      })
                    }
                    disabled={busy}
                  >
                    <i className="fas fa-bolt" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`ویرایش ${product.name}`}
                    onClick={() => openEdit(product)}
                    disabled={busy}
                  >
                    <i className="fas fa-pen" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`کپی ${product.name}`}
                    onClick={() => duplicate(product)}
                    disabled={busy}
                  >
                    <i className="fas fa-copy" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    aria-label={`حذف ${product.name}`}
                    onClick={() => remove(product)}
                    disabled={busy}
                  >
                    <i className="fas fa-trash" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={9}>محصولی یافت نشد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            disabled={filters.page <= 1}
            onClick={() =>
              router.push(buildQuery(filters, filters.page - 1) as Route)
            }
          >
            قبلی
          </button>
          <span>
            صفحهٔ {filters.page.toLocaleString("fa-IR")} از{" "}
            {totalPages.toLocaleString("fa-IR")}
          </span>
          <button
            type="button"
            disabled={filters.page >= totalPages}
            onClick={() =>
              router.push(buildQuery(filters, filters.page + 1) as Route)
            }
          >
            بعدی
          </button>
        </div>
      )}

      {quickEdit && (
        <div className={styles.overlay}>
          <form className={styles.modal} onSubmit={submitQuickEdit}>
            <h2>ویرایش سریع: {quickEdit.name}</h2>
            <label className={styles.field}>
              <span>قیمت (تومان)</span>
              <input
                type="number"
                min={0}
                value={quickEdit.price}
                onChange={(event) =>
                  setQuickEdit({ ...quickEdit, price: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              <span>موجودی</span>
              <input
                type="number"
                min={0}
                value={quickEdit.stock}
                onChange={(event) =>
                  setQuickEdit({ ...quickEdit, stock: event.target.value })
                }
              />
            </label>
            <label className={styles.inlineField}>
              <input
                type="checkbox"
                checked={quickEdit.is_active}
                onChange={(event) =>
                  setQuickEdit({
                    ...quickEdit,
                    is_active: event.target.checked,
                  })
                }
              />
              <span>محصول فعال باشد</span>
            </label>
            <div className={styles.modalActions}>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? "در حال ذخیره…" : "ذخیره"}
              </button>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setQuickEdit(null)}
                disabled={busy}
              >
                انصراف
              </button>
            </div>
          </form>
        </div>
      )}

      {formOpen && (
        <ProductForm
          product={formProduct}
          categories={categories}
          brands={brands}
          onClose={() => setFormOpen(false)}
          onSaved={(message) => {
            setFormOpen(false);
            setNotice(message);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
