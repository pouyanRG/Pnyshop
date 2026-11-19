"use client";

import Script from "next/script";
import { useEffect } from "react";

type SwiperOptions = {
  direction: "horizontal";
  loop: boolean;
  autoplay: { delay: number; disableOnInteraction: boolean };
  pagination: { el: string; clickable: boolean };
  navigation: { nextEl: string; prevEl: string };
  effect: "fade";
  fadeEffect: { crossFade: boolean };
};

declare global {
  interface Window {
    Swiper?: new (selector: string, options: SwiperOptions) => unknown;
    toggleTheme: () => void;
    toggleMegaMenu: () => void;
    handleMegaTriggerKeydown: (event: KeyboardEvent) => void;
    megaShowRail: () => void;
    openSRP: (query?: string, category?: string, mode?: string) => void;
    closeSRP: () => void;
    openFilterSheet: (section: string) => void;
    closeFilterSheet: () => void;
    srpFilter: () => void;
    onSrpSortChange: (value: string) => void;
    clearSrpFilters: () => void;
    toggleAcc: (element: HTMLElement) => void;
    onPriceRangeInput: (side: string) => void;
    updateFilterBadges: () => void;
    setSrpRating: (rating: number) => void;
    setSrpViewMode: (mode: string) => void;
    copyCouponCode: (code: string) => void;
  }
}

function showHero() {
  const loadingState = document.getElementById("heroLoadingState");
  const slider = document.getElementById("heroSwiperContainer");
  if (loadingState) loadingState.style.display = "none";
  if (slider) slider.style.display = "block";
}

function initializeHero() {
  if (window.Swiper && !document.querySelector(".hero-swiper.swiper-initialized")) {
    new window.Swiper(".hero-swiper", {
      direction: "horizontal",
      loop: true,
      autoplay: { delay: 4500, disableOnInteraction: false },
      pagination: { el: ".hero-pagination", clickable: true },
      navigation: { nextEl: ".hero-next", prevEl: ".hero-prev" },
      effect: "fade",
      fadeEffect: { crossFade: true },
    });
  }
  showHero();
}

function showCatalogNotReady() {
  const grid = document.getElementById("srpGrid");
  if (!grid) return;

  const message = document.createElement("div");
  message.className = "filter-empty-note";
  message.setAttribute("role", "status");
  message.textContent =
    "برای نمایش محصولات، انتقال و اتصال داده‌های فروشگاه به سوپابیس باید تکمیل شود.";
  grid.replaceChildren(message);
}

