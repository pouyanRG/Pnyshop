"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { AdminCustomer, CustomerFilters } from "./page";
import styles from "./customers.module.css";

function buildQuery(filters: CustomerFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/customers?${query}` : "/admin/customers";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CustomersClient({
  customers,
  total,
  pageSize,
  filters,
  loadError,
}: {
  customers: AdminCustomer[];
  total: number;
  pageSize: number;
  filters: CustomerFilters;
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
    setFilterDraft({ q: "", page: 1 });
    router.push("/admin/customers");
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>مشتریان</h1>
          <p>لیست مشتریان فروشگاه و سوابق خرید آن‌ها</p>
        </div>
      </header>

      {loadError && (
        <p className={styles.notice} role="status">
          مشتریان از پایگاه داده خوانده نشدند.
        </p>
      )}

      <form className={styles.filters} onSubmit={applyFilters}>
        <input
          value={filterDraft.q}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, q: event.target.value, page: 1 })
          }
          placeholder="جستجو در نام یا موبایل…"
          aria-label="جستجوی مشتری"
        />
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
              <th>مشتری</th>
              <th>کیف پول</th>
              <th>امتیاز</th>
              <th>سفارش‌ها</th>
              <th>جمع خرید</th>
              <th>عضویت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <b>{customer.name || "—"}</b>
                  <br />
                  <span className={styles.muted}>{customer.mobile ?? ""}</span>
                </td>
                <td>{customer.wallet.toLocaleString("fa-IR")} تومان</td>
                <td>{customer.points.toLocaleString("fa-IR")}</td>
                <td>{customer.orderCount.toLocaleString("fa-IR")}</td>
                <td>{customer.totalSpent.toLocaleString("fa-IR")} تومان</td>
                <td className={styles.muted}>{formatDate(customer.created_at)}</td>
                <td className={styles.actions}>
                  <Link
                    href={`/admin/customers/${customer.id}`}
                    className={styles.small}
                  >
                    مشاهده
                  </Link>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={7}>مشتری‌ای یافت نشد.</td>
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
