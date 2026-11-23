"use client";

import Script from "next/script";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, Database, Json } from "@/types/database";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  asColors,
  createSrpCard,
  filterCatalog,
  finalPrice,
  sortCatalog,
  type SrpCriteria,
  type SrpMode,
  type SrpSort,
} from "@/lib/storefront/catalog";
import type { StorefrontProduct } from "@/lib/storefront/types";

type SwiperOptions = {
  direction: "horizontal";
  loop: boolean;
  rtl?: boolean;
  centeredSlides?: boolean;
  slidesPerView?: "auto" | number;
  spaceBetween?: number;
  grabCursor?: boolean;
  autoplay: { delay: number; disableOnInteraction: boolean };
  pagination?: { el: string; clickable: boolean };
  navigation: { nextEl: string; prevEl: string };
  effect?: "fade";
  fadeEffect?: { crossFade: boolean };
  breakpoints?: Record<number, Record<string, unknown>>;
  observer?: boolean;
  observeParents?: boolean;
};

declare global {
  interface Window {
    Swiper?: new (selector: string, options: SwiperOptions) => unknown;
    toggleTheme: () => void;
    toggleMegaMenu: () => void;
    handleMegaTriggerKeydown: (event: KeyboardEvent) => void;
    megaShowRail: () => void;
    megaShowPanel: () => void;
    megaActivateMain: (categoryId: number) => void;
    megaScheduleActivate: (categoryId: number) => void;
    closeMegaMenu: () => void;
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
    toggleBrandFilter: (brand: string, checked: boolean) => void;
    toggleColorFilter: (color: string, button: HTMLButtonElement) => void;
  }
}

const SRP_CHUNK_SIZE = 16;
const SRP_LOAD_LIMIT = 500;

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character,
  );
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

let toastTimer = 0;

