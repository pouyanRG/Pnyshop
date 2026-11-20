"use client";

import { useState } from "react";
import Link from "next/link";
import type { Json, Order, OrderItem, Profile } from "@/types/database";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus,
} from "@/types/admin";
import { updateOrderStatus } from "@/lib/admin/actions/orders";
import styles from "../orders.module.css";

type OrderWithCustomer = Order & {
  profiles: Pick<Profile, "id" | "name" | "mobile" | "address" | "postal_code"> | null;
};

export type OrderDetailItem = OrderItem & {
  products: { id: number; name: string; slug: string | null } | null;
  image_url: string | null;
  options: Json;
};

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

function optionLabels(options: Json): string[] {
  if (!options || typeof options !== "object" || Array.isArray(options)) return [];
  return Object.entries(options as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);
}

export function OrderDetailClient({
  order,
  items,
}: {
  order: OrderWithCustomer;
  items: OrderDetailItem[];
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];

  async function changeStatus(status: OrderStatus) {
    if (busy || status === order.status) return;
    setBusy(true);
    setNotice("");
    const result = await updateOrderStatus(order.id, status);
    setNotice(result.message);
    setBusy(false);
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>
            سفارش <span dir="ltr">#{order.id.slice(0, 8)}</span>
          </h1>
          <p>
            {formatDate(order.created_at)} ·{" "}
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </p>
        </div>
        <Link href="/admin/orders" className={styles.small}>
          بازگشت به سفارش‌ها
        </Link>
      </header>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      <section className={styles.panel}>
        <h2>تغییر وضعیت</h2>
        {allowed.length === 0 ? (
          <p className={styles.muted}>این سفارش در وضعیت پایانی است و قابل تغییر نیست.</p>
        ) : (
          <div className={styles.statusRow}>
            <select
              value={order.status}
              disabled={busy}
              onChange={(event) => changeStatus(event.target.value as OrderStatus)}
              aria-label="وضعیت سفارش"
            >
              <option value={order.status}>
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </option>
              {allowed.map((status: OrderStatus) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <span className={styles.muted}>
              وضعیت فعلی: {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>مشتری</h2>
          <dl className={styles.details}>
            <dt>نام</dt>
            <dd>{order.profiles?.name || "—"}</dd>
            <dt>موبایل</dt>
            <dd>{order.profiles?.mobile || "—"}</dd>
            <dt>آدرس</dt>
            <dd>{order.shipping_address || order.profiles?.address || "—"}</dd>
            <dt>کد پستی</dt>
            <dd>{order.postal_code || order.profiles?.postal_code || "—"}</dd>
          </dl>
        </section>

        <section className={styles.panel}>
          <h2>پرداخت و ارسال</h2>
          <dl className={styles.details}>
            <dt>مبلغ کل</dt>
            <dd>{order.total_amount.toLocaleString("fa-IR")} تومان</dd>
            <dt>هزینهٔ ارسال</dt>
            <dd>{order.shipping_cost.toLocaleString("fa-IR")} تومان</dd>
            <dt>روش ارسال</dt>
            <dd>{order.shipping_method || "—"}</dd>
            <dt>کد تخفیف</dt>
            <dd>
              {order.coupon_code
                ? `${order.coupon_code} (${order.coupon_discount_amount.toLocaleString("fa-IR")} تومان)`
                : "—"}
            </dd>
            <dt>درگاه پرداخت</dt>
            <dd>{order.payment_gateway || "—"}</dd>
            <dt>شناسهٔ تراکنش</dt>
            <dd dir="ltr">{order.transaction_id || "—"}</dd>
            <dt>زمان پرداخت</dt>
            <dd>{formatDate(order.paid_at)}</dd>
            <dt>زمان تحویل</dt>
            <dd>{formatDate(order.delivered_at)}</dd>
            {order.failure_reason && (
              <>
                <dt>دلیل شکست</dt>
                <dd>{order.failure_reason}</dd>
              </>
            )}
          </dl>
        </section>
      </div>

      <section className={styles.panel}>
        <h2>اقلام سفارش ({items.length.toLocaleString("fa-IR")})</h2>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>محصول</th>
                <th>گزینه‌ها</th>
                <th>تعداد</th>
                <th>قیمت واحد</th>
                <th>جمع</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.products ? (
                      <Link
                        href={{
                          pathname: "/admin/products",
                          query: { q: item.products.name },
                        }}
                      >
                        {item.products.name}
                      </Link>
                    ) : (
                      item.product_name
                    )}
                  </td>
                  <td className={styles.muted}>
                    {optionLabels(item.options).join("، ") || "—"}
                  </td>
                  <td>{item.quantity.toLocaleString("fa-IR")}</td>
                  <td>{item.unit_price.toLocaleString("fa-IR")} تومان</td>
                  <td>
                    {(
                      item.unit_price * item.quantity
                    ).toLocaleString("fa-IR")}{" "}
                    تومان
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5}>این سفارش هیچ قلمی ندارد.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
