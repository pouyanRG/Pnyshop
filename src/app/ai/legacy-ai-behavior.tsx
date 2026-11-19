"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Product } from "@/types/database";

type ChatHistoryItem = { role: "bot" | "user"; text: string };

export function LegacyAiBehavior() {
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (theme: "light" | "dark") => {
      root.dataset.theme = theme;
      document.querySelectorAll("#navTheme i, #aiThemeToggleMobile i").forEach((icon) => {
        icon.className = `fas ${theme === "dark" ? "fa-sun" : "fa-moon"}`;
      });
    };
    applyTheme(window.localStorage.getItem("theme") === "dark" ? "dark" : "light");

    const toggleTheme = () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      window.localStorage.setItem("theme", next);
      applyTheme(next);
    };
    document.getElementById("navTheme")?.addEventListener("click", toggleTheme);
    document.getElementById("aiThemeToggleMobile")?.addEventListener("click", toggleTheme);

    const sidebar = document.getElementById("aiSidebar");
    const backdrop = document.getElementById("aiDrawerBackdrop");
    const closeDrawer = () => {
      sidebar?.classList.remove("open");
      backdrop?.classList.remove("active");
    };
    document.getElementById("aiMobileMenuBtn")?.addEventListener("click", () => {
      sidebar?.classList.add("open");
      backdrop?.classList.add("active");
    });
    document.getElementById("aiDrawerClose")?.addEventListener("click", closeDrawer);
    backdrop?.addEventListener("click", closeDrawer);

    let products: Product[] = [];
    let history: ChatHistoryItem[] = [];
    let userProfile: unknown = null;

    void (async () => {
      try {
        const client = await createSupabaseBrowserClient();
        const [catalogResult, authResult] = await Promise.all([
          client
            .from("products")
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(200),
          client.auth.getUser(),
        ]);
        if (catalogResult.error) throw catalogResult.error;
        products = catalogResult.data ?? [];
        renderSuggestions(products);
        if (!authResult.error && authResult.data.user) {
          const { data: profile } = await client
            .from("profiles")
            .select("name")
            .eq("id", authResult.data.user.id)
            .maybeSingle();
          userProfile = { name: profile?.name, email: authResult.data.user.email };
          const name = document.getElementById("aiUserName");
          const sub = document.getElementById("aiUserSub");
          const link = document.getElementById("aiSidebarUser");
          if (name) name.textContent = profile?.name || "کاربر";
          if (sub) sub.textContent = authResult.data.user.email ?? "مشاهده حساب کاربری";
          if (link) link.setAttribute("href", "/profile");
        }
      } catch (error) {
        console.error("Could not initialize the legacy AI assistant:", error);
      } finally {
        document.getElementById("aiSkeleton")?.classList.add("hidden");
        document.getElementById("aiApp")?.classList.remove("hidden");
      }
    })();

    const input = document.getElementById("aiChatInput") as HTMLTextAreaElement | null;
    input?.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    });

    async function send(text: string) {
      const message = text.trim();
      if (!message) return;
      const hero = document.getElementById("aiHero");
      const log = document.getElementById("aiChatLog");
      if (hero) hero.style.display = "none";
      if (log) log.removeAttribute("hidden");
      appendMessage("user", message);
      if (input) {
        input.value = "";
        input.style.height = "auto";
      }

      const typing = document.createElement("div");
      typing.className = "ai-msg ai-msg-bot ai-typing";
      typing.innerHTML = '<i class="fas fa-ellipsis"></i>';
      log?.appendChild(typing);
      log?.scrollTo({ top: log.scrollHeight, behavior: "smooth" });

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            history,
            userProfile,
            productsCatalog: products.map((product) => ({
              id: product.id,
              name: product.name,
              price: Math.round(product.price * (1 - product.discount / 100)),
              stock: product.stock,
              category: product.category,
            })),
          }),
        });
        const data = await response.json() as { reply?: string; success?: boolean };
        typing.remove();
        if (!data.success) throw new Error(data.reply || "AI request failed");
        const reply = data.reply || "پاسخی دریافت نشد.";
        appendMessage("bot", reply);
        history.push({ role: "user", text: message }, { role: "bot", text: reply });
        history = history.slice(-8);
      } catch (error) {
        typing.remove();
        appendMessage(
          "bot",
          error instanceof Error ? error.message : "در ارتباط با دستیار هوشمند مشکلی رخ داد.",
        );
        console.error("Legacy AI request failed:", error);
      }
    }

    function appendMessage(role: "user" | "bot", text: string) {
      const log = document.getElementById("aiChatLog");
      if (!log) return;
      const message = document.createElement("div");
      message.className = `ai-msg ai-msg-${role}`;
      message.textContent = text;
      log.appendChild(message);
      log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    }

    document.getElementById("aiSendBtn")?.addEventListener("click", () => send(input?.value ?? ""));
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void send(input.value);
      }
    });
    document.querySelectorAll("[data-quick]").forEach((element) => {
      element.addEventListener("click", () => {
        closeDrawer();
        const text = (element as HTMLElement).dataset.quick;
        if (text) void send(text);
      });
    });
    document.getElementById("qcSearch")?.addEventListener("click", () => input?.focus());
    document.getElementById("navNewChat")?.addEventListener("click", () => {
      history = [];
      const log = document.getElementById("aiChatLog");
      const hero = document.getElementById("aiHero");
      if (log) {
        log.replaceChildren();
        log.setAttribute("hidden", "true");
      }
      if (hero) hero.style.display = "flex";
      closeDrawer();
    });
    document.getElementById("aiSuggestPrev")?.addEventListener("click", () => {
      document.getElementById("aiSuggestScroll")?.scrollBy({ left: 220, behavior: "smooth" });
    });
    document.getElementById("aiSuggestNext")?.addEventListener("click", () => {
      document.getElementById("aiSuggestScroll")?.scrollBy({ left: -220, behavior: "smooth" });
    });

    document.getElementById("aiMobileUserBtn")?.addEventListener("click", () => {
      window.location.href = userProfile ? "/profile" : "/login";
    });

    return () => {
      document.getElementById("navTheme")?.removeEventListener("click", toggleTheme);
      document.getElementById("aiThemeToggleMobile")?.removeEventListener("click", toggleTheme);
    };
  }, []);

  return null;
}

function renderSuggestions(products: Product[]) {
  const row = document.getElementById("aiSuggestScroll");
  if (!row) return;
  row.innerHTML = products
    .filter((product) => product.stock > 0)
    .slice(0, 10)
    .map((product) => {
      const price = Math.round(product.price * (1 - product.discount / 100));
      const image = product.image_url
        ? product.image_url
        : "/images/Placeholder.png";
      return `
        <a class="ai-suggest-card" href="/product?id=${encodeURIComponent(product.id)}">
          <div class="ai-suggest-img"><img src="${image}" alt="" onerror="this.src='/images/Placeholder.png'"></div>
          <div class="ai-suggest-name">${escapeHtml(product.name)}</div>
          <div class="ai-suggest-price">${price.toLocaleString("fa-IR")} تومان</div>
        </a>`;
    })
    .join("");
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
