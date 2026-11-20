"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Coupon } from "@/types/database";
import {
  createCoupon,
  deleteCoupon,
  toggleCoupon,
  updateCoupon,
  type CouponInput,
} from "@/lib/admin/actions/coupons";
import styles from "./coupons.module.css";

type FormState = CouponInput & { id?: string };

const emptyForm: FormState = {
  code: "",
  title: "",
  icon_url: null,
  discount_type: "percent",
  discount_value: 0,
  minimum_amount: 0,
  maximum_discount: null,
  usage_limit: null,
  sort_order: 0,
  starts_at: "",
  ends_at: "",
  audience: "all",
  audience_days: null,
  scope: "all",
  scope_category: "",
  is_active: true,
};

const AUDIENCE_LABELS: Record<CouponInput["audience"], string> = {
  all: "همهٔ کاربران",
  newUsers: "کاربران جدید",
  oldUsers: "کاربران همیشگی",
};

const SCOPE_LABELS: Record<CouponInput["scope"], string> = {
  all: "کل فروشگاه",
  category: "دسته‌بندی مشخص",
};

function audienceOf(coupon: Coupon): CouponInput["audience"] {
  return ["all", "newUsers", "oldUsers"].includes(coupon.audience)
    ? (coupon.audience as CouponInput["audience"])
    : "all";
}

function scopeOf(coupon: Coupon): CouponInput["scope"] {
  return ["all", "category"].includes(coupon.scope)
    ? (coupon.scope as CouponInput["scope"])
    : "all";
}

function toForm(coupon: Coupon): FormState {
  return {
    id: coupon.id,
    code: coupon.code,
    title: coupon.title,
    icon_url: coupon.icon_url,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    minimum_amount: coupon.minimum_amount,
    maximum_discount: coupon.maximum_discount,
    usage_limit: coupon.usage_limit,
    sort_order: coupon.sort_order,
    starts_at: coupon.starts_at ?? "",
    ends_at: coupon.ends_at ?? "",
    audience: audienceOf(coupon),
    audience_days: coupon.audience_days,
    scope: scopeOf(coupon),
    scope_category: coupon.scope_category ?? "",
    is_active: coupon.is_active,
  };
}