export function LegacyHomeBehavior() {
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (theme: "light" | "dark") => {
      root.dataset.theme = theme;
      document.querySelectorAll("#themeToggle i, #mobileTheme i").forEach((icon) => {
        icon.className = `fas ${theme === "dark" ? "fa-sun" : "fa-moon"}`;
      });
      const toggle = document.getElementById("themeToggle");
      toggle?.setAttribute("aria-checked", String(theme === "dark"));
      const label = document.getElementById("themeLabel");
      if (label) label.textContent = theme === "dark" ? "حالت روز" : "حالت شب";
    };
    applyTheme(window.localStorage.getItem("theme") === "dark" ? "dark" : "light");

    window.toggleTheme = () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      window.localStorage.setItem("theme", next);
      applyTheme(next);
    };

    window.toggleMegaMenu = () => {
      const menu = document.getElementById("megaMenu");
      const trigger = document.getElementById("megaTrigger");
      const isOpen = menu?.classList.toggle("open") ?? false;
      menu?.setAttribute("aria-hidden", String(!isOpen));
      trigger?.setAttribute("aria-expanded", String(isOpen));
    };

    window.handleMegaTriggerKeydown = (event) => {
      if (event.key === "Escape") {
        document.getElementById("megaMenu")?.classList.remove("open");
        document.getElementById("megaTrigger")?.setAttribute("aria-expanded", "false");
      }
    };

    window.megaShowRail = () => {
      document.getElementById("megaMenu")?.setAttribute("data-mobile-view", "rail");
    };

    window.openSRP = (query = "", category = "", mode = "all") => {
      const overlay = document.getElementById("srpOverlay");
      overlay?.classList.add("open");
      overlay?.setAttribute("data-search-mode", mode);
      overlay?.setAttribute("data-search-category", category);
      const input = document.getElementById("srpInput") as HTMLInputElement | null;
      if (input) {
        input.value = query;
        input.focus();
      }
      showCatalogNotReady();
    };

    window.closeSRP = () => {
      document.getElementById("srpOverlay")?.classList.remove("open");
    };

    window.openFilterSheet = (section) => {
      const panel = document.getElementById("srpFilters");
      panel?.classList.add("open");
      document.getElementById("filterSheetOverlay")?.classList.add("show");
      if (section && section !== "all") {
        const target = panel?.querySelector<HTMLElement>(
          `.filter-acc-item[data-acc="${section}"]`,
        );
        if (target) {
          panel?.querySelectorAll(".filter-acc-item").forEach((item) => {
            if (item !== target) item.classList.remove("open");
          });
          target.classList.add("open");
        }
      }
    };

    window.closeFilterSheet = () => {
      document.getElementById("filterSheetOverlay")?.classList.remove("show");
      document.getElementById("srpFilters")?.classList.remove("open");
    };

    window.srpFilter = showCatalogNotReady;
    window.onSrpSortChange = (value) => {
      for (const id of ["srpSort", "srpSortMobile"]) {
        const select = document.getElementById(id) as HTMLSelectElement | null;
        if (select) select.value = value;
      }
      showCatalogNotReady();
    };
    window.clearSrpFilters = () => {
      for (const id of ["fAvail", "fDisc"]) {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.checked = false;
      }
      window.onSrpSortChange("relevant");
      window.setSrpRating(0);
      window.updateFilterBadges();
    };
    window.onPriceRangeInput = (side) => {
      const input = document.getElementById(
        side === "min" ? "priceRangeMin" : "priceRangeMax",
      ) as HTMLInputElement | null;
      const output = document.getElementById(
        side === "min" ? "priceMinDisplay" : "priceMaxDisplay",
      );
      if (input && output) {
        output.textContent = Number(input.value).toLocaleString("fa-IR");
      }
      window.updateFilterBadges();
      showCatalogNotReady();
    };
    window.updateFilterBadges = () => {
      const count = ["fAvail", "fDisc"].reduce((total, id) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        return total + (input?.checked ? 1 : 0);
      }, 0);
      const badge = document.getElementById("srpFilterChipBadge");
      if (badge) {
        badge.textContent = count.toLocaleString("fa-IR");
        badge.style.display = count ? "inline-flex" : "none";
      }
    };
    window.setSrpRating = (rating) => {
      document.querySelectorAll<HTMLButtonElement>(".star-filter-item").forEach((button) => {
        button.setAttribute("aria-pressed", String(Number(button.dataset.rating) === rating));
      });
      showCatalogNotReady();
    };
    window.setSrpViewMode = (mode) => {
      const grid = document.getElementById("srpGrid");
      if (grid) grid.dataset.viewMode = mode;
      for (const [id, active] of [
        ["srpViewGridBtn", mode === "grid"],
        ["srpViewListBtn", mode === "list"],
      ] as const) {
        const button = document.getElementById(id);
        button?.classList.toggle("active", active);
        button?.setAttribute("aria-pressed", String(active));
      }
      showCatalogNotReady();
    };
    window.toggleAcc = (element) => element.parentElement?.classList.toggle("open");
    window.copyCouponCode = async (code) => {
      try {
        await navigator.clipboard.writeText(code);
      } catch (error) {
        console.error("Could not copy coupon code", error);
        showCatalogNotReady();
      }
    };

    const search = document.getElementById("mainSearch") as HTMLInputElement | null;
    const clearSearch = document.getElementById("clearSearch");
    const openSearch = () => {
      if (search?.value.trim()) window.openSRP(search.value.trim());
    };
    const clearSearchValue = () => {
      if (search) {
        search.value = "";
        search.focus();
      }
    };
    const onSearchKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") openSearch();
    };
    search?.addEventListener("keydown", onSearchKeyDown);
    clearSearch?.addEventListener("click", clearSearchValue);

    let lastScrollY = window.scrollY;
    const onScroll = () => {
      const header = document.getElementById("mainHeader");
      const currentY = window.scrollY;
      header?.classList.toggle("scrolled", currentY > 10);
      if (currentY <= 10 || currentY < lastScrollY) {
        header?.classList.remove("header-hidden");
      } else if (currentY > lastScrollY) {
        header?.classList.add("header-hidden");
      }
      lastScrollY = currentY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.closeSRP();
        window.closeFilterSheet();
        document.getElementById("megaMenu")?.classList.remove("open");
      }
    };
    document.addEventListener("keydown", onEscape);
    initializeHero();

    return () => {
      search?.removeEventListener("keydown", onSearchKeyDown);
      clearSearch?.removeEventListener("click", clearSearchValue);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/swiper@10/swiper-bundle.min.js"
      strategy="afterInteractive"
      onReady={initializeHero}
      onError={showHero}
    />
  );
}
