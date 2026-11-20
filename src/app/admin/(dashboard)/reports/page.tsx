import type { Metadata } from "next";
import Link from "next/link";
import type { Order, OrderItem } from "@/types/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/types/admin";
import styles from "./reports.module.css";

export const metadata: Metadata = {
  title: "داشبورد و گزارش‌ها | پنل مدیریت",
};

const REVENUE_STATUSES = ["paid", "processing", "shipped", "delivered"];
const SERIES_DAYS = 14;

type OrderRow = Pick<
  Order,
  "id" | "user_id" | "status" | "total_amount" | "created_at"
>;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ReportsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [ordersResult, customersResult, productsResult, itemsResult] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id, user_id, status, total_amount, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("status", "published"),
      supabase
        .from("order_items")
        .select("order_id, product_id, product_name, quantity, unit_price"),
    ]);

  const loadError = Boolean(
    ordersResult.error ||
      customersResult.error ||
      productsResult.error ||
      itemsResult.error,
  );
  if (loadError) {
    console.error("Could not load admin reports:", {
      orders: ordersResult.error,
      customers: customersResult.error,
      products: productsResult.error,
      items: itemsResult.error,
    });
  }

  const orders = (ordersResult.data ?? []) as OrderRow[];
  const revenueOrders = new Set(
    orders.filter((order) => REVENUE_STATUSES.includes(order.status)).map((order) => order.id),
  );
  const revenue = orders
    .filter((order) => revenueOrders.has(order.id))
    .reduce((sum, order) => sum + order.total_amount, 0);

  const statusCounts = new Map<string, number>();
  for (const order of orders) {
    statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
  }

  const dayTotals = new Map<string, number>();
  const dayLabels = new Map<string, string>();
  for (let offset = SERIES_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    dayTotals.set(key, 0);
    dayLabels.set(
      key,
      day.toLocaleDateString("fa-IR", { month: "short", day: "numeric" }),
    );
  }
  for (const order of orders) {
    if (!revenueOrders.has(order.id)) continue;
    const created = new Date(order.created_at);
    created.setHours(0, 0, 0, 0);
    const key = `${created.getFullYear()}-${created.getMonth()}-${created.getDate()}`;
    if (dayTotals.has(key)) {
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + order.total_amount);
    }
  }
  const series = [...dayTotals.entries()].map(([key, total]) => ({
    key,
    label: dayLabels.get(key) ?? "",
    total,
  }));
  const seriesMax = Math.max(1, ...series.map((entry) => entry.total));

  const productTotals = new Map<
    string,
    { id: number | null; name: string; quantity: number; revenue: number }
  >();
  for (const item of (itemsResult.data ?? []) as Pick<
    OrderItem,
    "order_id" | "product_id" | "product_name" | "quantity" | "unit_price"
  >[]) {
    if (!revenueOrders.has(item.order_id)) continue;
    const key = item.product_id === null ? `name:${item.product_name}` : `id:${item.product_id}`;
    const entry = productTotals.get(key) ?? {
      id: item.product_id,
      name: item.product_name,
      quantity: 0,
      revenue: 0,
    };
    entry.quantity += item.quantity;
    entry.revenue += item.quantity * item.unit_price;
    productTotals.set(key, entry);
  }
  const topProducts = [...productTotals.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  const latestOrders = orders.slice(0, 8);
  const customerIds = [...new Set(latestOrders.map((order) => order.user_id))];
  const { data: latestCustomers } =
    customerIds.length > 0
      ? await supabase.from("profiles").select("id, name").in("id", customerIds)
      : { data: [] as { id: string; name: string }[] };
  const customerNameById = new Map(
    (latestCustomers ?? []).map((customer) => [customer.id, customer.name]),
  );

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>داشبورد و گزارش‌ها</h1>
          <p>نمای کلی فروش، سفارش‌ها و مشتریان فروشگاه</p>
        </div>
      </header>

      {loadError && (
        <p className={styles.notice} role="status">
          بخشی از داده‌های گزارش از پایگاه داده خوانده نشدند.
        </p>
      )}

      <section className={styles.kpis} aria-label="شاخص‌های کلیدی">
        <div className={styles.kpi}>
          <span>درآمد کل</span>
          <b>{revenue.toLocaleString("fa-IR")} تومان</b>
        </div>
        <div className={styles.kpi}>
          <span>سفارش‌ها</span>
          <b>{orders.length.toLocaleString("fa-IR")}</b>
        </div>
        <div className={styles.kpi}>
          <span>مشتریان</span>
          <b>{(customersResult.count ?? 0).toLocaleString("fa-IR")}</b>
        </div>
        <div className={styles.kpi}>
          <span>محصولات فعال</span>
          <b>{(productsResult.count ?? 0).toLocaleString("fa-IR")}</b>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>فروش {SERIES_DAYS.toLocaleString("fa-IR")} روز اخیر</h2>
        <div className={styles.chart} role="img" aria-label="نمودار فروش روزانه">
          {series.map((entry) => (
            <div key={entry.key} className={styles.bar} title={`${entry.label}: ${entry.total.toLocaleString("fa-IR")} تومان`}>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ height: `${Math.round((entry.total / seriesMax) * 100)}%` }}
                />
              </div>
              <span>{entry.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>سفارش‌ها بر اساس وضعیت</h2>
          <dl className={styles.details}>
            {ORDER_STATUSES.map((status) => (
              <div key={status} className={styles.statusRow}>
                <dt>{ORDER_STATUS_LABELS[status]}</dt>
                <dd>{(statusCounts.get(status) ?? 0).toLocaleString("fa-IR")}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.panel}>
          <h2>پرفروش‌ترین محصولات</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>محصول</th>
                  <th>تعداد فروش</th>
                  <th>مبلغ فروش</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product, index) => (
                  <tr key={`${product.id ?? product.name}-${index}`}>
                    <td>
                      <Link
                        href={{
                          pathname: "/admin/products",
                          query: { q: product.name },
                        }}
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td>{product.quantity.toLocaleString("fa-IR")}</td>
                    <td>{product.revenue.toLocaleString("fa-IR")} تومان</td>
                  </tr>
                ))}
                {topProducts.length === 0 && (
                  <tr>
                    <td colSpan={3}>هنوز فروش ثبت‌شده‌ای وجود ندارد.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className={styles.panel}>
        <h2>آخرین سفارش‌ها</h2>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>شناسه</th>
                <th>مشتری</th>
                <th>مبلغ</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {latestOrders.map((order) => (
                <tr key={order.id}>
                  <td dir="ltr" title={order.id}>
                    {order.id.slice(0, 8)}
                  </td>
                  <td>{customerNameById.get(order.user_id) || "—"}</td>
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
              {latestOrders.length === 0 && (
                <tr>
                  <td colSpan={6}>سفارشی ثبت نشده است.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
