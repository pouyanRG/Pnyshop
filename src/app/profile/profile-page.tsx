"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Order, Profile } from "@/types/database";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useStorefrontTheme } from "@/components/storefront/use-storefront-theme";
import styles from "./profile-page.module.css";

type ProfileFields = Pick<
  Profile,
  | "id"
  | "name"
  | "mobile"
  | "melli"
  | "address"
  | "postal_code"
  | "wallet"
  | "points"
  | "created_at"
  | "wishlist"
>;

type ProfileOrder = {
  id: string;
  status: Order["status"];
  total_amount: number;
  created_at: string;
};

type Props = {
  email: string;
  profile: ProfileFields | null;
  orders: ProfileOrder[];
  profileUnavailable: boolean;
  ordersUnavailable: boolean;
};

type EditableProfile = {
  name: string;
  mobile: string;
  melli: string;
  address: string;
  postal_code: string;
};

type Section = "personal" | "orders" | "favorites" | "wallet" | "appearance";
type Notice = { message: string; error: boolean };

const EDITABLE_FIELDS: Array<{
  key: keyof EditableProfile;
  label: string;
  icon: string;
  wide?: boolean;
}> = [
  { key: "mobile", label: "شماره موبایل", icon: "fa-mobile-alt" },
  { key: "melli", label: "کد ملی", icon: "fa-id-card" },
  { key: "name", label: "نام و نام خانوادگی", icon: "fa-user" },
  { key: "address", label: "آدرس پستی مرسولات", icon: "fa-map-marker-alt", wide: true },
  { key: "postal_code", label: "کد پستی", icon: "fa-envelope-open-text" },
];

const ORDER_STATUSES: Record<string, string> = {
  pending_payment: "در انتظار پرداخت",
  paid: "پرداخت‌شده",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  failed_payment: "پرداخت ناموفق",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "long" }).format(
    new Date(value),
  );
}

