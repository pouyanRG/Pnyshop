"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./storefront-header.module.css";

export function StorefrontHeader({ showHeader = true }: { showHeader?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  function openSearch() {
    const value = query.trim();
    router.push(value ? `/?q=${encodeURIComponent(value)}#search` : "/");
  }

  return (
    <>
      {showHeader && (
        <header className={styles.header}>
          <div className={styles.inner}>
            <Link className={styles.logo} href="/" aria-label="صفحه اصلی Pnyshop">
              <Image
                src="/images/Pnyshop-img-logo.png"
                alt="Pnyshop"
                width={92}
                height={48}
                priority
              />
            </Link>

            <form className={styles.search} onSubmit={(event) => { event.preventDefault(); openSearch(); }}>
              <i className="fas fa-search" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="جست‌وجو در فروشگاه، برندها و محصولات"
                aria-label="جستجوی فروشگاه"
              />
            </form>

            <div className={styles.actions}>
              <Link className={styles.actionLink} href="/cart" aria-label="سبد خرید">
                <i className="fas fa-shopping-cart" aria-hidden="true" />
              </Link>
              <Link className={styles.actionLink} href="/profile" aria-label="حساب کاربری">
                <i className="far fa-user" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </header>
      )}

      <nav className="mobile-nav" aria-label="ناوبری پایین">
        <Link
          href="/"
          className={`mn-item ${pathname === "/" ? "active" : ""}`}
          aria-label="خانه"
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <i className="fas fa-home" aria-hidden="true" />
        </Link>
        <Link
          href="/cart"
          className={`mn-item mn-item-featured ${pathname === "/cart" ? "active" : ""}`}
          aria-label="سبد خرید"
          aria-current={pathname === "/cart" ? "page" : undefined}
        >
          <div className="mn-cart-wrap">
            <i className="fas fa-shopping-cart" aria-hidden="true" />
          </div>
          <span />
        </Link>
        <Link
          href="/profile"
          className={`mn-item ${pathname === "/profile" ? "active" : ""}`}
          aria-label="حساب کاربری"
          aria-current={pathname === "/profile" ? "page" : undefined}
        >
          <i className="far fa-user" aria-hidden="true" />
        </Link>
      </nav>
    </>
  );
}
