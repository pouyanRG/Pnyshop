"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Product } from "@/types/database";

type CatalogProduct = Pick<
  Product,
  "id" | "name" | "price" | "discount" | "stock" | "category" | "image_url" | "is_active" | "created_at"
>;

type Message = {
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
};

const QUICK_PROMPTS = [
  {
    title: "جستجوی سریع",
    description: "پیدا کردن بهترین محصولات موجود",
    prompt: "چه محصولی مد نظرتان است؟",
    icon: "fa-magnifying-glass",
    color: "qc-blue",
  },
  {
    title: "پیشنهاد محصول",
    description: "محصولات برتر متناسب با نیاز شما",
    prompt: "پیشنهاد محصول بده",
    icon: "fa-bag-shopping",
    color: "qc-green",
  },
  {
    title: "پیگیری سفارش",
    description: "بررسی آخرین وضعیت مرسوله‌ها",
    prompt: "سفارش‌های من را پیگیری کن",
    icon: "fa-truck",
    color: "qc-purple",
  },
  {
    title: "سوالات متداول",
    description: "پاسخ به قوانین، ارسال و بازگشت کالا",
    prompt: "راهنمای خرید، ارسال و بازگشت کالا را بگو",
    icon: "fa-circle-question",
    color: "qc-orange",
  },
];