export function ProfilePage({
  email,
  profile,
  orders,
  profileUnavailable,
  ordersUnavailable,
}: Props) {
  const router = useRouter();
  const { preference, setThemePreference } = useStorefrontTheme();
  const [section, setSection] = useState<Section>("personal");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showDelivered, setShowDelivered] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [values, setValues] = useState<EditableProfile>({
    name: profile?.name ?? "",
    mobile: profile?.mobile ?? "",
    melli: profile?.melli ?? "",
    address: profile?.address ?? "",
    postal_code: profile?.postal_code ?? "",
  });
  const wishlistCount = Array.isArray(profile?.wishlist)
    ? profile.wishlist.length
    : 0;

  function updateField(key: keyof EditableProfile, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function cancelEdit() {
    setValues({
      name: profile?.name ?? "",
      mobile: profile?.mobile ?? "",
      melli: profile?.melli ?? "",
      address: profile?.address ?? "",
      postal_code: profile?.postal_code ?? "",
    });
    setEditing(false);
    setNotice(null);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const mobile = values.mobile.replace(/[۰-۹٠-٩]/g, (digit) => {
      const persian = "۰۱۲۳۴۵۶۷۸۹";
      const arabic = "٠١٢٣٤٥٦٧٨٩";
      const index = persian.indexOf(digit);
      return String(index >= 0 ? index : arabic.indexOf(digit));
    });
    if (mobile && !/^09\d{9}$/.test(mobile)) {
      setNotice({ message: "شماره موبایل معتبر نیست.", error: true });
      return;
    }

    setSaving(true);
    try {
      const supabase = await createSupabaseBrowserClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          name: values.name.trim(),
          mobile: mobile || null,
          melli: values.melli.trim() || null,
          address: values.address.trim() || null,
          postal_code: values.postal_code.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile?.id ?? "");

      if (error) throw error;

      setNotice({ message: "اطلاعات حساب با موفقیت ذخیره شد.", error: false });
      setEditing(false);
      router.refresh();
    } catch (error) {
      console.error("Could not save the signed-in user's profile:", error);
      setNotice({
        message: "ذخیرهٔ اطلاعات انجام نشد. وضعیت اتصال و مجوزها را بررسی کنید.",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      const supabase = await createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.localStorage.removeItem("current_user");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Could not sign out:", error);
      setNotice({
        message: "خروج از حساب انجام نشد. دوباره تلاش کنید.",
        error: true,
      });
      setSigningOut(false);
    }
  }

  const visibleOrders = orders.filter((order) =>
    showDelivered
      ? order.status === "delivered"
      : order.status !== "delivered",
  );

  return (
    <div className={`${styles.page} profile-page`}>
      <StorefrontHeader />

      <main className={styles.container}>
        <aside className={styles.sidebar}>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>
              <i className="fas fa-user" aria-hidden="true" />
            </div>
            <h1>{profile?.name || "کاربر فروشگاه"}</h1>
            <p>{email}</p>
          </div>
          <nav className={styles.sectionNav} aria-label="بخش‌های حساب کاربری">
            <SectionButton
              active={section === "personal"}
              icon="fa-id-card"
              label="اطلاعات حساب"
              onClick={() => setSection("personal")}
            />
            <SectionButton
              active={section === "orders"}
              icon="fa-shopping-bag"
              label="سفارشات من"
              onClick={() => setSection("orders")}
            />
            <SectionButton
              active={section === "favorites"}
              icon="fa-heart"
              label={`علاقه‌مندی‌ها${wishlistCount ? ` (${wishlistCount})` : ""}`}
              onClick={() => setSection("favorites")}
            />
            <SectionButton
              active={section === "wallet"}
              icon="fa-wallet"
              label="کیف پول"
              onClick={() => setSection("wallet")}
            />
            <SectionButton
              active={section === "appearance"}
              icon="fa-palette"
              label="ظاهر برنامه"
              onClick={() => setSection("appearance")}
            />
          </nav>
          <button
            className={styles.signOut}
            type="button"
            onClick={signOut}
            disabled={signingOut}
          >
            <i className="fas fa-sign-out-alt" aria-hidden="true" />
            {signingOut ? "در حال خروج..." : "خروج از حساب"}
          </button>
        </aside>

        <div className={styles.mainContent}>
          {notice && (
            <p
              className={`${styles.notice} ${notice.error ? styles.noticeError : styles.noticeSuccess}`}
              role={notice.error ? "alert" : "status"}
            >
              {notice.message}
            </p>
          )}

          {section === "personal" && (
            <section className={styles.card}>
              <div className={styles.sectionTitleRow}>
                <h2 className={styles.sectionTitle}>
                  <span className={styles.titleDot} />
                  اطلاعات شخصی
                </h2>
                {!editing ? (
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => setEditing(true)}
                    disabled={profileUnavailable || !profile}
                  >
                    <i className="fas fa-pen" aria-hidden="true" />
                    ویرایش اطلاعات
                  </button>
                ) : (
                  <div className={styles.editActions}>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      انصراف
                    </button>
                    <button
                      className={styles.primaryButton}
                      type="submit"
                      form="profileForm"
                      disabled={saving}
                    >
                      <i className="fas fa-check" aria-hidden="true" />
                      {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
                    </button>
                  </div>
                )}
              </div>

              {profileUnavailable && (
                <p className={styles.emptyState} role="status">
                  اطلاعات پروفایل در دسترس نیست؛ اتصال دیتابیس و اجرای migration
                  را بررسی کنید.
                </p>
              )}
              <form
                className={styles.infoGrid}
                id="profileForm"
                onSubmit={saveProfile}
              >
                {EDITABLE_FIELDS.map((field) => (
                  <div
                    className={`${styles.infoBox} ${field.wide ? styles.fullWidth : ""}`}
                    key={field.key}
                  >
                    <div className={styles.infoText}>
                      <label htmlFor={`profile-${field.key}`}>{field.label}</label>
                      {editing ? (
                        <input
                          id={`profile-${field.key}`}
                          type="text"
                          inputMode={field.key === "mobile" ? "tel" : undefined}
                          maxLength={field.key === "mobile" ? 11 : undefined}
                          value={values[field.key]}
                          onChange={(event) =>
                            updateField(field.key, event.currentTarget.value)
                          }
                        />
                      ) : (
                        <span>{values[field.key] || "ثبت نشده"}</span>
                      )}
                    </div>
                    <div className={styles.infoIcon}>
                      <i className={`fas ${field.icon}`} aria-hidden="true" />
                    </div>
                  </div>
                ))}
                <div className={`${styles.infoBox} ${styles.fullWidth}`}>
                  <div className={styles.infoText}>
                    <label htmlFor="profile-email">ایمیل</label>
                    <span id="profile-email">{email || "ثبت نشده"}</span>
                    <small>برای تغییر ایمیل، از تنظیمات احراز هویت استفاده کنید.</small>
                  </div>
                  <div className={styles.infoIcon}>
                    <i className="fas fa-envelope" aria-hidden="true" />
                  </div>
                </div>
                <div className={styles.infoBox}>
                  <div className={styles.infoText}>
                    <label>تاریخ عضویت</label>
                    <span>
                      {profile?.created_at
                        ? formatDate(profile.created_at)
                        : "ثبت نشده"}
                    </span>
                  </div>
                  <div className={styles.infoIcon}>
                    <i className="fas fa-calendar-alt" aria-hidden="true" />
                  </div>
                </div>
              </form>
            </section>
          )}

          {section === "wallet" && (
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>کیف پول و باشگاه مشتریان</h2>
              <div className={styles.statsGrid}>
                <StatCard
                  label="موجودی قابل برداشت"
                  value={formatNumber(profile?.wallet ?? 0)}
                  suffix="تومان"
                  icon="fa-wallet"
                />
                <StatCard
                  label="امتیاز باشگاه مشتریان"
                  value={formatNumber(profile?.points ?? 0)}
                  suffix="امتیاز"
                  icon="fa-award"
                />
              </div>
              <p className={styles.readOnlyNote}>
                موجودی و امتیاز از اطلاعات حساب خوانده می‌شوند و از این صفحه قابل
                تغییر نیستند.
              </p>
            </section>
          )}

          {section === "orders" && (
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>سفارشات من</h2>
              <div className={styles.orderTabs}>
                <button
                  className={!showDelivered ? styles.activeOrderTab : ""}
                  type="button"
                  onClick={() => setShowDelivered(false)}
                >
                  سفارشات جاری
                </button>
                <button
                  className={showDelivered ? styles.activeOrderTab : ""}
                  type="button"
                  onClick={() => setShowDelivered(true)}
                >
                  تحویل داده شده
                </button>
              </div>
              {ordersUnavailable ? (
                <p className={styles.emptyState}>
                  سفارش‌ها در دسترس نیستند؛ اتصال دیتابیس و اجرای migration را
                  بررسی کنید.
                </p>
              ) : visibleOrders.length === 0 ? (
                <p className={styles.emptyState}>هنوز سفارشی در این بخش ندارید.</p>
              ) : (
                <div className={styles.orderList}>
                  {visibleOrders.map((order) => (
                    <article className={styles.orderCard} key={order.id}>
                      <div>
                        <span className={styles.orderId}>
                          سفارش {order.id.slice(0, 8)}
                        </span>
                        <span className={styles.orderDate}>
                          {formatDate(order.created_at)}
                        </span>
                      </div>
                      <div className={styles.orderSummary}>
                        <span>
                          {ORDER_STATUSES[order.status] ?? "وضعیت نامشخص"}
                        </span>
                        <strong>{formatNumber(order.total_amount)} تومان</strong>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === "favorites" && (
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>لیست علاقه‌مندی‌ها</h2>
              {wishlistCount === 0 ? (
                <p className={styles.emptyState}>
                  لیست علاقه‌مندی‌های شما خالی است.
                </p>
              ) : (
                <>
                  <p className={styles.readOnlyNote}>
                    {wishlistCount} کالا در فهرست علاقه‌مندی شما ذخیره شده است.
                  </p>
                  <p className={styles.emptyState}>
                    نمایش و مدیریت کالاها پس از انتقال کاتالوگ به این بخش اضافه
                    می‌شود.
                  </p>
                </>
              )}
              <Link className={styles.secondaryButton} href="/">
                مشاهده فروشگاه
              </Link>
            </section>
          )}

          {section === "appearance" && (
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.titleDot} />
                ظاهر برنامه
              </h2>
              <div className={styles.themeOptions} role="radiogroup" aria-label="انتخاب ظاهر برنامه">
                {([
                  ["light", "fa-sun", "روز"],
                  ["dark", "fa-moon", "شب"],
                  ["system", "fa-desktop", "متناسب با سیستم"],
                ] as const).map(([value, icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={preference === value}
                    className={`${styles.themeOption} ${preference === value ? styles.activeThemeOption : ""}`}
                    onClick={() => setThemePreference(value)}
                  >
                    <span className={styles.themeOptionIcon}>
                      <i className={`fas ${icon}`} aria-hidden="true" />
                    </span>
                    <span>{label}</span>
                    {preference === value && (
                      <i className={`fas fa-check ${styles.themeOptionCheck}`} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function SectionButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`${styles.sectionButton} ${active ? styles.activeSection : ""}`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      <span className={styles.menuIcon}>
        <i className={`fas ${icon}`} aria-hidden="true" />
      </span>
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  suffix,
  icon,
}: {
  label: string;
  value: string;
  suffix: string;
  icon: string;
}) {
  return (
    <div className={styles.statBox}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>
        {value} <small>{suffix}</small>
      </strong>
      <i className={`fas ${icon} ${styles.statIcon}`} aria-hidden="true" />
    </div>
  );
}
