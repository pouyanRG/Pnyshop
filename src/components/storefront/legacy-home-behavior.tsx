"use client";

import Script from "next/script";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
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
  speed?: number;
  allowTouchMove?: boolean;
  autoplay: {
    delay: number;
    disableOnInteraction: boolean;
    pauseOnMouseEnter?: boolean;
  };
  pagination?: { el: string; clickable: boolean };
  navigation?: { nextEl: string; prevEl: string };
  effect?: "fade";
  fadeEffect?: { crossFade: boolean };
  breakpoints?: Record<number, Record<string, unknown>>;
  observer?: boolean;
  observeParents?: boolean;
  on?: {
    init?: () => void;
    setTranslate?: () => void;
    transitionStart?: () => void;
    transitionEnd?: () => void;
    resize?: () => void;
  };
};

declare global {
  interface Window {
    Swiper?: new (selector: string, options: SwiperOptions) => unknown;
    toggleTheme: () => void;
    openSRP?: (query?: string, category?: string, mode?: string) => void;
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

function prepareAmazingSlides(slider: HTMLElement) {
  const wrapper = slider.querySelector<HTMLElement>(".swiper-wrapper");
  if (!wrapper || wrapper.dataset.cloned === "true") return;

  const originals = Array.from(wrapper.children) as HTMLElement[];
  if (originals.length === 0) return;

  const containerWidth = slider.clientWidth || window.innerWidth;
  const slideWidth =
    window.innerWidth >= 1200 ? 232 : window.innerWidth >= 769 ? 218 : 185;
  const minSlides = Math.max(Math.ceil((containerWidth * 3) / slideWidth), 10);

  let i = 0;
  while (wrapper.children.length < minSlides) {
    wrapper.appendChild(originals[i % originals.length].cloneNode(true));
    i += 1;
  }
  wrapper.dataset.cloned = "true";
}

function updateAmazingSlideScales(slider: HTMLElement) {
  const sliderBounds = slider.getBoundingClientRect();
  const sliderStyle = window.getComputedStyle(slider);
  const contentLeft =
    sliderBounds.left + (Number.parseFloat(sliderStyle.paddingLeft) || 0);
  const contentRight =
    sliderBounds.right - (Number.parseFloat(sliderStyle.paddingRight) || 0);
  const contentWidth = contentRight - contentLeft;
  if (contentWidth <= 0) return;

  const slideScales = Array.from(
    slider.querySelectorAll<HTMLElement>(".swiper-slide"),
    (slide) => {
      const bounds = slide.getBoundingClientRect();
      const center = bounds.left + bounds.width / 2;
      const position = Math.min(
        1,
        Math.max(0, (center - contentLeft) / contentWidth),
      );
      const distanceFromEdge = Math.min(position, 1 - position);
      const progress = Math.min(
        1,
        Math.max(0, (distanceFromEdge - 0.18) / 0.1),
      );
      const easedProgress = progress * progress * (3 - 2 * progress);
      return {
        slide,
        scale: (0.86 + easedProgress * 0.14).toFixed(4),
        opacity: (0.82 + easedProgress * 0.18).toFixed(4),
      };
    },
  );

  for (const { slide, scale, opacity } of slideScales) {
    if (slide.style.getPropertyValue("--amazing-slide-scale") !== scale) {
      slide.style.setProperty("--amazing-slide-scale", scale);
    }
    if (slide.style.getPropertyValue("--amazing-slide-opacity") !== opacity) {
      slide.style.setProperty("--amazing-slide-opacity", opacity);
    }
  }
}

function initializeAmazingSwiper() {
  const slider = document.getElementById("amazingSwiperEl");
  if (!slider || !window.Swiper) return;
  if (slider.querySelectorAll(".swiper-slide").length === 0) return;
  if (slider.classList.contains("swiper-initialized")) return;

  prepareAmazingSlides(slider);

  let animationFrame = 0;
  const updateScales = () => updateAmazingSlideScales(slider);
  const animateScales = () => {
    if (!slider.isConnected) {
      animationFrame = 0;
      return;
    }
    updateScales();
    animationFrame = window.requestAnimationFrame(animateScales);
  };
  const startScaleAnimation = () => {
    if (animationFrame === 0) {
      animationFrame = window.requestAnimationFrame(animateScales);
    }
  };
  const stopScaleAnimation = () => {
    if (animationFrame !== 0) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    updateScales();
  };

  new window.Swiper(".amazing-swiper", {
    direction: "horizontal",
    loop: true,
    rtl: true,
    slidesPerView: "auto",
    spaceBetween: 12,
    centeredSlides: true,
    grabCursor: true,
    speed: 800,
    autoplay: { delay: 3000, disableOnInteraction: false, pauseOnMouseEnter: true },
    allowTouchMove: true,
    breakpoints: {
      769: { spaceBetween: 18 },
      1200: { spaceBetween: 20 },
    },
    observer: true,
    observeParents: true,
    on: {
      init: updateScales,
      setTranslate: updateScales,
      transitionStart: startScaleAnimation,
      transitionEnd: stopScaleAnimation,
      resize: updateScales,
    },
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

function LegacyHomeBehaviorInner() {
  const router = useRouter();

  useEffect(() => {
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
      window.dispatchEvent(new Event("pnyshop:close-navigation-menu"));

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
        window.dispatchEvent(new Event("pnyshop:cart-updated"));
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
    const searchParams = new URLSearchParams(window.location.search);
    const initialQuery = searchParams.get("q") ?? "";
    const initialCategory = searchParams.get("category") ?? "";
    const initialMode = searchParams.get("mode") ?? "all";
    if (initialQuery || initialCategory || initialMode !== "all") {
      window.setTimeout(
        () => void openSrp(initialQuery, initialCategory, initialMode),
        0,
      );
    }
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

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.closeSRP();
        window.closeFilterSheet();
        window.dispatchEvent(new Event("pnyshop:close-navigation-menu"));
      }
    };
    document.addEventListener("keydown", onEscape);

    initializeHero();
    initializeAmazingSwiper();
    startAmazingTimer();

    return () => {
      grid?.removeEventListener("click", handleGridClick);
      grid?.removeEventListener("keydown", handleGridKeydown);
      document.removeEventListener("keydown", onEscape);
      state.observer?.disconnect();
    };
    // The behavior is intentionally installed once; `router` is stable enough
    // for the click handlers and is not needed as an effect dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function LegacyHomeBehavior() {
  return (
    <>
      <LegacyHomeBehaviorInner />
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
