"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Json, Product } from "@/types/database";

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

export function LegacyCheckoutBehavior() {
  const router = useRouter();
  useEffect(() => {
    const theme = window.localStorage.getItem("theme") === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;

    let cart: CartItem[] = [];
    let products: Product[] = [];
    let couponDiscount = 0;
    let couponCode: string | null = null;

    const subtotalEl = document.getElementById("subtotal");
    const shippingEl = document.getElementById("shipping-cost");
    const discountEl = document.getElementById("discount-val");
    const couponSavedRow = document.getElementById("couponSavedRow");
    const couponSavedEl = document.getElementById("coupon-saved-val");
    const totalEl = document.getElementById("final-total");
    const shippingSelect = document.getElementById("shipping-method") as HTMLSelectElement | null;

    function finalPrice(product: Product) {
      return Math.round(product.price * (1 - product.discount / 100));
    }

    function subtotal() {
      const map = new Map(products.map((product) => [String(product.id), product]));
      return cart.reduce((sum, item) => {
        const product = map.get(item.id);
        return sum + (product ? finalPrice(product) * item.qty : 0);
      }, 0);
    }

    function updateSummary() {
      const sum = subtotal();
      const method = shippingSelect?.value ?? "post";
      const shipping = method === "free" || sum >= 1_000_000 ? 0 : method === "tipax" ? 45_000 : 35_000;
      const productDiscount = cart.reduce((sumDiscount, item) => {
        const product = products.find((candidate) => String(candidate.id) === item.id);
        return sumDiscount + (product ? (product.price - finalPrice(product)) * item.qty : 0);
      }, 0);
      if (subtotalEl) subtotalEl.textContent = `${sum.toLocaleString("en-US")} تومان`;
      if (shippingEl) shippingEl.textContent = shipping === 0 ? "رایگان" : `${shipping.toLocaleString("en-US")} تومان`;
      if (discountEl) discountEl.textContent = `-${productDiscount.toLocaleString("en-US")} تومان`;
      if (couponSavedRow) couponSavedRow.style.display = couponDiscount > 0 ? "flex" : "none";
      if (couponSavedEl) couponSavedEl.textContent = `-${couponDiscount.toLocaleString("en-US")} تومان`;
      if (totalEl) totalEl.textContent = `${Math.max(0, sum + shipping - couponDiscount).toLocaleString("en-US")} تومان`;
    }

    function showToast(message: string, type: "success" | "error" = "success") {
      const toast = document.getElementById("toast");
      const text = document.getElementById("toastMsg");
      if (!toast || !text) return;
      toast.className = `toast show ${type}`;
      text.textContent = message;
      window.setTimeout(() => toast.classList.remove("show"), 3000);
    }

    void (async () => {
      try {
        const client = await createSupabaseBrowserClient();
        const { data: auth, error: authError } = await client.auth.getUser();
        if (authError) throw authError;
        const user = auth.user;
        if (!user) {
          router.replace("/login?next=%2Fcheckout");
          return;
        }
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("name,mobile,address,postal_code,cart")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        cart = parseCart(profile?.cart ?? []);
        const ids = [...new Set(cart.map((item) => item.id))];
        if (ids.length > 0) {
          const { data, error } = await client
            .from("products")
            .select("*")
            .in("id", ids.map((id) => Number(id)))
            .eq("is_active", true);
          if (error) throw error;
          products = data ?? [];
        }
        const name = document.getElementById("ship-name") as HTMLInputElement | null;
        const phone = document.getElementById("ship-phone") as HTMLInputElement | null;
        const address = document.getElementById("ship-address") as HTMLTextAreaElement | null;
        const postal = document.getElementById("ship-postal") as HTMLInputElement | null;
        if (name) name.value = profile?.name ?? "";
        if (phone) phone.value = profile?.mobile ?? user.email ?? "";
        if (address) address.value = profile?.address ?? "";
        if (postal) postal.value = profile?.postal_code ?? "";

        const container = document.getElementById("summary-items");
        if (container) {
          container.innerHTML = cart.map((item) => {
            const product = products.find((candidate) => String(candidate.id) === item.id);
            if (!product) return "";
            return `<div class="summary-item"><div class="item-info"><img src="${escapeAttribute(product.image_url ?? "")}" class="item-img-mini" onerror="this.onerror=null;this.src='/images/Placeholder.png'"><div class="item-details"><h4>${escapeHtml(product.name)}</h4><p>رنگ: ${escapeHtml(item.color)} | تعداد: ${item.qty}</p></div></div><div style="font-weight:700">${(finalPrice(product) * item.qty).toLocaleString("en-US")}</div></div>`;
          }).join("");
        }
        updateSummary();
      } catch (error) {
        console.error("Could not initialize legacy checkout:", error);
        showToast("بارگذاری سبد یا کاتالوگ از سوپابیس ناموفق بود.", "error");
      }
    })();

    shippingSelect?.addEventListener("change", updateSummary);

    (window as typeof window & { selectPayment?: (method: string, element: HTMLElement) => void }).selectPayment =
      (method: string, element: HTMLElement) => {
        document.querySelectorAll(".payment-card").forEach((card) => card.classList.remove("active"));
        element.classList.add("active");
        const hidden = document.getElementById("selected-payment-gateway") as HTMLInputElement | null;
        if (hidden) hidden.value = method;
      };

    const couponButton = document.getElementById("couponBtn");
    couponButton?.addEventListener("click", async () => {
      const input = document.getElementById("couponInput") as HTMLInputElement | null;
      const code = input?.value.trim().toUpperCase();
      const box = document.getElementById("couponBox");
      const message = document.getElementById("couponMessage");
      couponDiscount = 0;
      couponCode = null;
      if (!code) {
        box?.classList.add("is-error");
        if (message) message.textContent = "کد تخفیف را وارد کنید.";
        updateSummary();
        return;
      }
      try {
        const client = await createSupabaseBrowserClient();
        const { data, error } = await client
          .from("coupons")
          .select("*")
          .eq("code", code)
          .maybeSingle();
        if (error) throw error;
        if (!data?.is_active) throw new Error("این کد تخفیف نامعتبر یا غیرفعال است.");
        const sum = subtotal();
        if (sum < data.minimum_amount) throw new Error(`حداقل مبلغ خرید ${data.minimum_amount.toLocaleString("fa-IR")} تومان است.`);
        let discount = data.discount_type === "fixed"
          ? data.discount_value
          : sum * (data.discount_value / 100);
        if (data.maximum_discount != null) discount = Math.min(discount, data.maximum_discount);
        couponDiscount = Math.min(Math.round(discount), sum);
        couponCode = data.code;
        box?.classList.remove("is-error");
        box?.classList.add("is-success");
        if (message) message.textContent = "کد تخفیف اعمال شد.";
        updateSummary();
      } catch (error) {
        box?.classList.remove("is-success");
        box?.classList.add("is-error");
        if (message) message.textContent = error instanceof Error ? error.message : "بررسی کد تخفیف ناموفق بود.";
        updateSummary();
      }
    });

    (window as typeof window & { processOrder?: () => Promise<void> }).processOrder = async () => {
      const address = (document.getElementById("ship-address") as HTMLTextAreaElement | null)?.value.trim() ?? "";
      const postal = (document.getElementById("ship-postal") as HTMLInputElement | null)?.value ?? "";
      if (address.length < 10) {
        showToast("آدرس کامل پستی را وارد کنید.", "error");
        return;
      }
      if (postal && !/^\d{10}$/.test(postal)) {
        showToast("کد پستی باید ۱۰ رقم باشد.", "error");
        return;
      }
      if (cart.length === 0) {
        showToast("سبد خرید خالی است.", "error");
        return;
      }
      const payButton = document.getElementById("payBtn") as HTMLButtonElement | null;
      if (payButton) payButton.disabled = true;
      try {
        const client = await createSupabaseBrowserClient();
        const { data: auth } = await client.auth.getUser();
        if (!auth.user) {
          router.replace("/login?next=%2Fcheckout");
          return;
        }
        const method = shippingSelect?.value ?? "post";
        const { data: orderId, error } = await client.rpc("create_checkout_order", {
          p_idempotency_key: crypto.randomUUID(),
          p_shipping_method: method,
          p_shipping_address: address,
          p_postal_code: postal,
          p_coupon_code: couponCode,
          p_items: cart,
        });
        if (error) throw error;
        if (!orderId) throw new Error("شناسهٔ سفارش دریافت نشد.");
        const { error: clearError } = await client
          .from("profiles")
          .update({ cart: [], address, postal_code: postal })
          .eq("id", auth.user.id);
        if (clearError) console.error("Could not clear cart after checkout:", clearError);
        showToast("سفارش ثبت شد؛ در انتظار اتصال درگاه پرداخت باقی است.", "success");
        window.setTimeout(() => { router.push("/profile"); }, 1500);
      } catch (error) {
        console.error("Could not create checkout order:", error);
        showToast(error instanceof Error ? error.message : "ثبت سفارش ناموفق بود.", "error");
      } finally {
        if (payButton) payButton.disabled = false;
      }
    };

    return () => undefined;
  }, [router]);
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