export function AiPage() {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [userName, setUserName] = useState("کاربر مهمان");
  const [userEmail, setUserEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const client = await createSupabaseBrowserClient();
        const [{ data: catalog, error: catalogError }, auth] = await Promise.all([
          client
            .from("products")
            .select("id,name,price,discount,stock,category,image_url,is_active,created_at")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(80),
          client.auth.getUser(),
        ]);
        if (catalogError) {
          console.error("Could not load AI catalog:", catalogError);
        } else if (active) {
          setProducts(catalog ?? []);
        }

        if (auth.error && auth.error.name !== "AuthSessionMissingError") {
          console.error("Could not load AI assistant account:", auth.error);
        } else if (auth.data.user && active) {
          setSignedIn(true);
          setUserEmail(auth.data.user.email ?? "");
          const { data: profile, error: profileError } = await client
            .from("profiles")
            .select("name")
            .eq("id", auth.data.user.id)
            .maybeSingle();
          if (profileError) {
            console.error("Could not load AI assistant profile:", profileError);
          }
          if (active) setUserName(profile?.name || "کاربر");
        }
      } catch (error) {
        console.error("Could not initialize AI assistant:", error);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (main) main.scrollTo({ top: main.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(async (suggestion?: string) => {
    const message = (suggestion ?? input).trim();
    if (!message || busy) return;

    const history = messages
      .filter((item) => !item.isError)
      .slice(-8)
      .map((item) => ({ role: item.role, text: item.text }));
    setInput("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; reply?: unknown }
        | null;
      const reply = typeof data?.reply === "string" ? data.reply : "";
      if (!response.ok || !data?.success || !reply.trim()) {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            text: reply || "پاسخ‌گویی دستیار موقتاً در دسترس نیست. لطفاً دوباره تلاش کنید.",
            isError: true,
          },
        ]);
        return;
      }
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
    } catch (error) {
      console.error("AI assistant request failed:", error);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "ارتباط با دستیار هوشمند برقرار نشد. اتصال خود را بررسی و دوباره تلاش کنید.",
          isError: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, input, messages]);

  function startNewChat() {
    setMessages([]);
    setInput("");
    setDrawerOpen(false);
    inputRef.current?.focus();
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <>
      {loading && (
        <div className="ai-skeleton" aria-label="در حال بارگذاری دستیار">
          <aside className="ai-skel-sidebar">
            <div className="skel-bar skel-avatar" />
            <div className="skel-bar skel-btn" />
            <div className="skel-bar skel-btn" />
            <div className="skel-bar skel-btn" />
          </aside>
          <main className="ai-skel-main">
            <div className="skel-bar skel-title" />
            <div className="skel-bar skel-card" />
            <div className="skel-bar skel-input" />
          </main>
        </div>
      )}

      <div className={`ai-shell ${loading ? "hidden" : ""}`}>
        <div className="ai-app">
          <button
            type="button"
            className={`ai-drawer-backdrop ${drawerOpen ? "active" : ""}`}
            onClick={closeDrawer}
            aria-label="بستن منو"
            tabIndex={drawerOpen ? 0 : -1}
          />

          <aside className={`ai-sidebar ${drawerOpen ? "open" : ""}`} id="aiSidebar">
            <div className="ai-sidebar-header">
              <div className="ai-brand-info">
                <span className="ai-sidebar-avatar">
                  <Image
                    src="/images/Minimal Three-Colour Sparkle Cluster.png"
                    alt=""
                    className="ai-avatar-img"
                    width={24}
                    height={24}
                  />
                </span>
                <div>
                  <h2 className="ai-sidebar-title">دستیار هوشمند</h2>
                  <p className="ai-sidebar-sub">مدل فعال: Gemini Flash</p>
                </div>
              </div>
              <button
                type="button"
                className="ai-icon-btn ai-mobile-close"
                onClick={closeDrawer}
                aria-label="بستن منو"
              >
                <i className="fas fa-times" />
              </button>
            </div>

            <button type="button" className="ai-btn-new-chat" onClick={startNewChat}>
              <i className="fas fa-plus" />
              <span>گفتگوی جدید</span>
            </button>

            <nav className="ai-nav" aria-label="دسترسی سریع">
              <div className="ai-nav-label">دسترسی سریع</div>
              <button
                type="button"
                className="ai-nav-item active"
                onClick={() => {
                  closeDrawer();
                  inputRef.current?.focus();
                }}
              >
                <i className="fas fa-comment-dots" />
                <span>صفحه گفتگو</span>
              </button>
              <button
                type="button"
                className="ai-nav-item"
                data-quick="پیشنهاد محصول بده"
                onClick={() => {
                  closeDrawer();
                  void send("پیشنهاد محصول بده");
                }}
              >
                <i className="fas fa-magic" />
                <span>پیشنهاد هوشمند</span>
              </button>
              <button
                type="button"
                className="ai-nav-item"
                onClick={() => {
                  closeDrawer();
                  void send("سفارش‌های من را پیگیری کن");
                }}
              >
                <i className="fas fa-box-archive" />
                <span>پیگیری سفارشات</span>
              </button>
              <button
                type="button"
                className="ai-nav-item"
                onClick={() => {
                  closeDrawer();
                  void send("راهنمای خرید، ارسال و بازگشت کالا را بگو");
                }}
              >
                <i className="fas fa-circle-question" />
                <span>راهنما و سوالات</span>
              </button>
            </nav>

            <div className="ai-history-section">
              <div className="ai-nav-label">تاریخچه گفتگوها</div>
              {messages.length > 0 && (
                <div className="ai-history-list">
                  <button
                    type="button"
                    className="ai-history-item active"
                    onClick={() => {
                      closeDrawer();
                      mainRef.current?.scrollTo({ top: mainRef.current.scrollHeight, behavior: "smooth" });
                    }}
                  >
                    <i className="far fa-message" />
                    <span className="ai-history-title">گفتگوی فعلی</span>
                  </button>
                </div>
              )}
            </div>

            <div className="ai-sidebar-promo">
              <i className="fas fa-wand-magic-sparkles" />
              <b>پاسخگویی ۲۴/۷</b>
              <span>راهنمای خرید و پاسخ‌گویی به سوالات فروشگاه.</span>
            </div>

            <Link className="ai-sidebar-user" href={signedIn ? "/profile" : "/login"}>
              <span className="ai-user-avatar">
                <i className="fas fa-user" />
              </span>
              <span className="ai-user-text">
                <b>{userName}</b>
                <span>{signedIn ? userEmail || "مشاهده حساب کاربری" : "ورود / ثبت‌نام"}</span>
              </span>
              <i className="fas fa-chevron-left ai-user-arrow" />
            </Link>
          </aside>

          <div className="ai-main-wrapper">
            <header className="ai-mobile-top">
              <button
                type="button"
                className="ai-icon-btn"
                onClick={() => setDrawerOpen(true)}
                aria-label="باز کردن منو"
              >
                <i className="fas fa-bars" />
              </button>
              <div className="ai-mobile-title">
                <i className="fas fa-wand-magic-sparkles" />
                <span>دستیار هوشمند</span>
              </div>
              <div className="ai-mobile-actions">
                <Link
                  className="ai-icon-btn"
                  href={signedIn ? "/profile" : "/login"}
                  aria-label="حساب کاربری"
                >
                  <i className="fas fa-user" />
                </Link>
              </div>
            </header>

            <header className="ai-desktop-top">
              <div className="ai-chat-model-selector">
                <span className="ai-model-badge">
                  <i className="fas fa-sparkles" /> Gemini AI
                </span>
              </div>
            </header>

            <main className="ai-main" ref={mainRef}>
              <div className="ai-content-container">
                {messages.length === 0 ? (
                  <div className="ai-hero-wrapper">
                    <div className="ai-hero-avatar">
                      <Image
                        src="/images/Minimal Three-Colour Sparkle Cluster.png"
                        alt=""
                        width={32}
                        height={32}
                      />
                    </div>
                    <h1>سلام! چطور می‌توانم کمکتان کنم؟</h1>
                    <p>پیشنهاد محصول، پیگیری سفارش یا پاسخ به سوالات شما در سریع‌ترین زمان ممکن</p>

                    <div className="ai-quick-grid">
                      {QUICK_PROMPTS.map((item) => (
                        <button
                          type="button"
                          className="ai-quick-card"
                          key={item.title}
                          onClick={() => void send(item.prompt)}
                        >
                          <div className="qc-header">
                            <span className={`qc-icon ${item.color}`}>
                              <i className={`fas ${item.icon}`} />
                            </span>
                            <b>{item.title}</b>
                          </div>
                          <span>{item.description}</span>
                        </button>
                      ))}
                    </div>

                    {products.some((product) => product.is_active && product.stock > 0) && (
                      <section className="ai-suggest-section" aria-label="پیشنهادهای ویژه فروشگاه">
                        <div className="ai-suggest-head">
                          <h2><i className="fas fa-fire text-orange" /> پیشنهادهای ویژه فروشگاه</h2>
                          <div className="ai-suggest-nav">
                            <button
                              type="button"
                              className="ai-sn-btn"
                              aria-label="محصولات قبلی"
                              onClick={() => suggestionsRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
                            >
                              <i className="fas fa-chevron-right" />
                            </button>
                            <button
                              type="button"
                              className="ai-sn-btn"
                              aria-label="محصولات بعدی"
                              onClick={() => suggestionsRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
                            >
                              <i className="fas fa-chevron-left" />
                            </button>
                          </div>
                        </div>
                        <div className="ai-suggest-scroll" ref={suggestionsRef}>
                          {products
                            .filter((product) => product.is_active && product.stock > 0)
                            .slice(0, 10)
                            .map((product) => (
                              <Link
                                className="ai-prod-card"
                                href={`/product?id=${encodeURIComponent(product.id)}`}
                                key={product.id}
                              >
                                <div className="ai-prod-img-wrap">
                                  <Image
                                    src={product.image_url || "/images/placeholder.svg"}
                                    alt={product.name}
                                    width={160}
                                    height={160}
                                    loading="lazy"
                                    unoptimized
                                    onError={(event) => {
                                      if (!event.currentTarget.src.endsWith("/images/placeholder.svg")) {
                                        event.currentTarget.src = "/images/placeholder.svg";
                                      }
                                    }}
                                  />
                                </div>
                                <div className="ai-prod-body">
                                  <div className="ai-prod-name">{product.name}</div>
                                  <div className="ai-prod-price">
                                    {Math.round(product.price * (1 - product.discount / 100)).toLocaleString("fa-IR")}
                                    {" "}
                                    <small>تومان</small>
                                  </div>
                                  <span className="ai-prod-btn">مشاهده محصول</span>
                                </div>
                              </Link>
                            ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <div className="ai-chat-log" aria-live="polite">
                    {messages.map((message, index) => (
                      <div
                        className={`ai-msg-row ${message.role === "user" ? "user" : "bot"}`}
                        key={`${message.role}-${index}`}
                      >
                        <span className="ai-msg-avatar" aria-hidden="true">
                          {message.role === "assistant"
                            ? <i className="fas fa-wand-magic-sparkles" />
                            : <i className="fas fa-user" />}
                        </span>
                        <div className="ai-msg-content">
                          <div className="ai-msg-bubble">{message.text}</div>
                        </div>
                      </div>
                    ))}
                    {busy && (
                      <div className="ai-msg-row bot" role="status" aria-label="دستیار در حال پاسخ‌گویی">
                        <span className="ai-msg-avatar" aria-hidden="true">
                          <i className="fas fa-wand-magic-sparkles" />
                        </span>
                        <div className="ai-msg-content">
                          <div className="ai-msg-bubble ai-typing">
                            <span /><span /><span />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </main>

            <div className="ai-composer-wrapper">
              <div className="ai-composer">
                <div className="ai-composer-inner">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value);
                      event.target.style.height = "auto";
                      event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    className="ai-composer-input"
                    placeholder="پیامی بنویسید..."
                    aria-label="پیام خود را بنویسید"
                    dir="auto"
                    rows={1}
                    maxLength={2000}
                  />
                  <button
                    type="button"
                    className="ai-send-btn"
                    onClick={() => void send()}
                    disabled={busy || !input.trim()}
                    aria-label="ارسال پیام"
                  >
                    <i className="fas fa-arrow-up" />
                  </button>
                </div>
              </div>
              <div className="ai-composer-footer">
                <span>هوش مصنوعی ممکن است خطا داشته باشد. اطلاعات مهم را بررسی کنید.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