function showToast(message: string): void {
  const toast = document.getElementById("toast");
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(
    () => toast.classList.remove("show"),
    3000,
  );
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

function initializeAmazingSwiper() {
  const slider = document.getElementById("amazingSwiperEl");
  if (!slider) return;
  const slideCount = slider.querySelectorAll(".swiper-slide").length;
  if (slideCount === 0 || !window.Swiper) return;
  if (slider.classList.contains("swiper-initialized")) return;
  new window.Swiper(".amazing-swiper", {
    direction: "horizontal",
    loop: slideCount > 1,
    rtl: true,
    centeredSlides: true,
    slidesPerView: "auto",
    spaceBetween: 12,
    grabCursor: true,
    autoplay: { delay: 3000, disableOnInteraction: false },
    navigation: { nextEl: ".amazing-nav-next", prevEl: ".amazing-nav-prev" },
    breakpoints: {
      769: { centeredSlides: false, slidesPerView: "auto", spaceBetween: 18 },
      1200: { centeredSlides: false, slidesPerView: "auto", spaceBetween: 20 },
    },
    observer: true,
    observeParents: true,
  });
}

function startAmazingTimer() {
  const root = document.getElementById("amazingSectionRoot");
  const hoursEl = document.getElementById("t-h");
  const minutesEl = document.getElementById("t-m");
  const secondsEl = document.getElementById("t-s");
  const timerBox = document.getElementById("ahTimerBox");
  if (!root || !hoursEl || !minutesEl || !secondsEl) return;

  const isActive = root.dataset.timerActive !== "false";
  if (!isActive && timerBox) timerBox.style.display = "none";

  const endValue = root.dataset.timerEnd || "";
  const endAt = endValue ? new Date(endValue).getTime() : Number.NaN;
  if (!isActive || Number.isNaN(endAt)) return;

  const pad = (value: number) => String(value).padStart(2, "0");
  const update = () => {
    const distance = endAt - Date.now();
    if (distance <= 0) {
      hoursEl.textContent = "۰۰";
      minutesEl.textContent = "۰۰";
      secondsEl.textContent = "۰۰";
      window.clearInterval(interval);
      return;
    }
    hoursEl.textContent = pad(
      Math.floor(distance / (1000 * 60 * 60)),
    );
    minutesEl.textContent = pad(
      Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
    );
    secondsEl.textContent = pad(Math.floor((distance % (1000 * 60)) / 1000));
  };

  update();
  const interval = window.setInterval(update, 1000);
}

type SrpState = {
  products: StorefrontProduct[];
  loaded: boolean;
  loading: boolean;
  query: string;
  category: string;
  mode: SrpMode;
  sort: SrpSort;
  rating: number;
  priceMin: number;
  priceMax: number;
  catalogMaxPrice: number;
  brands: Set<string>;
  colors: Set<string>;
  wishlist: number[];
  observer: IntersectionObserver | null;
  client: SupabaseClient<Database> | null;
  trigger: HTMLElement | null;
};

type CategoryNode = Category & { children: CategoryNode[] };

function buildMegaCategoryTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map(categories.map((category) => [
    category.id,
    { ...category, children: [] as CategoryNode[] },
  ]));
  const roots: CategoryNode[] = [];

  for (const node of nodes.values()) {
    if (node.parent_id !== null && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (items: CategoryNode[]) => {
    items.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

function collectCategoryLeaves(node: CategoryNode): Category[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(collectCategoryLeaves);
}

function renderMegaPanel(node: CategoryNode): void {
  const panel = document.getElementById("megaCatsPanel");
  if (!panel) return;

  const columns = node.children.length > 0
    ? node.children.map((child) => {
        const leaves = collectCategoryLeaves(child);
        const links = leaves.map((leaf) =>
          `<button type="button" class="mm-link" onclick="openSRP('', '${escapeAttr(leaf.name)}');closeMegaMenu();">${escapeHtml(leaf.name)}</button>`,
        ).join("");
        return `<div class="mega-panel-col">
          <button type="button" class="mm-col-title mm-link" onclick="openSRP('', '${escapeAttr(child.name)}');closeMegaMenu();">${escapeHtml(child.name)}</button>
          ${links}
        </div>`;
      }).join("")
    : `<div class="mega-panel-col">
        <button type="button" class="mm-link" onclick="openSRP('', '${escapeAttr(node.name)}');closeMegaMenu();">${escapeHtml(node.name)}</button>
      </div>`;

  panel.innerHTML = `<div class="mega-panel-columns">
    ${columns}
    <div class="mega-panel-col mega-panel-highlight">
      <div class="mm-col-title">پیشنهاد ما</div>
      <button type="button" class="mm-link" onclick="openSRP('', '', 'bestseller');closeMegaMenu();"><i class="fas fa-fire" style="color:var(--danger);font-size:11px;"></i> پرفروش‌ترین‌ها</button>
      <button type="button" class="mm-link" onclick="openSRP('', '', 'discount');closeMegaMenu();"><i class="fas fa-tag" style="color:var(--danger);font-size:11px;"></i> تخفیفات ویژه</button>
    </div>
  </div>`;
}

let megaHoverTimer = 0;
let megaCategoryNodes = new Map<number, CategoryNode>();

function initializeMegaCategories(categories: Category[]): void {
  const rail = document.getElementById("megaCatsRail");
  const panel = document.getElementById("megaCatsPanel");
  if (!rail || !panel) return;

  const roots = buildMegaCategoryTree(categories);
  megaCategoryNodes = new Map(roots.map((node) => [node.id, node]));

  if (roots.length === 0) {
    rail.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">دسته‌بندی‌ای یافت نشد.</div>';
    panel.innerHTML = "";
    return;
  }

  rail.innerHTML = roots.map((node) =>
    `<button type="button" class="mega-cat-rail-item" role="tab" id="mega-rail-${node.id}" data-category-id="${node.id}"
      onmouseenter="megaScheduleActivate(${node.id})"
      onfocus="megaScheduleActivate(${node.id})"
      onclick="megaActivateMain(${node.id});megaShowPanel()">
      <span>${escapeHtml(node.name)}</span>
      <i class="fas fa-chevron-left mcr-arrow"></i>
    </button>`,
  ).join("");

  window.megaScheduleActivate = (categoryId: number) => {
    window.clearTimeout(megaHoverTimer);
    megaHoverTimer = window.setTimeout(() => window.megaActivateMain(categoryId), 180);
  };
  window.megaActivateMain = (categoryId: number) => {
    window.clearTimeout(megaHoverTimer);
    document.querySelectorAll(".mega-cat-rail-item").forEach((item) => {
      item.classList.toggle("active", item.getAttribute("data-category-id") === String(categoryId));
    });
    const node = megaCategoryNodes.get(categoryId);
    if (node) renderMegaPanel(node);
  };
  window.megaShowPanel = () => {
    document.getElementById("megaMenu")?.setAttribute("data-mobile-view", "panel");
  };
  window.closeMegaMenu = () => {
    document.getElementById("megaMenu")?.classList.remove("open");
    document.getElementById("megaMenu")?.setAttribute("aria-hidden", "true");
    document.getElementById("megaTrigger")?.setAttribute("aria-expanded", "false");
  };

  window.megaActivateMain(roots[0].id);
}

function LegacyHomeBehaviorInner({ categories }: { categories: Category[] }) {
  const router = useRouter();

  useEffect(() => {
    initializeMegaCategories(categories);

    window.toggleMegaMenu = () => {
      const menu = document.getElementById("megaMenu");
      const trigger = document.getElementById("megaTrigger");
      const isOpen = menu?.classList.toggle("open") ?? false;
      menu?.setAttribute("aria-hidden", String(!isOpen));
      trigger?.setAttribute("aria-expanded", String(isOpen));
      menu?.setAttribute("data-mobile-view", "rail");
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

    const search = document.getElementById("mainSearch") as HTMLInputElement | null;
    const clearSearch = document.getElementById("clearSearch");
    const mobileSearchQuery = window.matchMedia("(max-width: 768px)");
    const updateSearchPlaceholder = () => {
      if (search) {
        search.placeholder = mobileSearchQuery.matches
          ? "جستجو..."
          : "جستجوی محصول، برند، دسته‌بندی...";
      }
    };
    const openSearch = () => {
      if (search?.value.trim()) window.openSRP(search.value.trim());
    };
    const updateClearSearch = () => {
      if (clearSearch) clearSearch.style.display = search?.value ? "flex" : "none";
    };
    const clearSearchValue = () => {
      if (search) {
        search.value = "";
        updateClearSearch();
        search.focus();
      }
    };
    const onSearchKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") openSearch();
    };
    search?.addEventListener("input", updateClearSearch);
    search?.addEventListener("keydown", onSearchKeyDown);
    clearSearch?.addEventListener("click", clearSearchValue);
    mobileSearchQuery.addEventListener("change", updateSearchPlaceholder);
    updateSearchPlaceholder();
    updateClearSearch();

    /* --------------------
       Search results (SRP)
       -------------------- */

    const state: SrpState = {
      products: [],
      loaded: false,
      loading: false,
      query: "",
      category: "",
      mode: "all",
      sort: "relevant",
      rating: 0,
      priceMin: 0,
      priceMax: 0,
      catalogMaxPrice: 0,
      brands: new Set(),
      colors: new Set(),
      wishlist: [],
      observer: null,
      client: null,
      trigger: null,
    };

    async function getClient() {
      state.client ??= await createSupabaseBrowserClient();
      return state.client;
    }

    async function updateHeaderUser(client: SupabaseClient<Database>) {
      const nameElement = document.querySelector<HTMLElement>(
        ".header-actions .h-user-btn span",
      );
      if (!nameElement) return;

      try {
        const {
          data: { user },
          error: authError,
        } = await client.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          nameElement.textContent = "حساب کاربری";
          return;
        }

        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("name")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) {
          console.error("Could not load the signed-in user's profile name:", profileError);
        }

        const metadataName =
          typeof user.user_metadata.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata.name === "string"
              ? user.user_metadata.name
              : "";
        nameElement.textContent =
          profile?.name?.trim() ||
          metadataName.trim() ||
          user.email?.split("@")[0] ||
          "حساب کاربری";
      } catch (error) {
        console.error("Could not load the signed-in user's header name:", error);
      }
    }

    let authSubscription: { unsubscribe: () => void } | undefined;
    let disposed = false;
    void getClient()
      .then((client) => {
        if (disposed) return;
        void updateHeaderUser(client);
        const { data } = client.auth.onAuthStateChange(() => {
          window.setTimeout(() => {
            if (!disposed) void updateHeaderUser(client);
          }, 0);
        });
        authSubscription = data.subscription;
      })
      .catch((error: unknown) => {
        console.error("Could not subscribe to storefront auth changes:", error);
      });

    async function loadCatalog() {
      if (state.loaded || state.loading) return state.products;
      state.loading = true;
      try {
        const client = await getClient();
        const { data, error } = await client
          .from("products")
          .select("*, product_images(url, is_primary, sort_order), product_variants(price, discount, stock, is_active, color_name, color_code, size, image_url)")
          .eq("is_active", true)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(SRP_LOAD_LIMIT);
        if (error) throw error;
        state.products = (data ?? []) as unknown as StorefrontProduct[];
        state.loaded = true;
      } catch (error) {
        console.error("Could not load the storefront catalog:", error);
        state.products = [];
        showToast("کاتالوگ محصولات بارگذاری نشد. اتصال سوپابیس را بررسی کنید.");
      } finally {
        state.loading = false;
      }
      return state.products;
    }

    async function loadWishlist() {
      try {
        const client = await getClient();
        const {
          data: { user },
          error: authError,
        } = await client.auth.getUser();
        if (authError) throw authError;
        if (!user) return;
        const { data, error } = await client
          .from("profiles")
          .select("wishlist")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        const entries = Array.isArray(data?.wishlist) ? data.wishlist : [];
        state.wishlist = entries.flatMap((entry) => {
          const id = Number(entry && typeof entry === "object" && "id" in entry ? entry.id : entry);
          return Number.isSafeInteger(id) && id > 0 ? [id] : [];
        });
      } catch (error) {
        console.error("Could not load the wishlist:", error);
      }
    }

    function catalogMaxPrice(products: StorefrontProduct[]): number {
      const max = products.reduce(
        (value, product) => Math.max(value, finalPrice(product)),
        0,
      );
      return Math.ceil(max / 100000) * 100000 || 10000000;
    }

    function buildFilterOptions() {
      const brandList = document.getElementById("brandFilterList");
      if (brandList) {
        const counts = new Map<string, number>();
        for (const product of state.products) {
          const brand = product.brand.trim();
          if (!brand) continue;
          counts.set(brand, (counts.get(brand) ?? 0) + 1);
        }
        const brands = [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fa"))
          .slice(0, 30);
        brandList.innerHTML = brands.length
          ? brands
              .map(
                ([brand, count]) => `<label class="brand-check-item">
                  <input type="checkbox" value="${escapeAttr(brand)}" onchange="toggleBrandFilter('${escapeAttr(brand)}', this.checked)"${state.brands.has(brand) ? " checked" : ""}>
                  <span>${escapeHtml(brand)}</span>
                  <small>${count.toLocaleString("fa-IR")}</small>
                </label>`,
              )
              .join("")
          : '<div class="filter-empty-note">برندی یافت نشد</div>';
      }

      const colorGrid = document.getElementById("colorFilterGrid");
      if (colorGrid) {
        const colors = [
          ...new Map(
            state.products
              .flatMap((product) => asColors(product.colors))
              .map((color) => [color.name, color.code || "#ccc"] as const),
          ).entries(),
        ]
          .sort((a, b) => a[0].localeCompare(b[0], "fa"))
          .slice(0, 20);
        colorGrid.innerHTML = colors.length
          ? colors
              .map(
                ([name, code]) => `<button type="button" class="color-swatch-item${state.colors.has(name) ? " active" : ""}" onclick="toggleColorFilter('${escapeAttr(name)}', this)" aria-pressed="${state.colors.has(name)}">
                  <span class="color-swatch-box" style="background:${escapeAttr(code)};"></span>
                  <span class="color-swatch-label">${escapeHtml(name)}</span>
                </button>`,
              )
              .join("")
          : '<div class="filter-empty-note">رنگی یافت نشد</div>';
      }
    }

    function initPriceRange() {
      const minEl = document.getElementById("priceRangeMin") as HTMLInputElement | null;
      const maxEl = document.getElementById("priceRangeMax") as HTMLInputElement | null;
      if (!minEl || !maxEl) return;
      const top = state.catalogMaxPrice;
      minEl.max = String(top);
      maxEl.max = String(top);
      state.priceMin = 0;
      state.priceMax = top;
      minEl.value = "0";
      maxEl.value = String(top);
      updatePriceRangeUI();
    }

    function updatePriceRangeUI() {
      const maxEl = document.getElementById("priceRangeMax") as HTMLInputElement | null;
      const top = Number(maxEl?.max) || 1;
      const minDisplay = document.getElementById("priceMinDisplay");
      const maxDisplay = document.getElementById("priceMaxDisplay");
      const fill = document.getElementById("dualRangeFill");
      if (minDisplay) minDisplay.textContent = (state.priceMin || 0).toLocaleString("fa-IR");
      if (maxDisplay) maxDisplay.textContent = (state.priceMax || top).toLocaleString("fa-IR");
      const minHidden = document.getElementById("priceMin") as HTMLInputElement | null;
      const maxHidden = document.getElementById("priceMax") as HTMLInputElement | null;
      if (minHidden) minHidden.value = String(state.priceMin || 0);
      if (maxHidden) maxHidden.value = String(state.priceMax || top);
      if (fill) {
        fill.style.left = `${(state.priceMin / top) * 100}%`;
        fill.style.right = `${100 - (state.priceMax / top) * 100}%`;
      }
      updateFilterBadges();
    }

    function readCriteria(): SrpCriteria {
      const input = document.getElementById("srpInput") as HTMLInputElement | null;
      const sortSelect = document.getElementById("srpSort") as HTMLSelectElement | null;
      const minEl = document.getElementById("priceRangeMin") as HTMLInputElement | null;
      const maxEl = document.getElementById("priceRangeMax") as HTMLInputElement | null;
      const avail = document.getElementById("fAvail") as HTMLInputElement | null;
      const disc = document.getElementById("fDisc") as HTMLInputElement | null;

      state.query = input?.value.trim() ?? "";
      state.priceMin = Number(minEl?.value ?? 0) || 0;
      state.priceMax = Number(maxEl?.value ?? 0) || state.catalogMaxPrice;
      const sortValue = (sortSelect?.value || "relevant") as SrpSort;
      state.sort = sortValue;

      return {
        query: state.query,
        category: state.category,
        mode: state.mode,
        minPrice: state.priceMin,
        maxPrice: state.priceMax,
        availableOnly: avail?.checked ?? false,
        discountOnly: disc?.checked ?? false,
        minRating: state.rating,
        brands: new Set(state.brands),
        colors: new Set(state.colors),
      };
    }

    function applyFilters() {
      const criteria = readCriteria();
      const results = filterCatalog(state.products, criteria);
      const sorted = sortCatalog(results, criteria.mode, state.sort);
      renderResults(sorted);
    }

    function renderResults(results: StorefrontProduct[]) {
      const titleEl = document.getElementById("srpTitle");
      const countEl = document.getElementById("srpCount");
      const filterCountEl = document.getElementById("filterResultCount");
      const grid = document.getElementById("srpGrid");

      if (titleEl) {
        if (state.mode !== "all") {
          const labels: Record<SrpMode, string> = {
            all: "همه محصولات",
            bestseller: "پرفروش‌ترین‌ها",
            discount: "تخفیفات ویژه",
          };
          titleEl.textContent = labels[state.mode];
        } else if (state.query) {
          titleEl.textContent = `نتایج جستجو برای «${state.query}»`;
        } else if (state.category) {
          titleEl.textContent = `دسته «${state.category}»`;
        } else {
          titleEl.textContent = "همه محصولات";
        }
      }
      if (countEl) {
        countEl.textContent = `${results.length.toLocaleString("fa-IR")} محصول یافت شد`;
      }
      if (filterCountEl) {
        filterCountEl.textContent = results.length.toLocaleString("fa-IR");
      }
      if (!grid) return;

      if (results.length === 0) {
        state.observer?.disconnect();
        state.observer = null;
        const suggestions = sortCatalog(
          state.products.filter((product) => product.stock > 0),
          "all",
          "rating",
        ).slice(0, 4);
        grid.innerHTML = `<div class="srp-empty"><i class="fas fa-search"></i><h3>محصولی یافت نشد</h3><p>کلمه جستجو یا فیلترها را تغییر دهید</p></div>${
          suggestions.length
            ? `<div class="srp-suggestions"><h4><i class="fas fa-lightbulb" style="color:var(--warning)"></i> شاید این موارد را بپسندید</h4><div class="srp-grid" style="grid-column:1/-1;">${suggestions
                .map((product) =>
                  createSrpCard(product, state.wishlist.includes(product.id)),
                )
                .join("")}</div></div>`
            : ""
        }`;
        return;
      }

      renderGridChunked(grid, results);
    }

    function renderGridChunked(
      container: HTMLElement,
      items: StorefrontProduct[],
    ) {
      state.observer?.disconnect();
      state.observer = null;
      container.innerHTML = "";
      let cursor = 0;

      const appendNextChunk = () => {
        const chunk = items.slice(cursor, cursor + SRP_CHUNK_SIZE);
        if (chunk.length === 0) return;
        const fragment = document.createElement("div");
        fragment.innerHTML = chunk
          .map((product) => createSrpCard(product, state.wishlist.includes(product.id)))
          .join("");
        while (fragment.firstChild) container.appendChild(fragment.firstChild);
        cursor += chunk.length;

        container
          .querySelectorAll(".srp-load-sentinel")
          .forEach((sentinel) => sentinel.remove());
        if (cursor < items.length) {
          const sentinel = document.createElement("div");
          sentinel.className = "srp-load-sentinel";
          sentinel.style.cssText = "grid-column:1/-1;height:1px;";
          container.appendChild(sentinel);
          state.observer?.observe(sentinel);
        }
      };

      state.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) appendNextChunk();
          });
        },
        { root: null, rootMargin: "600px 0px", threshold: 0 },
      );

      appendNextChunk();
    }

    function updateFilterBadges() {
      let count = state.brands.size + state.colors.size;
      const avail = document.getElementById("fAvail") as HTMLInputElement | null;
      const disc = document.getElementById("fDisc") as HTMLInputElement | null;
      if (avail?.checked) count += 1;
      if (disc?.checked) count += 1;
      if (
        state.priceMin > 0 ||
        (state.priceMax > 0 && state.priceMax < state.catalogMaxPrice)
      )
        count += 1;
      if (state.rating > 0) count += 1;

      const badge = document.getElementById("srpFilterChipBadge");
      if (badge) {
        badge.textContent = count.toLocaleString("fa-IR");
        badge.style.display = count > 0 ? "inline-flex" : "none";
      }
      const priceActive =
        state.priceMin > 0 ||
        (state.priceMax > 0 && state.priceMax < state.catalogMaxPrice);
      const chipState: Array<[string, boolean]> = [
        ["price", priceActive],
        ["brand", state.brands.size > 0],
        ["color", state.colors.size > 0],
      ];
      chipState.forEach(([chip, active]) => {
        document
          .querySelector(`.srp-chip[data-chip="${chip}"]`)
          ?.classList.toggle("active", active);
      });
    }

    function resetSrpFilters() {
      const avail = document.getElementById("fAvail") as HTMLInputElement | null;
      const disc = document.getElementById("fDisc") as HTMLInputElement | null;
      if (avail) avail.checked = false;
      if (disc) disc.checked = false;
      state.brands.clear();
      state.colors.clear();
      state.rating = 0;
      document
        .querySelectorAll<HTMLButtonElement>(".star-filter-item")
        .forEach((button) => {
          button.setAttribute(
            "aria-pressed",
            String(Number(button.dataset.rating) === 0),
          );
        });
      buildFilterOptions();
      if (state.catalogMaxPrice > 0) initPriceRange();
      else updateFilterBadges();
    }

    async function openSrp(query = "", category = "", mode = "all") {
      state.query = query;
      state.category = category;
      state.mode = (["all", "bestseller", "discount"].includes(mode)
        ? mode
        : "all") as SrpMode;
      state.sort = state.mode === "bestseller" ? "rating" : "relevant";
      state.trigger = document.activeElement as HTMLElement | null;

      const overlay = document.getElementById("srpOverlay");
      overlay?.classList.add("open");
      document.body.style.overflow = "hidden";
      document.getElementById("megaMenu")?.classList.remove("open");

      const input = document.getElementById("srpInput") as HTMLInputElement | null;
      if (input) {
        input.value = query;
        window.setTimeout(() => input.focus(), 50);
      }

      const sortValue = state.sort;
      const sortSelect = document.getElementById("srpSort") as HTMLSelectElement | null;
      const sortMobile = document.getElementById("srpSortMobile") as HTMLSelectElement | null;
      if (sortSelect) sortSelect.value = sortValue;
      if (sortMobile) sortMobile.value = sortValue;

      resetSrpFilters();

      const products = await loadCatalog();
      if (products.length > 0) {
        state.catalogMaxPrice = catalogMaxPrice(products);
        initPriceRange();
        buildFilterOptions();
      }
      await loadWishlist();
      applyFilters();
    }

    function closeSrp() {
      document.getElementById("srpOverlay")?.classList.remove("open");
      document.getElementById("filterSheetOverlay")?.classList.remove("show");
      document.getElementById("srpFilters")?.classList.remove("open");
      document.body.style.overflow = "";
      state.observer?.disconnect();
      state.observer = null;
      state.trigger?.focus();
      state.trigger = null;
    }

    let srpInputTimer = 0;
    function onSrpInput() {
      window.clearTimeout(srpInputTimer);
      srpInputTimer = window.setTimeout(() => {
        const input = document.getElementById("srpInput") as HTMLInputElement | null;
        state.query = input?.value.trim() ?? "";
        applyFilters();
      }, 180);
    }

    async function toggleWishlist(productId: number, button: HTMLButtonElement) {
      try {
        const client = await getClient();
        const {
          data: { user },
          error: authError,
        } = await client.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          void router.push("/login");
          return;
        }
        const { data, error } = await client
          .from("profiles")
          .select("wishlist")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        const entries = Array.isArray(data?.wishlist) ? data.wishlist : [];
        const index = entries.findIndex((entry) => {
          const id = Number(
            entry && typeof entry === "object" && "id" in entry ? entry.id : entry,
          );
          return id === productId;
        });
        const next =
          index >= 0
            ? entries.filter((_, entryIndex) => entryIndex !== index)
            : [...entries, { id: productId, addedAt: new Date().toISOString() }];
        const { error: saveError } = await client
          .from("profiles")
          .update({ wishlist: next as unknown as Json, updated_at: new Date().toISOString() })
          .eq("id", user.id);
        if (saveError) throw saveError;
        const wished = index < 0;
        if (wished) state.wishlist.push(productId);
        else state.wishlist = state.wishlist.filter((id) => id !== productId);
        button.classList.toggle("active", wished);
        button.querySelector("i")?.setAttribute("class", wished ? "fas fa-heart" : "far fa-heart");
        showToast(wished ? "به لیست علاقه‌مندی اضافه شد" : "از لیست علاقه‌مندی حذف شد");
      } catch (error) {
        console.error("Could not update the wishlist:", error);
        showToast("علاقه‌مندی ذخیره نشد. اتصال سوپابیس را بررسی کنید.");
      }
    }

    async function quickAddToCart(productId: number, button: HTMLButtonElement) {
      if (state.products.length === 0) await loadCatalog();
      const product = state.products.find((item) => item.id === productId);
      if (!product) {
        showToast("محصول یافت نشد");
        return;
      }
      if (product.stock <= 0) {
        showToast("این کالا ناموجود است");
        return;
      }
      const original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال افزودن...';
      try {
        const client = await getClient();
        const {
          data: { user },
          error: authError,
        } = await client.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          void router.push("/login");
          return;
        }
        const [profileResult, liveResult] = await Promise.all([
          client.from("profiles").select("cart").eq("id", user.id).maybeSingle(),
          client
            .from("products")
            .select("id,stock,is_active,status")
            .eq("id", productId)
            .maybeSingle(),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (liveResult.error) throw liveResult.error;
        if (
          !liveResult.data ||
          !liveResult.data.is_active ||
          liveResult.data.status !== "published"
        ) {
          showToast("این محصول دیگر در دسترس نیست.");
          return;
        }
        const cart = Array.isArray(profileResult.data?.cart)
          ? (profileResult.data.cart as Json[])
          : [];
        const color = asColors(product.colors)[0]?.name ?? "مشکی";
        const existing = cart.find((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
          const row = entry as Record<string, Json | undefined>;
          return Number(row.id) === productId && row.color === color;
        });
        const available = liveResult.data.stock;
        if (existing) {
          const row = existing as Record<string, Json | undefined>;
          const qty = Number(row.qty ?? 0);
          if (qty + 1 > available) {
            showToast(`حداکثر ${available} عدد موجود است`);
            return;
          }
          row.qty = qty + 1;
        } else {
          cart.push({ id: productId, qty: 1, color, name: product.name });
        }
        const { error: saveError } = await client
          .from("profiles")
          .update({ cart, updated_at: new Date().toISOString() })
          .eq("id", user.id);
        if (saveError) throw saveError;
        showToast("به سبد خرید اضافه شد");
      } catch (error) {
        console.error("Could not add the product to the cart:", error);
        showToast("افزودن به سبد انجام نشد. اتصال سوپابیس را بررسی کنید.");
      } finally {
        button.disabled = false;
        button.innerHTML = original;
      }
    }

    function handleGridClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      const productLink = target.closest<HTMLAnchorElement>(".srp-card-link");
      if (productLink) {
        event.preventDefault();
        const id = productLink.dataset.productId;
        if (id) void router.push(`/product?id=${encodeURIComponent(id)}`);
        return;
      }
      const wishlistButton = target.closest<HTMLButtonElement>("[data-wishlist-id]");
      if (wishlistButton) {
        event.stopPropagation();
        const id = Number(wishlistButton.dataset.wishlistId);
        if (Number.isSafeInteger(id) && id > 0) void toggleWishlist(id, wishlistButton);
        return;
      }
      const addButton = target.closest<HTMLButtonElement>("[data-add-id]");
      if (addButton) {
        event.stopPropagation();
        if (addButton.disabled) return;
        const id = Number(addButton.dataset.addId);
        if (Number.isSafeInteger(id) && id > 0) void quickAddToCart(id, addButton);
        return;
      }
      const card = target.closest<HTMLElement>("[data-product-id]");
      if (card) {
        const id = card.dataset.productId;
        if (id) void router.push(`/product?id=${encodeURIComponent(id)}`);
      }
    }

    function handleGridKeydown(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as HTMLElement;
      if (target.closest("button, a")) return;
      const card = target.closest<HTMLElement>("[data-product-id]");
      if (!card) return;
      event.preventDefault();
      const id = card.dataset.productId;
      if (id) void router.push(`/product?id=${encodeURIComponent(id)}`);
    }

    window.openSRP = openSrp;
    window.closeSRP = closeSrp;
    window.srpFilter = onSrpInput;
    window.onSrpSortChange = (value) => {
      const sortSelect = document.getElementById("srpSort") as HTMLSelectElement | null;
      const sortMobile = document.getElementById("srpSortMobile") as HTMLSelectElement | null;
      if (sortSelect && sortSelect.value !== value) sortSelect.value = value;
      if (sortMobile && sortMobile.value !== value) sortMobile.value = value;
      applyFilters();
    };
    window.clearSrpFilters = () => {
      resetSrpFilters();
      applyFilters();
    };
    window.onPriceRangeInput = (side) => {
      const minEl = document.getElementById("priceRangeMin") as HTMLInputElement | null;
      const maxEl = document.getElementById("priceRangeMax") as HTMLInputElement | null;
      if (!minEl || !maxEl) return;
      let min = Number(minEl.value) || 0;
      let max = Number(maxEl.value) || 0;
      const gap = Math.max(10000, Math.round((Number(maxEl.max) || 0) * 0.01));
      if (min > max - gap) {
        if (side === "min") {
          min = Math.max(0, max - gap);
          minEl.value = String(min);
        } else {
          max = min + gap;
          maxEl.value = String(max);
        }
      }
      state.priceMin = min;
      state.priceMax = max;
      updatePriceRangeUI();
      applyFilters();
    };
    window.updateFilterBadges = updateFilterBadges;
    window.setSrpRating = (rating) => {
      state.rating = rating;
      document
        .querySelectorAll<HTMLButtonElement>(".star-filter-item")
        .forEach((button) => {
          button.setAttribute(
            "aria-pressed",
            String(Number(button.dataset.rating) === rating),
          );
        });
      applyFilters();
    };
    window.setSrpViewMode = (mode) => {
      const grid = document.getElementById("srpGrid");
      grid?.classList.toggle("list-view", mode === "list");
      const gridButton = document.getElementById("srpViewGridBtn");
      const listButton = document.getElementById("srpViewListBtn");
      gridButton?.classList.toggle("active", mode === "grid");
      listButton?.classList.toggle("active", mode === "list");
      gridButton?.setAttribute("aria-pressed", String(mode === "grid"));
      listButton?.setAttribute("aria-pressed", String(mode === "list"));
      try {
        localStorage.setItem("pnyshop-srp-view", mode);
      } catch {
        // The view still works when browser storage is unavailable.
      }
    };
    try {
      const savedView = localStorage.getItem("pnyshop-srp-view");
      if (savedView === "list" || savedView === "grid") {
        window.setSrpViewMode(savedView);
      }
    } catch {
      // Storage access can be blocked in privacy-focused browsers.
    }
    window.toggleBrandFilter = (brand, checked) => {
      if (checked) state.brands.add(brand);
      else state.brands.delete(brand);
      updateFilterBadges();
      applyFilters();
    };
    window.toggleColorFilter = (color, button) => {
      if (state.colors.has(color)) {
        state.colors.delete(color);
        button.classList.remove("active");
        button.setAttribute("aria-pressed", "false");
      } else {
        state.colors.add(color);
        button.classList.add("active");
        button.setAttribute("aria-pressed", "true");
      }
      updateFilterBadges();
      applyFilters();
    };
    window.openFilterSheet = (section) => {
      document.getElementById("srpFilters")?.classList.add("open");
      document.getElementById("filterSheetOverlay")?.classList.add("show");
      if (section && section !== "all") {
        const panel = document.getElementById("srpFilters");
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
    window.toggleAcc = (element) => {
      element.parentElement?.classList.toggle("open");
    };
    window.copyCouponCode = async (code) => {
      try {
        await navigator.clipboard.writeText(code);
        showToast("کد تخفیف کپی شد");
      } catch (error) {
        console.error("Could not copy coupon code", error);
        showToast("کپی کد تخفیف انجام نشد");
      }
    };

    const grid = document.getElementById("srpGrid");
    grid?.addEventListener("click", handleGridClick);
    grid?.addEventListener("keydown", handleGridKeydown);

    let lastScrollY = window.scrollY;
    let accumulatedScroll = 0;
    let scrollDirection = 0;
    const amazingSection = document.getElementById("amazingSectionRoot");
    const headerCollapseEdge = document
      .getElementById("mainHeader")
      ?.getBoundingClientRect().bottom ?? 0;
    const onScroll = () => {
      const header = document.getElementById("mainHeader");
      const currentY = window.scrollY;
      header?.classList.toggle("scrolled", currentY > 10);
      const direction = Math.sign(currentY - lastScrollY);
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const reachedAmazingSection =
        amazingSection !== null &&
        amazingSection.getBoundingClientRect().top <= headerCollapseEdge;
      if (!isMobile) {
        if (currentY <= 10 || currentY < lastScrollY) {
          header?.classList.remove("header-hidden");
        } else if (currentY > lastScrollY) {
          header?.classList.add("header-hidden");
        }
        accumulatedScroll = 0;
        scrollDirection = 0;
      } else if (currentY <= 10) {
        header?.classList.remove("header-hidden");
        accumulatedScroll = 0;
        scrollDirection = 0;
      } else if (direction > 0 && !reachedAmazingSection) {
        accumulatedScroll = 0;
        scrollDirection = 0;
      } else if (direction !== 0) {
        if (direction !== scrollDirection) accumulatedScroll = 0;
        accumulatedScroll += Math.abs(currentY - lastScrollY);
        scrollDirection = direction;
        if (accumulatedScroll >= (direction > 0 ? 12 : 80)) {
          header?.classList.toggle("header-hidden", direction > 0);
          accumulatedScroll = 0;
        }
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
    initializeAmazingSwiper();
    startAmazingTimer();

    return () => {
      disposed = true;
      authSubscription?.unsubscribe();
      mobileSearchQuery.removeEventListener("change", updateSearchPlaceholder);
      search?.removeEventListener("input", updateClearSearch);
      search?.removeEventListener("keydown", onSearchKeyDown);
      clearSearch?.removeEventListener("click", clearSearchValue);
      grid?.removeEventListener("click", handleGridClick);
      grid?.removeEventListener("keydown", handleGridKeydown);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onEscape);
      state.observer?.disconnect();
    };
    // The behavior is intentionally installed once; `router` is stable enough
    // for the click handlers and is not needed as an effect dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function LegacyHomeBehavior({ categories }: { categories: Category[] }) {
  return (
    <>
      <LegacyHomeBehaviorInner categories={categories} />
      <Script
        src="https://cdn.jsdelivr.net/npm/swiper@10/swiper-bundle.min.js"
        strategy="afterInteractive"
        onReady={() => {
          initializeHero();
          initializeAmazingSwiper();
        }}
        onError={showHero}
      />
    </>
  );
}
