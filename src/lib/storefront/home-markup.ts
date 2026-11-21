import type { Category, SiteMedia, SiteSetting } from "@/types/database";
import {
  productImage,
  storefrontPricing,
  type StorefrontProduct,
} from "./types";

export function escapeHtml(value: unknown): string {
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

export function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function imageTag(
  src: string,
  alt: string,
  loading: "eager" | "lazy",
): string {
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="${loading}" onerror="this.onerror=null;this.src='/images/placeholder.svg'">`;
}

export function renderHeroSlides(hero: SiteMedia[]): string {
  return hero
    .map((slide) => {
      const link = slide.link
        ? `<a href="${escapeAttr(slide.link)}">${imageTag(
            slide.image_url,
            slide.title || "اسلاید تبلیغاتی",
            "eager",
          )}</a>`
        : imageTag(
            slide.image_url,
            slide.title || "اسلاید تبلیغاتی",
            "eager",
          );
      const overlay = slide.title
        ? `<div class="slide-overlay"><div class="slide-text"><h2>${escapeHtml(
            slide.title,
          )}</h2></div></div>`
        : "";
      return `<div class="swiper-slide">${link}${overlay}</div>`;
    })
    .join("");
}

export function renderProductStrip(
  mediaItems: SiteMedia[],
): string {
  if (mediaItems.length === 0) return "";
  const items = mediaItems
    .map((item) => {
      const content = `<div class="productnav-image-wrapper">${imageTag(
        item.image_url,
        item.title || "تصویر تزئینی",
        "lazy",
      )}</div>${
        item.title
          ? `<span class="productnav-label">${escapeHtml(item.title)}</span>`
          : ""
      }`;
      return item.link
        ? `<a href="${escapeAttr(item.link)}" class="productnav-item">${content}</a>`
        : `<div class="productnav-item">${content}</div>`;
    })
    .join("");
  return `<section class="product-nav-section" aria-label="نوار تزئینی">
    <div class="rs-productnav-cardsshelf">
      <div class="rs-productnav-shelf-wrapper">${items}</div>
    </div>
  </section>`;
}

export function renderProductCard(
  product: StorefrontProduct,
  options: { search?: boolean; wished?: boolean } = {},
): string {
  const pricing = storefrontPricing(product);
  const image = productImage(product);
  const productUrl = `/product?id=${product.id}`;

  if (options.search) {
    const discountBadge =
      pricing.discount > 0
        ? `<span class="p-discount-badge">${pricing.discount.toLocaleString("fa-IR")}٪</span>`
        : "";
    const ratingValue = Number(product.rating ?? 0);
    const rating =
      ratingValue > 0 && product.review_count > 0
        ? `<span class="p-rating-box"><i class="fas fa-star" aria-hidden="true"></i><span class="p-rating-num">${ratingValue.toFixed(1)}</span></span>`
        : "";
    const wishlist = `<button type="button" class="p-wishlist-btn${options.wished ? " active" : ""}" data-wishlist-id="${product.id}" aria-label="${options.wished ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}" aria-pressed="${Boolean(options.wished)}"><i class="${options.wished ? "fas" : "far"} fa-heart" aria-hidden="true"></i></button>`;
    const stock = product.stock <= 0
      ? '<span class="p-stock stock-out">ناموجود</span>'
      : "";
    const productLink = `<a class="srp-card-link" href="${productUrl}" data-product-id="${product.id}">`;
    const imageContent = image
      ? imageTag(image, product.name, "lazy")
      : '<i class="fas fa-image" aria-hidden="true"></i>';
    const brand = product.brand.trim()
      ? `<div class="p-category"><i class="fas fa-tag" aria-hidden="true"></i>${escapeHtml(product.brand)}</div>`
      : "";
    const pricePrefix = pricing.startsAt ? "از " : "";
    const priceRow = `<div class="p-price-row">${
      pricing.originalPrice !== null
        ? `<span class="p-original">${pricing.originalPrice.toLocaleString("en-US")}</span>`
        : "<span></span>"
    }<span class="p-final">${pricePrefix}${pricing.finalPrice.toLocaleString("en-US")}<small>تومان</small></span></div>`;
    const addToCart = `<button type="button" class="p-add-btn srp-card-add-btn" data-add-id="${product.id}" ${product.stock <= 0 ? "disabled" : ""}><i class="fas fa-shopping-bag" aria-hidden="true"></i>${product.stock <= 0 ? "ناموجود" : "افزودن به سبد خرید"}</button>`;

    return `<article class="p-card srp-product-card" data-product-id="${product.id}">
      <div class="p-img-wrap">
        ${productLink}${imageContent}</a>
        ${discountBadge}
        ${rating}
        ${stock}
        ${wishlist}
      </div>
      <div class="p-body">
        ${brand}
        ${productLink}<span class="p-name">${escapeHtml(product.name)}</span></a>
        ${priceRow}
        ${addToCart}
      </div>
    </article>`;
  }

  const finalPrice = pricing.finalPrice;
  const perInstallment = Math.round(finalPrice / 4);
  const codeBadge =
    pricing.discount > 0
      ? `<span class="amazing-code-badge">${pricing.discount.toLocaleString("fa-IR")}٪ تخفیف</span>`
      : "";
  const priceRow =
    pricing.originalPrice !== null
      ? `<span class="amazing-discount-badge">${pricing.discount.toLocaleString("fa-IR")}٪</span><span class="amazing-old-price">${pricing.originalPrice.toLocaleString("en-US")}</span>`
      : `<span></span><span></span>`;
  const ratingValue = Number(product.rating ?? 0);
  const rating =
    ratingValue > 0 && product.review_count > 0
      ? `<div class="amazing-store-badge"><i class="fas fa-star" style="color:#f59e0b;"></i> ${ratingValue.toFixed(1)}</div>`
      : "";
  const content = `<div class="amazing-card-img-wrap">
      ${codeBadge}
      ${image ? imageTag(image, product.name, "lazy") : '<i class="fas fa-image" aria-hidden="true"></i>'}
      ${rating}
    </div>
    <div class="amazing-card-body">
      <div class="amazing-installment-row" style="backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%)">
        <div class="amazing-installment-badge"><b>۴</b><span>قسط</span></div>
        <div class="amazing-installment-price"><b>${perInstallment.toLocaleString("en-US")}</b><span>تومانی</span></div>
      </div>
      <div class="amazing-title">${escapeHtml(product.name)}</div>
      <div class="amazing-store-name"><i class="fas fa-store"></i>pnyshop فروشگاه</div>
      <div class="amazing-price-row">${priceRow}</div>
      <div class="amazing-final-price">${finalPrice.toLocaleString("en-US")} تومان</div>
    </div>`;

  return `<a class="amazing-card" href="${productUrl}" aria-label="${escapeAttr(product.name)}">${content}</a>`;
}

export function renderAmazingSlides(products: StorefrontProduct[]): string {
  if (products.length === 0) return "";
  return products
    .map(
      (product) =>
        `<div class="swiper-slide">${renderProductCard(product)}</div>`,
    )
    .join("");
}

export function renderCategoryCircles(
  categories: Category[],
  extra: SiteMedia[],
): string {
  const cards = categories
    .map((category) => {
      const image = category.image_url
        ? imageTag(category.image_url, category.name, "lazy")
        : category.icon
          ? `<i class="${escapeAttr(category.icon)}" aria-hidden="true"></i>`
          : '<i class="fas fa-grid" aria-hidden="true"></i>';
      return `<button type="button" class="cat-card" onclick="openSRP('${escapeAttr(category.name)}','')">
        <div class="cat-img-wrap">${image}</div>
        <span class="cat-name">${escapeHtml(category.name)}</span>
      </button>`;
    })
    .join("");

  const extraCards = extra
    .map((media) => {
      const inner = `<div class="cat-img-wrap">${imageTag(
        media.image_url,
        media.title || "پیشنهاد ویژه",
        "lazy",
      )}</div><span class="cat-name">${escapeHtml(
        media.title || "پیشنهاد ویژه",
      )}</span>`;
      return media.link
        ? `<a class="cat-card" style="text-decoration:none" href="${escapeAttr(media.link)}">${inner}</a>`
        : `<button type="button" class="cat-card">${inner}</button>`;
    })
    .join("");

  const all = `${cards}${extraCards}`;
  if (!all) return "";
  return `<section class="section" aria-label="دسته‌بندی‌ها"><div class="cat-grid" id="catGrid">${all}</div></section>`;
}

export function renderSpotlight(media: SiteMedia[]): string {
  if (media.length === 0) return "";
  const cards = media
    .map((item) => {
      const inner = `${imageTag(item.image_url, item.title || "ویترین ویژه", "lazy")}
        <div class="spotlight-overlay">
          ${item.title ? `<div class="spotlight-name">${escapeHtml(item.title)}</div>` : ""}
          ${
            item.link
              ? `<button type="button" class="spotlight-buy-btn" onclick="event.stopPropagation();window.location.href='${escapeAttr(item.link)}'">خرید کن</button>`
              : ""
          }
        </div>`;
      return item.link
        ? `<div class="spotlight-card" role="link" tabindex="0" onclick="window.location.href='${escapeAttr(item.link)}'">${inner}</div>`
        : `<div class="spotlight-card">${inner}</div>`;
    })
    .join("");
  return `<section class="section" aria-label="ویترین ویژه"><div class="spotlight-grid" id="spotlightGrid">${cards}</div></section>`;
}

const BANNER_SLOTS: Array<{
  placement: SiteMedia["placement"];
  className: string;
  fallback: string;
  label: string;
}> = [
  {
    placement: "banner_r1",
    className: "banner-card--r1-small",
    fallback: "/images/banner-card banner-card--r1-small.png",
    label: "بنر ویژه اول",
  },
  {
    placement: "banner_r2",
    className: "banner-card--r1-wide",
    fallback: "/images/banner-card--r1-wide.png",
    label: "بنر ویژه دوم",
  },
  {
    placement: "banner_r3",
    className: "banner-card--r2-wide",
    fallback: "/images/banner-card--r2-wide.png",
    label: "بنر ویژه سوم",
  },
  {
    placement: "banner_r4",
    className: "banner-card--r2-small",
    fallback: "/images/banner-card banner-card--r2-small.png",
    label: "بنر ویژه چهارم",
  },
];

export function renderBanners(banners: SiteMedia[]): string {
  const byPlacement = new Map(banners.map((item) => [item.placement, item]));
  const cards = BANNER_SLOTS.map((slot) => {
    const media = byPlacement.get(slot.placement);
    const image = media?.image_url ?? slot.fallback;
    const label = media?.title || slot.label;
    const href = media?.link ? escapeAttr(media.link) : "#";
    return `<a href="${href}" class="banner-card ${slot.className}" aria-label="${escapeAttr(label)}">
      <img src="${escapeAttr(image)}" alt="${escapeAttr(label)}" loading="lazy" onerror="this.onerror=null;this.src='${slot.fallback}'">
    </a>`;
  }).join("");
  return `<section class="section" aria-label="بنرها"><div class="banners-grid">${cards}</div></section>`;
}

export function renderFooter(settings: SiteSetting): string {
  const socials = [
    { url: settings.instagram_url, icon: "fa-instagram", label: "اینستاگرام" },
    { url: settings.telegram_url, icon: "fa-telegram", label: "تلگرام" },
    { url: settings.twitter_url, icon: "fa-twitter", label: "توییتر" },
    { url: settings.whatsapp_url, icon: "fa-whatsapp", label: "واتساپ" },
    { url: settings.aparat_url, icon: "fa-video", label: "آپارات" },
  ].filter((social) => Boolean(social.url));

  const contacts = [
    { icon: "fa-phone", value: settings.phone },
    { icon: "fa-envelope", value: settings.email },
    { icon: "fa-map-marker-alt", value: settings.address },
  ].filter((contact) => Boolean(contact.value));

  return `<footer class="site-footer" role="contentinfo">
    <div class="footer-grid">
      <div class="footer-col">
        <div class="footer-brand">pnyshop</div>
        <p style="color:var(--text-secondary);font-size:13px;line-height:1.8;margin-bottom:var(--space-2);">${escapeHtml(settings.about_text)}</p>
        <div class="social-row">
          ${socials
            .map(
              (social) =>
                `<a href="${escapeAttr(social.url)}" class="social-btn" aria-label="${escapeAttr(social.label)}" target="_blank" rel="noreferrer"><i class="fab ${escapeAttr(social.icon)}"></i></a>`,
            )
            .join("")}
        </div>
      </div>
      <div class="footer-col">
        <h4>راهنمای خرید</h4>
        <ul>
          <li><i class="fas fa-chevron-left fa-xs"></i> نحوه ثبت سفارش</li>
          <li><i class="fas fa-chevron-left fa-xs"></i> رویه ارسال سفارش</li>
          <li><i class="fas fa-chevron-left fa-xs"></i> شیوه‌های پرداخت</li>
          <li><i class="fas fa-chevron-left fa-xs"></i> پیگیری سفارش</li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>خدمات مشتریان</h4>
        <ul>
          <li><i class="fas fa-chevron-left fa-xs"></i> پرسش‌های متداول</li>
          <li><i class="fas fa-chevron-left fa-xs"></i> رویه بازگشت کالا</li>
          <li><i class="fas fa-chevron-left fa-xs"></i> شرایط استفاده</li>
          <li><i class="fas fa-chevron-left fa-xs"></i> حریم خصوصی</li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>تماس با ما</h4>
        <ul>
          ${contacts
            .map(
              (contact) =>
                `<li><i class="fas ${escapeAttr(contact.icon)}"></i> ${escapeHtml(contact.value)}</li>`,
            )
            .join("")}
        </ul>
      </div>
    </div>
    <div class="footer-bottom">${escapeHtml(settings.copyright_text)}</div>
  </footer>`;
}

export function renderAmazingTitle(title: string): string {
  return `<i class="fas fa-bolt amazing-bolt-icon" aria-hidden="true"></i> ${escapeHtml(title)}`;
}
