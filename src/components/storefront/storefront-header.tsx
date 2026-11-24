"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Category, Json } from "@/types/database";
import styles from "./storefront-header.module.css";

declare global {
  interface Window {
    openSRP?: (query?: string, category?: string, mode?: string) => void;
  }
}

type CategoryNode = Category & { children: CategoryNode[] };
type AccountState = {
  name: string;
  signedIn: boolean;
};

function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map(
    categories.map((category) => [
      category.id,
      { ...category, children: [] as CategoryNode[] },
    ]),
  );
  const roots: CategoryNode[] = [];

  for (const node of nodes.values()) {
    const parent =
      node.parent_id === null ? undefined : nodes.get(node.parent_id);
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (items: CategoryNode[]) => {
    items.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);

  const reachable = new Set<number>();
  const markReachable = (items: CategoryNode[]) => {
    for (const item of items) {
      if (reachable.has(item.id)) continue;
      reachable.add(item.id);
      markReachable(item.children);
    }
  };
  markReachable(roots);
  for (const node of nodes.values()) {
    if (!reachable.has(node.id)) {
      roots.push(node);
      markReachable([node]);
    }
  }

  return roots;
}

function getDescendants(
  node: CategoryNode,
  visited = new Set([node.id]),
): CategoryNode[] {
  return node.children.flatMap((child) => {
    if (visited.has(child.id)) return [];
    const nextVisited = new Set(visited).add(child.id);
    return [child, ...getDescendants(child, nextVisited)];
  });
}

function getCartCount(value: Json | undefined): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce<number>((total, entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return total;
    }
    const quantity = Number(entry.qty);
    return Number.isSafeInteger(quantity) && quantity > 0
      ? total + quantity
      : total;
  }, 0);
}

function getUserName(user: User, profileName?: string | null): string {
  const metadataName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata.name === "string"
        ? user.user_metadata.name
        : "";
  return (
    profileName?.trim() ||
    metadataName.trim() ||
    user.email?.split("@")[0] ||
    "حساب کاربری"
  );
}

function getInitials(name: string): string {
  return name.trim().slice(0, 1) || "ح";
}

