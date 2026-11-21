"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Json, Product, Profile } from "@/types/database";
import styles from "./checkout-page.module.css";

type CartItem = { id: string; qty: number; color: string };

function parseCart(value: Json): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, Json | undefined>;
    const id = String(row.id ?? "");
    const qty = Number(row.qty);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(qty) || qty < 1) return [];
    return [{ id, qty, color: typeof row.color === "string" ? row.color : "مشکی" }];
  });
}

function serializeCart(items: CartItem[]): Json[] {
  return items.map(({ id, qty, color }) => ({ id, qty, color }));
}

function finalPrice(product: Product) {
  return Math.round(product.price * (1 - product.discount / 100));
}

export function CheckoutPage({
  email,
  profile,
  cart: rawCart,
  products,
  catalogError,
}: {
  email: string;
  profile: Partial<Profile> | null;
  cart: Json[];
  products: Product[];
  catalogError: boolean;
}) {
  const router = useRouter();
  const cart = useMemo(() => parseCart(rawCart), [rawCart]);
  const productMap = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
    [products],
  );
  const [address, setAddress] = useState(profile?.address ?? "");
  const [postalCode, setPostalCode] = useState(profile?.postal_code ?? "");
  const [shippingMethod, setShippingMethod] = useState<"post" | "tipax" | "free">("post");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    catalogError ? "بارگذاری بخشی از کاتالوگ یا ذخیره‌سازی سفارش با خطا مواجه شد." : "",
  );

  useEffect(() => {
  }, []);

  const availableItems = cart.filter((item) => productMap.has(item.id));
  const subtotal = availableItems.reduce((sum, item) => {
    const product = productMap.get(item.id);
    return sum + (product ? finalPrice(product) * item.qty : 0);
  }, 0);
  const productDiscount = availableItems.reduce((sum, item) => {
    const product = productMap.get(item.id);
    return sum + (product ? (product.price - finalPrice(product)) * item.qty : 0);
  }, 0);
  const shippingCost =
    shippingMethod === "free" || subtotal >= 1_000_000
      ? 0
      : shippingMethod === "tipax"
        ? 45_000
        : 35_000;
  const total = Math.max(0, subtotal + shippingCost - couponDiscount);

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    setCouponDiscount(0);
    setNotice("");
    if (!code) {
      setNotice("کد تخفیف را وارد کنید.");
      return;
    }
    try {
      const client = await createSupabaseBrowserClient();
      const { data, error } = await client
        .from("coupons")
        .select("code,discount_type,discount_value,minimum_amount,maximum_discount,is_active,starts_at,ends_at,usage_limit,used_count")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      if (!data?.is_active) {
        setNotice("این کد تخفیف نامعتبر یا غیرفعال است.");
        return;
      }
      const now = new Date();
      if (data.starts_at && now < new Date(data.starts_at)) {
        setNotice("این کد تخفیف هنوز فعال نشده است.");
        return;
      }
      if (data.ends_at && now > new Date(`${data.ends_at}T23:59:59`)) {
        setNotice("مهلت این کد تخفیف به پایان رسیده است.");
        return;
      }
      if (data.usage_limit != null && data.used_count >= data.usage_limit) {
        setNotice("ظرفیت استفاده از این کد تخفیف تکمیل شده است.");
        return;
      }
      if (subtotal < data.minimum_amount) {
        setNotice(`حداقل مبلغ خرید برای این کد ${data.minimum_amount.toLocaleString("fa-IR")} تومان است.`);
        return;
      }
      let discount =
        data.discount_type === "fixed"
          ? data.discount_value
          : subtotal * (data.discount_value / 100);
      if (data.maximum_discount != null) discount = Math.min(discount, data.maximum_discount);
      discount = Math.min(discount, subtotal);
      setCouponDiscount(Math.round(discount));
      setNotice(`کد «${data.code}» اعمال شد.`);
    } catch (error) {
      console.error("Could not apply coupon:", error);
      setNotice("بررسی کد تخفیف ممکن نبود. اتصال یا schema را بررسی کنید.");
    }
  }

  async function submitOrder() {
    if (busy) return;
    if (address.trim().length < 10) {
      setNotice("آدرس دقیق پستی را وارد کنید.");
      return;
    }
    if (postalCode && !/^\d{10}$/.test(postalCode)) {
      setNotice("کد پستی باید دقیقاً ۱۰ رقم باشد.");
      return;
    }
    if (availableItems.length === 0) {
      setNotice("سبد خرید دارای محصول فعال نیست.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const client = await createSupabaseBrowserClient();
      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.push("/login?next=%2Fcheckout");
        return;
      }

      const idempotencyKey = crypto.randomUUID();
      const { data: orderId, error } = await client.rpc("create_checkout_order", {
        p_idempotency_key: idempotencyKey,
        p_shipping_method: shippingMethod,
        p_shipping_address: address.trim(),
        p_postal_code: postalCode,
        p_coupon_code: couponCode.trim() ? couponCode.trim().toUpperCase() : null,
        p_items: serializeCart(availableItems),
      });
      if (error) throw error;
      if (!orderId) throw new Error("Checkout did not return an order id");

      const { error: clearCartError } = await client
        .from("profiles")
        .update({ cart: [], address: address.trim(), postal_code: postalCode })
        .eq("id", user.id);
      if (clearCartError) {
        console.error("Checkout order was created but cart clearing failed:", clearCartError);
        setNotice("سفارش ثبت شد، اما پاک شدن سبد نیاز به بررسی دارد.");
        window.setTimeout(() => router.push("/profile"), 1400);
        return;
      }
      setNotice("سفارش با موفقیت ثبت شد و در وضعیت انتظار پرداخت قرار دارد.");
      window.setTimeout(() => router.push("/profile"), 1400);
    } catch (error) {
      console.error("Could not create checkout order:", error);
      setNotice(
        error instanceof Error
          ? `ثبت سفارش ناموفق بود: ${error.message}`
          : "ثبت سفارش انجام نشد. لطفاً دوباره تلاش کنید.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.topbar}>
        <Link href="/"><i className="fas fa-store" /> بازگشت به فروشگاه</Link>
        <h1>تکمیل سفارش</h1>
        <Link href="/cart"><i className="fas fa-shopping-cart" /> سبد خرید</Link>
      </header>

      <main className={styles.layout}>
        <div className={styles.forms}>
          <section className={styles.card}>
            <h2><span><i className="fas fa-truck" /></span> آدرس و اطلاعات ارسال</h2>
            <div className={styles.formGrid}>
              <label>نام و نام خانوادگی<input value={profile?.name ?? ""} readOnly /></label>
              <label>ایمیل یا موبایل<input value={profile?.mobile ?? email} readOnly /></label>
              <label className={styles.full}>آدرس دقیق پستی
                <textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={3} />
              </label>
              <label>کد پستی
                <input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} inputMode="numeric" maxLength={10} />
              </label>
              <label>روش ارسال
                <select value={shippingMethod} onChange={(event) => setShippingMethod(event.target.value as typeof shippingMethod)}>
                  <option value="post">پست پیشتاز — ۳۵٬۰۰۰ تومان</option>
                  <option value="tipax">تیپاکس — ۴۵٬۰۰۰ تومان</option>
                  <option value="free">رایگان</option>
                </select>
              </label>
            </div>
          </section>

          <section className={styles.card}>
            <h2><span><i className="fas fa-credit-card" /></span> وضعیت پرداخت</h2>
            <div className={styles.pendingPayment}>
              <i className="fas fa-hourglass-half" />
              <div>
                <b>در انتظار اتصال درگاه پرداخت</b>
                <p>سفارش پس از ثبت در وضعیت «در انتظار پرداخت» باقی می‌ماند. هیچ پرداخت واقعی انجام نمی‌شود.</p>
              </div>
            </div>
          </section>
        </div>

        <aside className={styles.summary}>
          <h2>خلاصه سفارش</h2>
          {availableItems.map((item) => {
            const product = productMap.get(item.id);
            if (!product) return null;
            return (
              <div className={styles.summaryItem} key={`${item.id}-${item.color}`}>
                <span className={styles.miniImage}>
                  {product.image_url
                    ? <Image src={product.image_url} alt="" fill sizes="48px" unoptimized />
                    : <i className="far fa-image" />}
                </span>
                <div><b>{product.name}</b><small>رنگ: {item.color} | تعداد: {item.qty}</small></div>
                <strong>{(finalPrice(product) * item.qty).toLocaleString("fa-IR")}</strong>
              </div>
            );
          })}
          {availableItems.length === 0 && <p className={styles.emptyCart}>سبد خرید فعال نیست.</p>}
          <div className={styles.summaryRow}><span>جمع کالاها</span><b>{subtotal.toLocaleString("fa-IR")} تومان</b></div>
          <div className={styles.summaryRow}><span>تخفیف محصول</span><b>−{productDiscount.toLocaleString("fa-IR")} تومان</b></div>
          {couponDiscount > 0 && <div className={styles.summaryRow}><span>تخفیف کد</span><b>−{couponDiscount.toLocaleString("fa-IR")} تومان</b></div>}
          <div className={styles.summaryRow}><span>ارسال</span><b>{shippingCost === 0 ? "رایگان" : `${shippingCost.toLocaleString("fa-IR")} تومان`}</b></div>
          <div className={styles.coupon}>
            <input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="کد تخفیف" />
            <button type="button" onClick={applyCoupon} disabled={busy}>اعمال</button>
          </div>
          <div className={styles.total}><span>مبلغ قابل پرداخت</span><b>{total.toLocaleString("fa-IR")} تومان</b></div>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          <button type="button" className={styles.submit} onClick={submitOrder} disabled={busy || availableItems.length === 0}>
            {busy ? "در حال ثبت..." : "ثبت سفارش"}
          </button>
        </aside>
      </main>
    </div>
  );
}
