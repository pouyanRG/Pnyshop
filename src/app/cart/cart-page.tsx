"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Json, Product } from "@/types/database";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import styles from "./cart-page.module.css";

type CartItem = { id: string; qty: number; color: string; name?: string };

function serializeCart(items: CartItem[]): Json[] {
  return items.map(({ id, qty, color, name }) => ({
    id,
    qty,
    color,
    ...(name ? { name } : {}),
  }));
}

function parseCart(value: Json[]): CartItem[] {
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, Json | undefined>;
    const id = String(row.id ?? "");
    const qty = Number(row.qty);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(qty) || qty < 1) return [];
    return [{
      id,
      qty,
      color: typeof row.color === "string" ? row.color : "مشکی",
      name: typeof row.name === "string" ? row.name : undefined,
    }];
  });
}

function price(product: Product) {
  return Math.round(product.price * (1 - product.discount / 100));
}

export function CartPage({
  initialCart,
  products,
  loadError = false,
}: {
  initialCart: Json[];
  products: Product[];
  loadError?: boolean;
}) {
  const [cart, setCart] = useState(() => parseCart(initialCart));
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(parseCart(initialCart).map((item) => item.id)),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    loadError ? "خواندن سبد یا محصولات از سوپابیس انجام نشد. پس از بررسی اتصال و schema صفحه را تازه‌سازی کنید." : "",
  );
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const productById = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
    [products],
  );

  const selectedItems = cart.filter((item) => selected.has(item.id));
  const itemCount = selectedItems.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = selectedItems.reduce((sum, item) => {
    const product = productById.get(item.id);
    return sum + (product ? price(product) * item.qty : 0);
  }, 0);
  const discount = selectedItems.reduce((sum, item) => {
    const product = productById.get(item.id);
    return sum + (product ? Math.round((product.price - price(product)) * item.qty) : 0);
  }, 0);
  const shipping = subtotal === 0 || subtotal > 1_000_000 ? 0 : 35_000;

  async function saveCart(nextCart: CartItem[]) {
    setBusy(true);
    setNotice("");
    try {
      clientRef.current ??= createSupabaseBrowserClient();
      const client = await clientRef.current;
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Authentication required to update cart");
      const { error } = await client.from("profiles")
        .update({ cart: serializeCart(nextCart), updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
      setCart(nextCart);
    } catch (error) {
      console.error("Could not save cart to Supabase:", error);
      setNotice("تغییر سبد ذخیره نشد. لطفاً اتصال سوپابیس و schema را بررسی کنید.");
    } finally {
      setBusy(false);
    }
  }

  function updateQuantity(item: CartItem, delta: number) {
    const product = productById.get(item.id);
    const nextQty = item.qty + delta;
    if (nextQty < 1) return;
    if (!product || nextQty > product.stock) {
      setNotice(product ? `حداکثر ${product.stock} عدد از این محصول موجود است.` : "این محصول دیگر در کاتالوگ فعال نیست؛ آن را از سبد حذف کنید.");
      return;
    }
    void saveCart(cart.map((entry) => entry === item ? { ...entry, qty: nextQty } : entry));
  }

  function removeItems(ids: Set<string>) {
    const nextCart = cart.filter((item) => !ids.has(item.id));
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))));
    void saveCart(nextCart);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={`${styles.page} cart-page`} dir="rtl">
      <StorefrontHeader showHeader={false} />
      <main className={styles.content}>
        <div className={styles.titleRow}>
          <h1><i className="fas fa-shopping-basket" /> سبد خرید</h1>
          <Link href="/">ادامه خرید <i className="fas fa-arrow-left" /></Link>
        </div>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <div className={styles.layout}>
          <section>
            {cart.length > 0 && (
              <div className={styles.bulkBar}>
                <button type="button" onClick={() => removeItems(selected)} disabled={busy || selected.size === 0}>
                  <i className="fas fa-trash" /> حذف موارد انتخابی
                </button>
                <label>
                  انتخاب همه
                  <input
                    type="checkbox"
                    checked={cart.length > 0 && cart.every((item) => selected.has(item.id))}
                    onChange={(event) => setSelected(event.target.checked ? new Set(cart.map((item) => item.id)) : new Set())}
                  />
                </label>
              </div>
            )}
            {cart.length === 0 ? (
              <div className={styles.empty}>
                <i className="fas fa-shopping-basket" />
                <h2>سبد خرید شما خالی است</h2>
                <p>برای مشاهدهٔ محصولات به فروشگاه برگردید.</p>
                <Link href="/">بازگشت به فروشگاه</Link>
              </div>
            ) : (
              <div className={styles.items}>
                {cart.map((item, index) => {
                  const product = productById.get(item.id);
                  return (
                    <article className={styles.item} key={`${item.id}-${item.color}-${index}`}>
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`انتخاب ${product?.name ?? item.name ?? "محصول"}`}
                      />
                      <Link className={styles.itemImage} href={`/product?id=${encodeURIComponent(item.id)}`}>
                        {product?.image_url
                          ? <Image src={product.image_url} alt="" fill sizes="110px" unoptimized />
                          : <i className="far fa-image" />}
                      </Link>
                      <div className={styles.itemDetails}>
                        <Link href={`/product?id=${encodeURIComponent(item.id)}`} className={styles.itemName}>
                          {product?.name ?? item.name ?? `محصول ${item.id}`}
                        </Link>
                        <span className={product ? styles.stock : styles.missing}>
                          {product ? (product.stock > 0 ? `موجود (${product.stock} عدد)` : "ناموجود") : "در کاتالوگ فعال نیست"}
                        </span>
                        <small>رنگ: {item.color}</small>
                        <div className={styles.quantity}>
                          <button type="button" onClick={() => updateQuantity(item, -1)} disabled={busy || item.qty <= 1}>−</button>
                          <span>{item.qty.toLocaleString("fa-IR")}</span>
                          <button type="button" onClick={() => updateQuantity(item, 1)} disabled={busy || !product || item.qty >= product.stock}>+</button>
                        </div>
                      </div>
                      <div className={styles.itemPrice}>
                        <button type="button" onClick={() => removeItems(new Set([item.id]))} disabled={busy} aria-label="حذف محصول">
                          <i className="fas fa-trash" />
                        </button>
                        {product && <strong>{(price(product) * item.qty).toLocaleString("fa-IR")} <small>تومان</small></strong>}
                        {product && product.discount > 0 && <del>{(product.price * item.qty).toLocaleString("fa-IR")} تومان</del>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          {cart.length > 0 && (
            <aside className={styles.summary}>
              <h2><i className="fas fa-file-invoice" /> خلاصه سفارش</h2>
              <div><span>تعداد کالاها:</span><b>{itemCount.toLocaleString("fa-IR")}</b></div>
              <div><span>جمع کالاها:</span><b>{subtotal.toLocaleString("fa-IR")} تومان</b></div>
              <div className={styles.savings}><span>سود شما از تخفیف:</span><b>{discount.toLocaleString("fa-IR")} تومان</b></div>
              <div><span>هزینه ارسال:</span><b>{shipping ? `${shipping.toLocaleString("fa-IR")} تومان` : "رایگان"}</b></div>
              <div className={styles.total}><span>مبلغ قابل پرداخت:</span><b>{(subtotal + shipping).toLocaleString("fa-IR")} تومان</b></div>
              <button type="button" disabled title="پرداخت تا اتصال امن درگاه هنوز فعال نشده است">
                <i className="fas fa-lock" /> پرداخت پس از تکمیل اتصال درگاه
              </button>
              <p>جمع نهایی از قیمت‌های فعلی کاتالوگ محاسبه شده است. پرداخت آنلاین هنوز فعال نیست.</p>
            </aside>
          )}
        </div>
        <div className={styles.assurances}>
          <span><i className="fas fa-truck" /> ارسال سریع</span>
          <span><i className="fas fa-award" /> تضمین بهترین قیمت</span>
          <span><i className="fas fa-undo" /> ۷ روز ضمانت بازگشت</span>
        </div>
      </main>
    </div>
  );
}
