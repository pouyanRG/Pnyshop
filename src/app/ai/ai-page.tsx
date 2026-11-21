"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Product } from "@/types/database";
import styles from "./ai-page.module.css";

type Message = { role: "user" | "assistant"; text: string };

export function AiPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [userName, setUserName] = useState("کاربر مهمان");
  const [userEmail, setUserEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const client = await createSupabaseBrowserClient();
        const [{ data: catalog, error: catalogError }, auth] = await Promise.all([
          client.from("products").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(200),
          client.auth.getUser(),
        ]);
        if (catalogError) console.error("Could not load AI catalog:", catalogError);
        setProducts(catalog ?? []);
        if (!auth.error && auth.data.user) {
          setSignedIn(true);
          setUserEmail(auth.data.user.email ?? "");
          const { data: profile } = await client
            .from("profiles")
            .select("name")
            .eq("id", auth.data.user.id)
            .maybeSingle();
          setUserName(profile?.name || "کاربر");
        }
      } catch (error) {
        console.error("Could not initialize AI assistant:", error);
      }
    })();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  const catalogSummary = useMemo(
    () => products.map((product) => ({
      id: product.id,
      name: product.name,
      price: Math.round(product.price * (1 - product.discount / 100)),
      stock: product.stock,
      category: product.category,
    })),
    [products],
  );

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: [...messages, { role: "user", text: message }].slice(-8).map((item) => ({
            role: item.role === "assistant" ? "bot" : "user",
            text: item.text,
          })),
          userProfile: signedIn ? { name: userName, email: userEmail } : null,
          productsCatalog: catalogSummary,
        }),
      });
      const data = await response.json() as { success: boolean; reply: string };
      setMessages((current) => [
        ...current,
        { role: "assistant", text: data.reply || "پاسخی دریافت نشد." },
      ]);
    } catch (error) {
      console.error("AI assistant request failed:", error);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: "در ارتباط با دستیار هوشمند مشکلی رخ داد. دوباره تلاش کنید." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function startNewChat() {
    setMessages([]);
  }

  return (
    <div className={styles.page} dir="rtl">
      {drawerOpen && <button type="button" className={styles.backdrop} aria-label="بستن منو" onClick={() => setDrawerOpen(false)} />}
      <aside className={`${styles.sidebar} ${drawerOpen ? styles.open : ""}`}>
        <div className={styles.brand}>
          <span><i className="fas fa-wand-magic-sparkles" /></span>
          <div><b>دستیار هوشمند</b><small>مدل فعال: Gemini</small></div>
          <button type="button" onClick={() => setDrawerOpen(false)} aria-label="بستن"><i className="fas fa-times" /></button>
        </div>
        <button type="button" className={styles.newChat} onClick={startNewChat}><i className="fas fa-plus" /> گفتگوی جدید</button>
        <nav>
          <b>دسترسی سریع</b>
          <button type="button" onClick={() => send("بهترین محصولات موجود را پیشنهاد بده")}><i className="fas fa-magic" /> پیشنهاد هوشمند</button>
          <button type="button" onClick={() => send("وضعیت سفارش‌های من را توضیح بده")}><i className="fas fa-box-archive" /> پیگیری سفارشات</button>
          <button type="button" onClick={() => send("راهنمای خرید، ارسال و بازگشت کالا را بگو")}><i className="fas fa-circle-question" /> راهنما</button>
        </nav>
        <Link className={styles.user} href={signedIn ? "/profile" : "/login"}>
          <i className="fas fa-user" />
          <div><b>{userName}</b><small>{signedIn ? "مشاهده حساب کاربری" : "ورود / ثبت‌نام"}</small></div>
          <i className="fas fa-chevron-left" />
        </Link>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <button type="button" className={styles.menuButton} onClick={() => setDrawerOpen(true)} aria-label="منو"><i className="fas fa-bars" /></button>
          <span><i className="fas fa-sparkles" /> Gemini AI</span>
        </header>
        <div className={styles.chatArea}>
          {messages.length === 0 ? (
            <div className={styles.hero}>
              <span className={styles.heroIcon}><i className="fas fa-wand-magic-sparkles" /></span>
              <h1>سلام! چطور می‌توانم کمکتان کنم؟</h1>
              <p>پیشنهاد محصول، پیگیری سفارش و پاسخ به سوالات فروشگاه</p>
              <div className={styles.quickGrid}>
                {[
                  ["جستجوی سریع", "چه محصولی مد نظرتان است؟", "fa-magnifying-glass"],
                  ["پیشنهاد محصول", "پیشنهاد بده", "fa-bag-shopping"],
                  ["پیگیری سفارش", "سفارش‌های من", "fa-truck"],
                  ["سوالات متداول", "راهنما", "fa-circle-question"],
                ].map(([title, prompt, icon]) => (
                  <button type="button" key={title} onClick={() => send(prompt)}>
                    <i className={`fas ${icon}`} /><b>{title}</b><small>{prompt}</small>
                  </button>
                ))}
              </div>
              {products.length > 0 && (
                <section className={styles.suggestions}>
                  <h2><i className="fas fa-fire" /> پیشنهادهای ویژه فروشگاه</h2>
                  <div>
                    {products.filter((product) => product.stock > 0).slice(0, 8).map((product) => (
                      <Link href={`/product?id=${encodeURIComponent(product.id)}`} key={product.id}>
                        {product.image_url
                          ? <Image src={product.image_url} alt="" width={130} height={110} unoptimized />
                          : <i className="far fa-image" />}
                        <b>{product.name}</b>
                        <small>{Math.round(product.price * (1 - product.discount / 100)).toLocaleString("fa-IR")} تومان</small>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className={styles.log} ref={logRef}>
              {messages.map((message, index) => (
                <div className={`${styles.message} ${message.role === "assistant" ? styles.assistant : styles.user}`} key={`${message.role}-${index}`}>
                  {message.text}
                </div>
              ))}
              {busy && <div className={`${styles.message} ${styles.assistant}`}><i className="fas fa-ellipsis" /></div>}
            </div>
          )}
        </div>
        <footer className={styles.composer}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="پیام خود را بنویسید..."
            rows={1}
          />
          <button type="button" onClick={() => send()} disabled={busy || !input.trim()} aria-label="ارسال"><i className="fas fa-paper-plane" /></button>
        </footer>
      </main>
    </div>
  );
}
