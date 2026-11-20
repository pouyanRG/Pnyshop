"use client";

import { useState, type FormEvent } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { AuditLog } from "@/types/database";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  type AuditAction,
} from "@/types/admin";
import type { AuditFilters } from "./page";
import styles from "./audit.module.css";

function buildQuery(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.entity) params.set("entity", filters.entity);
  if (filters.action) params.set("action", filters.action);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/audit?${query}` : "/admin/audit";
}

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

export function AuditClient({
  logs,
  total,
  pageSize,
  filters,
  loadError,
}: {
  logs: AuditLog[];
  total: number;
  pageSize: number;
  filters: AuditFilters;
  loadError: boolean;
}) {
  const router = useRouter();
  const [filterDraft, setFilterDraft] = useState(filters);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const entityOptions = Object.entries(AUDIT_ENTITY_LABELS);
  if (filterDraft.entity && !(filterDraft.entity in AUDIT_ENTITY_LABELS)) {
    entityOptions.push([filterDraft.entity, filterDraft.entity]);
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    router.push(buildQuery(filterDraft, 1) as Route);
  }

  function clearFilters() {
    setFilterDraft({ q: "", entity: "", action: "", page: 1 });
    router.push("/admin/audit");
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>گزارش فعالیت</h1>
          <p>تاریخچهٔ تغییرات اعمال‌شده توسط ادمین‌ها</p>
        </div>
      </header>

      {loadError && (
        <p className={styles.notice} role="status">
          گزارش فعالیت از پایگاه داده خوانده نشد.
        </p>
      )}

      <form className={styles.filters} onSubmit={applyFilters}>
        <input
          value={filterDraft.q}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, q: event.target.value, page: 1 })
          }
          placeholder="جستجو در شرح یا ایمیل ادمین…"
          aria-label="جستجوی گزارش فعالیت"
        />
        <select
          value={filterDraft.entity}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, entity: event.target.value, page: 1 })
          }
          aria-label="فیلتر نوع موجودیت"
        >
          <option value="">همهٔ موجودیت‌ها</option>
          {entityOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={filterDraft.action}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, action: event.target.value, page: 1 })
          }
          aria-label="فیلتر نوع عملیات"
        >
          <option value="">همهٔ عملیات‌ها</option>
          {AUDIT_ACTIONS.map((action: AuditAction) => (
            <option key={action} value={action}>
              {AUDIT_ACTION_LABELS[action]}
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
              <th>عملیات</th>
              <th>موجودیت</th>
              <th>شرح</th>
              <th>ادمین</th>
              <th>تاریخ</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>
                  <span
                    className={`${styles.badge} ${log.action === "delete" ? styles.badgeDelete : log.action === "create" ? styles.badgeCreate : ""}`}
                  >
                    {AUDIT_ACTION_LABELS[log.action as AuditAction] ?? log.action}
                  </span>
                </td>
                <td>{AUDIT_ENTITY_LABELS[log.entity_type] ?? log.entity_type}</td>
                <td>{log.description}</td>
                <td className={styles.muted} dir="ltr">
                  {log.admin_email}
                </td>
                <td className={styles.muted}>{formatDate(log.created_at)}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5}>هنوز فعالیتی ثبت نشده است.</td>
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
