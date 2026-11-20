"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@/types/admin";
import type { AdminOrder, OrderFilters } from "./page";
import styles from "./orders.module.css";

function buildQuery(filters: OrderFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status) params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function OrdersClient({
  orders,
  total,
  pageSize,
  filters,
  loadError,
}: {
  orders: AdminOrder[];
  total: number;
  pageSize: number;
  filters: OrderFilters;
  loadError: boolean;
}) {
  const router = useRouter();
  const [filterDraft, setFilterDraft] = useState(filters);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    router.push(buildQuery(filterDraft, 1) as Route);
  }

  function clearFilters() {
    setFilterDraft({ q: "", status: "", page: 1 });
    router.push("/admin/orders");
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>سفارش‌ها</h1>
          <p>لیست سفارش‌های ثبت‌شده و تغییر وضعیت آن‌ها</p>
        </div>
      </header>

      {loadError && (
        <p className={styles.notice} role="status">
          سفارش‌ها از پایگاه داده خوانده نشدند.
        </p>
      )}

      <form className={styles.filters} onSubmit={applyFilters}>
        <input
          value={filterDraft.q}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, q: event.target.value, page: 1 })
          }
          placeholder="جستجو در شناسه یا نام و موبایل مشتری…"
          aria-label="جستجوی سفارش"
        />
        <select
          value={filterDraft.status}
          onChange={(event) =>
            setFilterDraft({
              ...filterDraft,
              status: event.target.value,
              page: 1,
            })
          }
          aria-label="فیلتر وضعیت"
        >
          <option value="">همهٔ وضعیت‌ها</option>
          {ORDER_STATUSES.map((status: OrderStatus) => (
            <option key={status} value={status}>
              {ORDER_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.primary}>
          اعمال
        </button>
        <button type="button" className={styles.ghost} onClick={clearFilters}>
          پاک‌کردن
        </button>
      </form>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>شناسه</th>
              <th>مشتری</th>
              <th>مبلغ</th>
              <th>روش ارسال</th>
              <th>وضعیت</th>
              <th>تاریخ</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td dir="ltr" title={order.id}>
                  {order.id.slice(0, 8)}
                </td>
                <td>
                  <b>{order.profiles?.name || "—"}</b>
                  <br />
                  <span className={styles.muted}>{order.profiles?.mobile ?? ""}</span>
                </td>
                <td>{order.total_amount.toLocaleString("fa-IR")} تومان</td>
                <td>{order.shipping_method || <span className={styles.muted}>—</span>}</td>
                <td>
                  <span
                    className={`${styles.badge} ${order.status === "delivered" ? styles.badgeDelivered : order.status === "failed_payment" ? styles.badgeFailed : ""}`}
                  >
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </td>
                <td className={styles.muted}>{formatDate(order.created_at)}</td>
                <td className={styles.actions}>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className={styles.small}
                  >
                    مشاهده
                  </Link>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7}>سفارشی یافت نشد.</td>
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
            onClick={() => router.push(buildQuery(filters, filters.page - 1) as Route)}
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
            onClick={() => router.push(buildQuery(filters, filters.page + 1) as Route)}
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
