"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin-shell.module.css";

const NAV_ITEMS = [
  { href: "/admin", label: "داشبورد", icon: "fas fa-th-large" },
  { href: "/admin/products", label: "محصولات", icon: "fas fa-box" },
  { href: "/admin/categories", label: "دسته‌بندی‌ها", icon: "fas fa-layer-group" },
  { href: "/admin/brands", label: "برندها", icon: "fas fa-copyright" },
  { href: "/admin/media", label: "تصاویر و ظاهر سایت", icon: "fas fa-image" },
  { href: "/admin/orders", label: "سفارش‌ها", icon: "fas fa-shopping-basket" },
  { href: "/admin/coupons", label: "کدهای تخفیف", icon: "fas fa-ticket-alt" },
  { href: "/admin/customers", label: "مشتریان", icon: "fas fa-users" },
  { href: "/admin/reports", label: "گزارش‌ها", icon: "fas fa-chart-line" },
  { href: "/admin/audit", label: "گزارش فعالیت", icon: "fas fa-history" },
] as const;

function isActive(pathname: string, href: (typeof NAV_ITEMS)[number]["href"]) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    const client = await createSupabaseBrowserClient();
    await client.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className={styles.shell}>
      <div className={styles.mobileTopbar}>
        <button
          type="button"
          aria-label="باز کردن منوی مدیریت"
          aria-expanded={menuOpen}
          aria-controls="admin-navigation"
          onClick={() => setMenuOpen(true)}
        >
          <i className="fas fa-bars" aria-hidden="true" />
        </button>
        <div className={styles.mobileBrand}>
          <i className="fas fa-store" aria-hidden="true" />
          <span>پنل مدیریت Pnyshop</span>
        </div>
        <span aria-hidden="true" />
      </div>

      <button
        type="button"
        className={`${styles.overlay} ${menuOpen ? styles.overlayVisible : ""}`}
        aria-label="بستن منوی مدیریت"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />

      <aside
        id="admin-navigation"
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}
      >
        <div className={styles.brand}>
          <i className="fas fa-store" aria-hidden="true" />
          <div>
            <b>Pnyshop</b>
            <small>پنل مدیریت</small>
          </div>
          <button
            type="button"
            className={styles.sidebarClose}
            aria-label="بستن منوی مدیریت"
            onClick={() => setMenuOpen(false)}
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="بخش‌های پنل مدیریت">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(pathname, item.href) ? styles.active : ""}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <i className={item.icon} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.account}>
          <small title={email}>{email}</small>
          <Link href="/">بازگشت به فروشگاه</Link>
          <button type="button" onClick={logout}>
            <i className="fas fa-sign-out-alt" aria-hidden="true" />
            خروج از حساب
          </button>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
