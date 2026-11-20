import type { Metadata } from "next";
import Link from "next/link";
import type { Order } from "@/types/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { ORDER_STATUS_LABELS } from "@/types/admin";
import styles from "../customers.module.css";

export const metadata: Metadata = {
  title: "پروفایل مشتری | پنل مدیریت",
};

const REVENUE_STATUSES = ["paid", "processing", "shipped", "delivered"];

type Params = Promise<{ id: string }>;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CustomerDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h1>مشتری یافت نشد</h1>
        <p>
          <Link href="/admin/customers">بازگشت به مشتریان</Link>
        </p>
      </div>
    );
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, total_amount, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  const rows = (orders ?? []) as Pick<
    Order,
    "id" | "status" | "total_amount" | "created_at"
  >[];
  const totalSpent = rows
    .filter((order) => REVENUE_STATUSES.includes(order.status))
    .reduce((sum, order) => sum + order.total_amount, 0);
  const cartCount = Array.isArray(profile.cart) ? profile.cart.length : 0;
  const wishlistCount = Array.isArray(profile.wishlist) ? profile.wishlist.length : 0;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>{profile.name || "مشتری بدون نام"}</h1>
          <p>عضویت: {formatDate(profile.created_at)}</p>
        </div>
        <Link href="/admin/customers" className={styles.small}>
          بازگشت به مشتریان
        </Link>
      </header>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>مشخصات</h2>
          <dl className={styles.details}>
            <dt>موبایل</dt>
            <dd>{profile.mobile || "—"}</dd>
            <dt>کد ملی</dt>
            <dd>{profile.melli || "—"}</dd>
            <dt>آدرس</dt>
            <dd>{profile.address || "—"}</dd>
            <dt>کد پستی</dt>
            <dd>{profile.postal_code || "—"}</dd>
            <dt>تأیید ایمیل</dt>
            <dd>{profile.email_verified_at ? formatDate(profile.email_verified_at) : "تأیید نشده"}</dd>
          </dl>
        </section>

        <section className={styles.panel}>
          <h2>کیف پول و فعالیت</h2>
          <dl className={styles.details}>
            <dt>موجودی کیف پول</dt>
            <dd>{profile.wallet.toLocaleString("fa-IR")} تومان</dd>
            <dt>امتیاز</dt>
            <dd>{profile.points.toLocaleString("fa-IR")}</dd>
            <dt>تعداد سفارش‌ها</dt>
            <dd>{rows.length.toLocaleString("fa-IR")}</dd>
            <dt>جمع خرید</dt>
            <dd>{totalSpent.toLocaleString("fa-IR")} تومان</dd>
            <dt>اقلام سبد خرید</dt>
            <dd>{cartCount.toLocaleString("fa-IR")}</dd>
            <dt>علاقه‌مندی‌ها</dt>
            <dd>{wishlistCount.toLocaleString("fa-IR")}</dd>
          </dl>
        </section>
      </div>

      <section className={styles.panel}>
        <h2>سفارش‌های مشتری ({rows.length.toLocaleString("fa-IR")})</h2>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>شناسه</th>
                <th>مبلغ</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((order) => (
                <tr key={order.id}>
                  <td dir="ltr" title={order.id}>
                    {order.id.slice(0, 8)}
                  </td>
                  <td>{order.total_amount.toLocaleString("fa-IR")} تومان</td>
                  <td>{ORDER_STATUS_LABELS[order.status] ?? order.status}</td>
                  <td className={styles.muted}>{formatDate(order.created_at)}</td>
                  <td className={styles.actions}>
                    <Link href={`/admin/orders/${order.id}`} className={styles.small}>
                      مشاهده
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5}>این مشتری هنوز سفارشی ثبت نکرده است.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 20 && (
          <p className={styles.muted}>
            ۲۰ سفارش اخیر نمایش داده شده است؛ {rows.length.toLocaleString("fa-IR")} سفارش در مجموع.
          </p>
        )}
      </section>
    </div>
  );
}