export function StorefrontHeader({
  showHeader = true,
  categories: initialCategories,
  logoUrl = "/images/Pnyshop-img-logo.png",
}: {
  showHeader?: boolean;
  categories?: Category[];
  logoUrl?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileCategoryTriggerRef = useRef<HTMLButtonElement>(null);
  const accountWrapRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState(initialCategories ?? []);
  const [categoriesLoaded, setCategoriesLoaded] = useState(
    initialCategories !== undefined,
  );
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [mobileCategoryId, setMobileCategoryId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [account, setAccount] = useState<AccountState>({
    name: "حساب کاربری",
    signedIn: false,
  });
  const [cartCount, setCartCount] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState("");

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const activeCategory =
    categoryTree.find((category) => category.id === activeCategoryId) ??
    categoryTree[0] ??
    null;
  const mobileCategory =
    categoryTree.find((category) => category.id === mobileCategoryId) ?? null;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let client:
      | Awaited<ReturnType<typeof createSupabaseBrowserClient>>
      | undefined;

    async function syncAccount(user?: User | null) {
      if (!client) return;
      let currentUser = user;
      if (currentUser === undefined) {
        const {
          data: { user: authenticatedUser },
          error,
        } = await client.auth.getUser();
        if (error) throw error;
        currentUser = authenticatedUser;
      }

      if (!currentUser) {
        if (active) {
          setAccount({ name: "حساب کاربری", signedIn: false });
          setCartCount(0);
          setAccountMenuOpen(false);
        }
        return;
      }

      const { data: profile, error } = await client
        .from("profiles")
        .select("name,cart")
        .eq("id", currentUser.id)
        .maybeSingle();
      if (error) throw error;
      if (!active) return;

      setAccount({
        name: getUserName(currentUser, profile?.name),
        signedIn: true,
      });
      setCartCount(getCartCount(profile?.cart));
    }

    async function loadNavigationData() {
      try {
        client = await createSupabaseBrowserClient();
      } catch (error) {
        if (active) {
          if (initialCategories === undefined) setCategoriesLoaded(true);
          console.error("Could not initialize storefront navigation:", error);
        }
        return;
      }
      if (!active) return;

      if (initialCategories === undefined) {
        try {
          const { data, error } = await client
            .from("categories")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .order("id", { ascending: true });
          if (error) throw error;
          if (active) setCategories(data ?? []);
        } catch (error) {
          if (active) {
            console.error("Could not load storefront categories:", error);
          }
        } finally {
          if (active) setCategoriesLoaded(true);
        }

      }

      const onAuthChange = (event: string, session: { user: User } | null) => {
          if (event === "INITIAL_SESSION") return;
          window.setTimeout(() => {
            if (active) {
              void syncAccount(session?.user ?? null).catch((error: unknown) => {
                console.error("Could not refresh storefront account state:", error);
              });
            }
          }, 0);
      };
      const { data } = client.auth.onAuthStateChange(onAuthChange);
      const onCartUpdated = () => {
        void syncAccount().catch((error: unknown) => {
          console.error("Could not refresh the storefront cart count:", error);
        });
      };
      window.addEventListener("pnyshop:cart-updated", onCartUpdated);
      unsubscribe = () => {
        data.subscription.unsubscribe();
        window.removeEventListener("pnyshop:cart-updated", onCartUpdated);
      };

      try {
        await syncAccount();
      } catch (error) {
        if (active) {
          console.error("Could not load storefront account state:", error);
        }
      }
    }

    void loadNavigationData();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [initialCategories]);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setMobileCategoryId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMobileCategoryId(null);
        if (window.matchMedia("(max-width: 900px)").matches) {
          mobileCategoryTriggerRef.current?.focus();
        } else {
          triggerRef.current?.focus();
        }
      }
    };
    const onCloseMenu = () => {
      setMenuOpen(false);
      setMobileCategoryId(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("pnyshop:close-navigation-menu", onCloseMenu);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pnyshop:close-navigation-menu", onCloseMenu);
    };
  }, [menuOpen]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!accountWrapRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        accountTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleCloseMenu() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      setMobileCategoryId(null);
    }, 220);
  }

  function openSearch(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    setMenuOpen(false);
    if (pathname === "/" && window.openSRP) {
      window.openSRP(trimmed);
      return;
    }
    router.push(`/?q=${encodeURIComponent(trimmed)}`);
  }

  function openProductMode(mode: "all" | "bestseller" | "discount") {
    setMenuOpen(false);
    if (pathname === "/" && window.openSRP) {
      window.openSRP("", "", mode);
      return;
    }
    router.push(`/?mode=${mode}`);
  }

  function openCategory(category: Category) {
    setMenuOpen(false);
    setMobileCategoryId(null);
    if (pathname === "/" && window.openSRP) {
      window.openSRP("", category.name);
      return;
    }
    router.push(`/?category=${encodeURIComponent(category.name)}`);
  }

  async function signOut() {
    setSigningOut(true);
    setAccountError("");
    try {
      const client = await createSupabaseBrowserClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      window.localStorage.removeItem("current_user");
      setAccountMenuOpen(false);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Could not sign out from the storefront header:", error);
      setAccountError("خروج انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setSigningOut(false);
    }
  }

  function renderCategoryLinks(node: CategoryNode) {
    const descendants = getDescendants(node);
    return (
      <>
        <button
          className={styles.categoryColumnTitle}
          type="button"
          onClick={() => openCategory(node)}
        >
          {node.name}
          <i className="fas fa-arrow-left" aria-hidden="true" />
        </button>
        {descendants.map((category) => (
          <button
            className={styles.categoryLink}
            type="button"
            key={category.id}
            onClick={() => openCategory(category)}
          >
            {category.name}
          </button>
        ))}
      </>
    );
  }

  const menuContents = (
    <>
      {categoryTree.length === 0 ? (
        <p className={styles.categoryStatus} role="status">
          {categoriesLoaded ? "دسته‌بندی فعالی ثبت نشده است." : "در حال دریافت دسته‌بندی‌ها…"}
        </p>
      ) : (
        <>
          <div className={styles.categoryRail} aria-label="دسته‌بندی‌های اصلی">
            {categoryTree.map((category) => (
              <button
                type="button"
                key={category.id}
                className={`${styles.categoryRoot} ${activeCategory?.id === category.id ? styles.categoryRootActive : ""}`}
                aria-pressed={activeCategory?.id === category.id}
                onMouseEnter={() => setActiveCategoryId(category.id)}
                onFocus={() => setActiveCategoryId(category.id)}
                onClick={() => {
                  setActiveCategoryId(category.id);
                  if (window.matchMedia("(max-width: 900px)").matches) {
                    setMobileCategoryId(category.id);
                  }
                }}
              >
                <span>{category.name}</span>
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className={styles.categoryPanel}>
            {activeCategory ? (
              <>
                <div className={styles.categoryPanelHeading}>
                  <span>دسته‌بندی‌های {activeCategory.name}</span>
                  <button type="button" onClick={() => openCategory(activeCategory)}>
                    مشاهدهٔ همه
                    <i className="fas fa-arrow-left" aria-hidden="true" />
                  </button>
                </div>
                <div className={styles.categoryColumns}>
                  {(activeCategory.children.length
                    ? activeCategory.children
                    : [activeCategory]
                  ).map((category) => (
                    <div className={styles.categoryColumn} key={category.id}>
                      {renderCategoryLinks(category)}
                    </div>
                  ))}
                  <div className={`${styles.categoryColumn} ${styles.categoryPromos}`}>
                    <span className={styles.categoryColumnTitle}>پیشنهادهای فروشگاه</span>
                    <button
                      className={styles.categoryLink}
                      type="button"
                      onClick={() => openProductMode("bestseller")}
                    >
                      <i className="fas fa-fire" aria-hidden="true" />
                      پرفروش‌ترین‌ها
                    </button>
                    <button
                      className={styles.categoryLink}
                      type="button"
                      onClick={() => openProductMode("discount")}
                    >
                      <i className="fas fa-tag" aria-hidden="true" />
                      تخفیف‌های ویژه
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className={styles.navigationRoot} ref={rootRef}>
      {showHeader && (
        <header className={styles.header} id="mainHeader">
          <div className={styles.topRow}>
            <div className={styles.topInner}>
              <Link className={styles.logo} href="/" aria-label="صفحهٔ اصلی Pnyshop">
                <Image
                  src={logoUrl}
                  alt="Pnyshop"
                  width={120}
                  height={48}
                  priority
                  unoptimized
                />
              </Link>

              <form
                className={styles.search}
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  openSearch(query);
                }}
              >
                <i className="fas fa-search" aria-hidden="true" />
                <label className={styles.visuallyHidden} htmlFor="mainSearch">
                  جست‌وجوی محصول
                </label>
                <input
                  id="mainSearch"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="جست‌وجوی محصول، برند یا دسته‌بندی"
                  autoComplete="off"
                  spellCheck={false}
                  dir="auto"
                  aria-label="جست‌وجوی محصول"
                />
                {query && (
                  <button
                    className={styles.clearSearch}
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="پاک‌کردن عبارت جست‌وجو"
                  >
                    <i className="fas fa-times" aria-hidden="true" />
                  </button>
                )}
                <button className={styles.searchSubmit} type="submit" aria-label="جست‌وجو">
                  جست‌وجو
                </button>
              </form>

              <div className={styles.actions}>
                <Link
                  className={styles.cartAction}
                  href="/cart"
                  aria-label={`سبد خرید، ${cartCount.toLocaleString("fa-IR")} کالا`}
                >
                  <span className={styles.actionIcon}>
                    <i className="fas fa-shopping-bag" aria-hidden="true" />
                    {cartCount > 0 && (
                      <span className={styles.cartBadge}>
                        {cartCount > 99 ? "۹۹+" : cartCount.toLocaleString("fa-IR")}
                      </span>
                    )}
                  </span>
                  <span>سبد خرید</span>
                </Link>

                {account.signedIn ? (
                  <div className={styles.accountWrap} ref={accountWrapRef}>
                    <button
                      ref={accountTriggerRef}
                      className={styles.accountAction}
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={accountMenuOpen}
                      aria-controls="accountMenu"
                      onClick={() => setAccountMenuOpen((open) => !open)}
                    >
                      <span className={styles.avatar}>{getInitials(account.name)}</span>
                      <span className={styles.accountText}>
                        <small>خوش آمدید</small>
                        <strong>{account.name}</strong>
                      </span>
                      <i className="fas fa-chevron-down" aria-hidden="true" />
                    </button>
                    {accountMenuOpen && (
                      <div className={styles.accountMenu} id="accountMenu" role="menu">
                        <Link href="/profile" role="menuitem" onClick={() => setAccountMenuOpen(false)}>
                          <i className="far fa-user" aria-hidden="true" />
                          حساب کاربری
                        </Link>
                        <Link href="/profile#orders" role="menuitem" onClick={() => setAccountMenuOpen(false)}>
                          <i className="fas fa-box" aria-hidden="true" />
                          سفارش‌های من
                        </Link>
                        {accountError && <p role="status">{accountError}</p>}
                        <button type="button" role="menuitem" onClick={() => void signOut()} disabled={signingOut}>
                          <i className="fas fa-right-from-bracket" aria-hidden="true" />
                          {signingOut ? "در حال خروج…" : "خروج از حساب"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link className={styles.loginAction} href="/login">
                    <i className="far fa-user" aria-hidden="true" />
                    <span>ورود / ثبت‌نام</span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div
            className={styles.desktopNav}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleCloseMenu}
          >
            <nav className={styles.desktopNavInner} aria-label="دسته‌بندی و دسترسی سریع">
              <button
                ref={triggerRef}
                className={styles.categoryTrigger}
                type="button"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-controls="storefrontCategoryMenu"
                onMouseEnter={() => {
                  clearCloseTimer();
                  setMenuOpen(true);
                }}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <i className="fas fa-layer-group" aria-hidden="true" />
                دسته‌بندی کالاها
                <i className="fas fa-chevron-down" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => openProductMode("all")}>
                همهٔ محصولات
              </button>
              <Link href="/ai">
                <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
                دستیار خرید
              </Link>
              <button type="button" onClick={() => openProductMode("bestseller")}>
                پرفروش‌ترین‌ها
              </button>
              <button type="button" onClick={() => openProductMode("discount")}>
                تخفیف‌های ویژه
              </button>
              <div className={styles.promoMessage}>
                <i className="fas fa-tag" aria-hidden="true" />
                <span>تخفیف روی کالاهای منتخب</span>
              </div>
            </nav>
          </div>

          <div
            className={`${styles.categoryMenu} ${menuOpen ? styles.categoryMenuOpen : ""}`}
            id="storefrontCategoryMenu"
            role="region"
            aria-hidden={!menuOpen}
            aria-label="دسته‌بندی محصولات"
            inert={!menuOpen}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleCloseMenu}
          >
            <div className={styles.categoryMenuInner}>
              <button
                className={styles.mobileBack}
                type="button"
                onClick={() => setMobileCategoryId(null)}
                hidden={!mobileCategoryId}
              >
                <i className="fas fa-arrow-right" aria-hidden="true" />
                بازگشت به دسته‌ها
              </button>
              <div className={`${styles.desktopMenuContents} ${mobileCategoryId ? styles.mobilePanelHidden : ""}`}>
                {menuContents}
              </div>
              <div className={`${styles.mobileCategoryPanel} ${mobileCategoryId ? styles.mobilePanelOpen : ""}`}>
                {mobileCategory ? (
                  <>
                    <h2>{mobileCategory.name}</h2>
                    <button
                      className={styles.mobileCategoryLink}
                      type="button"
                      onClick={() => openCategory(mobileCategory)}
                    >
                      مشاهدهٔ همهٔ محصولات {mobileCategory.name}
                    </button>
                    {getDescendants(mobileCategory).map((category) => (
                      <button
                        className={styles.mobileCategoryLink}
                        type="button"
                        key={category.id}
                        onClick={() => openCategory(category)}
                      >
                        {category.name}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </header>
      )}

      <nav className={styles.mobileNav} aria-label="ناوبری اصلی">
        <Link
          className={`${styles.mobileNavItem} ${pathname === "/" ? styles.mobileNavActive : ""}`}
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <i className="fas fa-house" aria-hidden="true" />
          <span>خانه</span>
        </Link>
        {showHeader ? (
          <button
            ref={mobileCategoryTriggerRef}
            className={`${styles.mobileNavItem} ${menuOpen ? styles.mobileNavActive : ""}`}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="storefrontCategoryMenu"
            onClick={() => {
              setMobileCategoryId(null);
              setMenuOpen((open) => !open);
            }}
          >
            <i className="fas fa-layer-group" aria-hidden="true" />
            <span>دسته‌ها</span>
          </button>
        ) : (
          <Link className={styles.mobileNavItem} href="/#home-categories">
            <i className="fas fa-layer-group" aria-hidden="true" />
            <span>دسته‌ها</span>
          </Link>
        )}
        <Link
          className={`${styles.mobileNavItem} ${pathname === "/cart" ? styles.mobileNavActive : ""}`}
          href="/cart"
          aria-current={pathname === "/cart" ? "page" : undefined}
          aria-label={`سبد خرید، ${cartCount.toLocaleString("fa-IR")} کالا`}
        >
          <span className={styles.mobileCartIcon}>
            <i className="fas fa-shopping-bag" aria-hidden="true" />
            {cartCount > 0 && (
              <span className={styles.mobileCartBadge}>
                {cartCount > 99 ? "۹۹+" : cartCount.toLocaleString("fa-IR")}
              </span>
            )}
          </span>
          <span>سبد خرید</span>
        </Link>
        <Link
          className={`${styles.mobileNavItem} ${pathname.startsWith("/profile") || pathname === "/login" ? styles.mobileNavActive : ""}`}
          href={account.signedIn ? "/profile" : "/login"}
          aria-current={pathname.startsWith("/profile") || pathname === "/login" ? "page" : undefined}
        >
          <i className="far fa-user" aria-hidden="true" />
          <span>{account.signedIn ? "حساب من" : "ورود"}</span>
        </Link>
      </nav>
    </div>
  );
}
