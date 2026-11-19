"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AuditLog, Coupon, Product } from "@/types/database";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import styles from "./admin-page.module.css";

type Tab = "products" | "orders" | "coupons" | "audit";
export type AdminOrder = {
  id: string;
  user_id: string;
  status: "pending_payment" | "paid" | "processing" | "shipped" | "delivered" | "failed_payment";
  total_amount: number;
  shipping_method: string;
  shipping_address: string;
  postal_code: string;
  coupon_code: string | null;
  created_at: string;
};

export function AdminPage({
  email,
  products: initialProducts,
  coupons: initialCoupons,
  orders: initialOrders,
  auditLogs,
  loadError,
}: {
  email: string;
  products: Product[];
  coupons: Coupon[];
  orders: AdminOrder[];
  auditLogs: AuditLog[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState(initialProducts);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [orders, setOrders] = useState(initialOrders);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(loadError ? "بخش‌هایی از داده‌های مدیریت از Supabase قابل خواندن نبودند." : "");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductStock, setNewProductStock] = useState("0");
  const [newCouponCode, setNewCouponCode] = useState("");
  const [newCouponValue, setNewCouponValue] = useState("");

  async function addAudit(action: "create" | "update" | "delete", entityType: string, description: string) {
    try {
      const client = await createSupabaseBrowserClient();
      await client.from("audit_logs").insert({
        admin_email: email,
        action,
        entity_type: entityType,
        description,
      });
    } catch (error) {
      console.error("Could not write admin audit log:", error);
    }
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const client = await createSupabaseBrowserClient();
      const name = editingProduct?.name ?? newProductName.trim();
      const price = editingProduct?.price ?? Number(newProductPrice);
      const stock = editingProduct?.stock ?? Number(newProductStock);
      if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
        setNotice("نام، قیمت و موجودی محصول معتبر نیست.");
        return;
      }
      if (editingProduct) {
        const { data, error } = await client
          .from("products")
          .update({ name, price, stock, updated_at: new Date().toISOString() })
          .eq("id", editingProduct.id)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (data) setProducts((current) => current.map((item) => item.id === data.id ? data : item));
        await addAudit("update", "product", `محصول «${name}» ویرایش شد`);
      } else {
        const { data, error } = await client
          .from("products")
          .insert({ name, price, stock, description: "", is_active: true })
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (data) setProducts((current) => [data, ...current]);
        setNewProductName("");
        setNewProductPrice("");
        setNewProductStock("0");
        await addAudit("create", "product", `محصول «${name}» ایجاد شد`);
      }
    } catch (error) {
      console.error("Could not save admin product:", error);
      setNotice("ذخیرهٔ محصول انجام نشد. دسترسی ادمین یا schema را بررسی کنید.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`محصول «${product.name}» حذف شود؟`)) return;
    setBusy(true);
    setNotice("");
    try {
      const client = await createSupabaseBrowserClient();
      const { error } = await client.from("products").delete().eq("id", product.id);
      if (error) throw error;
      setProducts((current) => current.filter((item) => item.id !== product.id));
      await addAudit("delete", "product", `محصول «${product.name}» حذف شد`);
    } catch (error) {
      console.error("Could not delete admin product:", error);
      setNotice("حذف محصول انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCoupon(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const code = newCouponCode.trim().toUpperCase();
      const value = Number(newCouponValue);
      if (!code || !Number.isFinite(value) || value < 0) {
        setNotice("کد یا مبلغ تخفیف معتبر نیست.");
        return;
      }
      const client = await createSupabaseBrowserClient();
      const { data, error } = await client
        .from("coupons")
        .insert({
          code,
          discount_type: "fixed",
          discount_value: value,
          is_active: true,
        })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (data) setCoupons((current) => [data, ...current]);
      setNewCouponCode("");
      setNewCouponValue("");
      await addAudit("create", "coupon", `کد تخفیف «${code}» ایجاد شد`);
    } catch (error) {
      console.error("Could not save admin coupon:", error);
      setNotice("ذخیرهٔ کد تخفیف انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCoupon(coupon: Coupon) {
    if (!window.confirm(`کد «${coupon.code}» حذف شود؟`)) return;
    setBusy(true);
    try {
      const client = await createSupabaseBrowserClient();
      const { error } = await client.from("coupons").delete().eq("id", coupon.id);
      if (error) throw error;
      setCoupons((current) => current.filter((item) => item.id !== coupon.id));
      await addAudit("delete", "coupon", `کد تخفیف «${coupon.code}» حذف شد`);
    } catch (error) {
      console.error("Could not delete admin coupon:", error);
      setNotice("حذف کد تخفیف انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function updateOrderStatus(order: AdminOrder, status: AdminOrder["status"]) {
    setBusy(true);
    setNotice("");
    try {
      const client = await createSupabaseBrowserClient();
      const { error } = await client
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item));
      await addAudit("update", "order", `وضعیت سفارش «${order.id}» به ${status} تغییر کرد`);
    } catch (error) {
      console.error("Could not update admin order:", error);
      setNotice("تغییر وضعیت سفارش انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    const client = await createSupabaseBrowserClient();
    await client.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className={`${styles.page} admin-page`} dir="rtl">
      <StorefrontHeader />
      <aside className={styles.sidebar}>
        <div className={styles.brand}><i className="fas fa-store" /><div><b>Pnyshop</b><small>پنل مدیریت</small></div></div>
        <nav>
          {([
            ["products", "fa-layer-group", "محصولات"],
            ["orders", "fa-shopping-basket", "سفارش‌ها"],
            ["coupons", "fa-ticket-alt", "کدهای تخفیف"],
            ["audit", "fa-history", "گزارش فعالیت"],
          ] as const).map(([value, icon, label]) => (
            <button type="button" key={value} className={tab === value ? styles.active : ""} onClick={() => setTab(value)}>
              <i className={`fas ${icon}`} /> {label}
            </button>
          ))}
        </nav>
        <div className={styles.account}>
          <small>{email}</small>
          <Link href="/">بازگشت به فروشگاه</Link>
          <button type="button" onClick={logout}><i className="fas fa-sign-out-alt" /> خروج</button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div><b>{tab === "products" ? "مدیریت انبار کالا" : tab === "orders" ? "سفارشات کاربران" : tab === "coupons" ? "کدهای تخفیف" : "گزارش فعالیت‌ها"}</b><small>{email}</small></div>
          <Link href="/">فروشگاه</Link>
        </header>
        {notice && <p className={styles.notice} role="status">{notice}</p>}

        {tab === "products" && (
          <section className={styles.content}>
            <div className={styles.stats}>
              <div><i className="fas fa-box" /><b>{products.length}</b><span>محصولات بارگذاری‌شده</span></div>
              <div><i className="fas fa-check-circle" /><b>{products.filter((item) => item.is_active).length}</b><span>محصول فعال</span></div>
              <div><i className="fas fa-shopping-cart" /><b>{orders.length}</b><span>سفارش اخیر</span></div>
            </div>
            <form className={styles.form} onSubmit={saveProduct}>
              <h2>{editingProduct ? `ویرایش «${editingProduct.name}»` : "افزودن محصول"}</h2>
              {editingProduct ? (
                <>
                  <input value={editingProduct.name} onChange={(event) => setEditingProduct({ ...editingProduct, name: event.target.value })} placeholder="نام محصول" />
                  <input type="number" value={editingProduct.price} onChange={(event) => setEditingProduct({ ...editingProduct, price: Number(event.target.value) })} placeholder="قیمت" />
                  <input type="number" value={editingProduct.stock} onChange={(event) => setEditingProduct({ ...editingProduct, stock: Number(event.target.value) })} placeholder="موجودی" />
                </>
              ) : (
                <>
                  <input value={newProductName} onChange={(event) => setNewProductName(event.target.value)} placeholder="نام محصول" />
                  <input type="number" value={newProductPrice} onChange={(event) => setNewProductPrice(event.target.value)} placeholder="قیمت" />
                  <input type="number" value={newProductStock} onChange={(event) => setNewProductStock(event.target.value)} placeholder="موجودی" />
                </>
              )}
              <button type="submit" disabled={busy}>{editingProduct ? "ذخیره تغییرات" : "افزودن"}</button>
              {editingProduct && <button type="button" onClick={() => setEditingProduct(null)}>لغو ویرایش</button>}
            </form>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>نام</th><th>قیمت</th><th>موجودی</th><th>وضعیت</th><th>عملیات</th></tr></thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.price.toLocaleString("fa-IR")} تومان</td>
                      <td>{product.stock.toLocaleString("fa-IR")}</td>
                      <td>{product.is_active ? "فعال" : "غیرفعال"}</td>
                      <td>
                        <button type="button" onClick={() => setEditingProduct(product)}><i className="fas fa-pen" /></button>
                        <button type="button" onClick={() => deleteProduct(product)}><i className="fas fa-trash" /></button>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && <tr><td colSpan={5}>محصولی بارگذاری نشده است.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "orders" && (
          <section className={styles.content}>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>شناسه</th><th>مبلغ</th><th>روش ارسال</th><th>وضعیت</th><th>تاریخ</th><th>عملیات</th></tr></thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td title={order.id}>{order.id.slice(0, 8)}</td>
                      <td>{order.total_amount.toLocaleString("fa-IR")} تومان</td>
                      <td>{order.shipping_method}</td>
                      <td>{order.status}</td>
                      <td>{new Date(order.created_at).toLocaleDateString("fa-IR")}</td>
                      <td>
                        <select value={order.status} disabled={busy} onChange={(event) => updateOrderStatus(order, event.target.value as AdminOrder["status"])}>
                          <option value="pending_payment">در انتظار پرداخت</option>
                          <option value="paid">پرداخت‌شده</option>
                          <option value="processing">در حال پردازش</option>
                          <option value="shipped">ارسال‌شده</option>
                          <option value="delivered">تحویل‌شده</option>
                          <option value="failed_payment">پرداخت ناموفق</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && <tr><td colSpan={6}>سفارشی وجود ندارد.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "coupons" && (
          <section className={styles.content}>
            <form className={styles.form} onSubmit={saveCoupon}>
              <h2>افزودن کد تخفیف ثابت</h2>
              <input value={newCouponCode} onChange={(event) => setNewCouponCode(event.target.value)} placeholder="کد مثل SAVE10" />
              <input type="number" value={newCouponValue} onChange={(event) => setNewCouponValue(event.target.value)} placeholder="مبلغ تخفیف" />
              <button type="submit" disabled={busy}>افزودن کد</button>
            </form>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>کد</th><th>نوع</th><th>مبلغ/درصد</th><th>وضعیت</th><th>عملیات</th></tr></thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.id}>
                      <td>{coupon.code}</td>
                      <td>{coupon.discount_type === "fixed" ? "ثابت" : "درصدی"}</td>
                      <td>{coupon.discount_value.toLocaleString("fa-IR")}</td>
                      <td>{coupon.is_active ? "فعال" : "غیرفعال"}</td>
                      <td><button type="button" onClick={() => deleteCoupon(coupon)}><i className="fas fa-trash" /></button></td>
                    </tr>
                  ))}
                  {coupons.length === 0 && <tr><td colSpan={5}>کد تخفیفی وجود ندارد.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "audit" && (
          <section className={styles.content}>
            <div className={styles.auditList}>
              {auditLogs.map((log) => (
                <article key={log.id}>
                  <i className={`fas ${log.action === "delete" ? "fa-trash" : log.action === "create" ? "fa-plus" : "fa-pen"}`} />
                  <div><b>{log.description}</b><small>{log.admin_email} — {new Date(log.created_at).toLocaleString("fa-IR")}</small></div>
                </article>
              ))}
              {auditLogs.length === 0 && <p>هنوز فعالیتی ثبت نشده است.</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