export function CouponsClient({
  coupons,
  loadError,
}: {
  coupons: Coupon[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    loadError ? "کدهای تخفیف از پایگاه داده خوانده نشدند." : "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function openCreate() {
    setForm({ ...emptyForm, sort_order: coupons.length });
    setFieldErrors({});
    setNotice("");
  }

  function openEdit(coupon: Coupon) {
    setForm(toForm(coupon));
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
      ? await updateCoupon(form.id, form)
      : await createCoupon(form);
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

  async function toggle(coupon: Coupon) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const result = await toggleCoupon(coupon.id, !coupon.is_active);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  async function remove(coupon: Coupon) {
    if (busy) return;
    if (!window.confirm(`کد تخفیف «${coupon.code}» حذف شود؟`)) return;
    setBusy(true);
    setNotice("");
    const result = await deleteCoupon(coupon.id);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>کدهای تخفیف</h1>
          <p>مدیریت کدهای تخفیف و قوانین استفاده از آن‌ها</p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={openCreate}
          disabled={busy}
        >
          <i className="fas fa-plus" aria-hidden="true" /> کد تخفیف جدید
        </button>
      </header>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {form && (
        <form className={styles.form} onSubmit={submit} noValidate>
          <h2>{form.id ? "ویرایش کد تخفیف" : "کد تخفیف جدید"}</h2>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>کد تخفیف *</span>
              <input
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value.toUpperCase() })
                }
                maxLength={40}
                dir="ltr"
                autoFocus
              />
              {fieldErrors.code && (
                <small className={styles.error}>{fieldErrors.code}</small>
              )}
            </label>

            <label className={styles.field}>
              <span>عنوان</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                maxLength={120}
              />
              {fieldErrors.title && (
                <small className={styles.error}>{fieldErrors.title}</small>
              )}
            </label>

            <label className={styles.field}>
              <span>نوع تخفیف</span>
              <select
                value={form.discount_type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    discount_type: event.target
                      .value as CouponInput["discount_type"],
                  })
                }
              >
                <option value="percent">درصدی</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
              {fieldErrors.discount_type && (
                <small className={styles.error}>
                  {fieldErrors.discount_type}
                </small>
              )}
            </label>

            <label className={styles.field}>
              <span>
                {form.discount_type === "percent"
                  ? "درصد تخفیف"
                  : "مبلغ تخفیف (تومان)"}
              </span>
              <input
                type="number"
                min={0}
                value={form.discount_value}
                onChange={(event) =>
                  setForm({
                    ...form,
                    discount_value: Number(event.target.value),
                  })
                }
              />
              {fieldErrors.discount_value && (
                <small className={styles.error}>
                  {fieldErrors.discount_value}
                </small>
              )}
            </label>

            <label className={styles.field}>
              <span>حداقل مبلغ خرید (تومان)</span>
              <input
                type="number"
                min={0}
                value={form.minimum_amount}
                onChange={(event) =>
                  setForm({
                    ...form,
                    minimum_amount: Number(event.target.value),
                  })
                }
              />
              {fieldErrors.minimum_amount && (
                <small className={styles.error}>
                  {fieldErrors.minimum_amount}
                </small>
              )}
            </label>

            <label className={styles.field}>
              <span>سقف تخفیف (تومان، اختیاری)</span>
              <input
                type="number"
                min={0}
                value={form.maximum_discount ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    maximum_discount: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
              {fieldErrors.maximum_discount && (
                <small className={styles.error}>
                  {fieldErrors.maximum_discount}
                </small>
              )}
            </label>

            <label className={styles.field}>
              <span>محدودیت استفاده (اختیاری)</span>
              <input
                type="number"
                min={0}
                value={form.usage_limit ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    usage_limit: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
              {fieldErrors.usage_limit && (
                <small className={styles.error}>
                  {fieldErrors.usage_limit}
                </small>
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
                    sort_order: Number(event.target.value),
                  })
                }
              />
              {fieldErrors.sort_order && (
                <small className={styles.error}>{fieldErrors.sort_order}</small>
              )}
            </label>

            <label className={styles.field}>
              <span>تاریخ شروع</span>
              <input
                type="date"
                value={form.starts_at}
                onChange={(event) =>
                  setForm({ ...form, starts_at: event.target.value })
                }
              />
              {fieldErrors.starts_at && (
                <small className={styles.error}>{fieldErrors.starts_at}</small>
              )}
            </label>

            <label className={styles.field}>
              <span>تاریخ پایان</span>
              <input
                type="date"
                value={form.ends_at}
                onChange={(event) =>
                  setForm({ ...form, ends_at: event.target.value })
                }
              />
              {fieldErrors.ends_at && (
                <small className={styles.error}>{fieldErrors.ends_at}</small>
              )}
            </label>

            <label className={styles.field}>
              <span>مخاطب</span>
              <select
                value={form.audience}
                onChange={(event) =>
                  setForm({
                    ...form,
                    audience: event.target
                      .value as CouponInput["audience"],
                  })
                }
              >
                {(
                  Object.entries(AUDIENCE_LABELS) as Array<
                    [CouponInput["audience"], string]
                  >
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {fieldErrors.audience && (
                <small className={styles.error}>{fieldErrors.audience}</small>
              )}
            </label>

            <label className={styles.field}>
              <span>بازهٔ مخاطب (روز، اختیاری)</span>
              <input
                type="number"
                min={1}
                value={form.audience_days ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    audience_days: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
              {fieldErrors.audience_days && (
                <small className={styles.error}>
                  {fieldErrors.audience_days}
                </small>
              )}
            </label>

            <label className={styles.field}>
              <span>دامنهٔ تخفیف</span>
              <select
                value={form.scope}
                onChange={(event) =>
                  setForm({
                    ...form,
                    scope: event.target.value as CouponInput["scope"],
                  })
                }
              >
                {(
                  Object.entries(SCOPE_LABELS) as Array<
                    [CouponInput["scope"], string]
                  >
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {fieldErrors.scope && (
                <small className={styles.error}>{fieldErrors.scope}</small>
              )}
            </label>

            {form.scope === "category" && (
              <label className={styles.field}>
                <span>نام دسته‌بندی *</span>
                <input
                  value={form.scope_category}
                  onChange={(event) =>
                    setForm({ ...form, scope_category: event.target.value })
                  }
                  maxLength={120}
                />
                {fieldErrors.scope_category && (
                  <small className={styles.error}>
                    {fieldErrors.scope_category}
                  </small>
                )}
              </label>
            )}

            <label className={`${styles.field} ${styles.full}`}>
              <span>آیکون (لینک تصویر، اختیاری)</span>
              <input
                value={form.icon_url ?? ""}
                onChange={(event) =>
                  setForm({ ...form, icon_url: event.target.value })
                }
                maxLength={1000}
                dir="ltr"
              />
              {fieldErrors.icon_url && (
                <small className={styles.error}>{fieldErrors.icon_url}</small>
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
              <span>کد تخفیف فعال باشد</span>
            </label>
          </div>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "در حال ذخیره…" : "ذخیرهٔ کد تخفیف"}
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

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>کد</th>
              <th>عنوان</th>
              <th>تخفیف</th>
              <th>حداقل خرید</th>
              <th>استفاده</th>
              <th>مخاطب / دامنه</th>
              <th>اعتبار</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.id}>
                <td dir="ltr">{coupon.code}</td>
                <td>{coupon.title || <span className={styles.muted}>—</span>}</td>
                <td>
                  {coupon.discount_type === "percent"
                    ? `${coupon.discount_value.toLocaleString("fa-IR")}٪`
                    : `${coupon.discount_value.toLocaleString("fa-IR")} تومان`}
                </td>
                <td>
                  {coupon.minimum_amount.toLocaleString("fa-IR")} تومان
                </td>
                <td>
                  {coupon.used_count.toLocaleString("fa-IR")}
                  {coupon.usage_limit !== null
                    ? ` / ${coupon.usage_limit.toLocaleString("fa-IR")}`
                    : ""}
                </td>
                <td className={styles.muted}>
                  {AUDIENCE_LABELS[audienceOf(coupon)]}
                  {" · "}
                  {SCOPE_LABELS[scopeOf(coupon)]}
                  {coupon.scope_category ? ` (${coupon.scope_category})` : ""}
                </td>
                <td className={styles.muted}>
                  {coupon.starts_at ?? "—"} تا {coupon.ends_at ?? "—"}
                </td>
                <td>
                  <button
                    type="button"
                    className={`${styles.status} ${coupon.is_active ? styles.statusActive : ""}`}
                    onClick={() => toggle(coupon)}
                    disabled={busy}
                  >
                    {coupon.is_active ? "فعال" : "غیرفعال"}
                  </button>
                </td>
                <td className={styles.actions}>
                  <button
                    type="button"
                    aria-label={`ویرایش ${coupon.code}`}
                    onClick={() => openEdit(coupon)}
                    disabled={busy}
                  >
                    <i className="fas fa-pen" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    aria-label={`حذف ${coupon.code}`}
                    onClick={() => remove(coupon)}
                    disabled={busy}
                  >
                    <i className="fas fa-trash" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr>
                <td colSpan={9}>کد تخفیفی ثبت نشده است.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
