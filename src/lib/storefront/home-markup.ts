import type { Category, SiteMedia, SiteSetting } from "@/types/database";
import { productImage, type StorefrontProduct } from "./types";

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
  products: StorefrontProduct[],
  title: string,
): string {
  if (products.length === 0) return "";
  const items = products
    .map((product) => {
      const image = productImage(product);
      return `<a href="/product?id=${product.id}" class="productnav-item">
        <div class="productnav-image-wrapper">${
          image
            ? imageTag(image, product.name, "lazy")
            : '<i class="fas fa-image" aria-hidden="true"></i>'
        }</div>
        <span class="productnav-label">${escapeHtml(product.name)}</span>
      </a>`;
    })
    .join("");
  return `<section class="product-nav-section" aria-label="${escapeAttr(title)}">
    <div class="rs-productnav-cardsshelf">
      <div class="rs-productnav-shelf-wrapper">${items}</div>
    </div>
  </section>`;
}

export function renderAmazingSlides(products: StorefrontProduct[]): string {
  if (products.length === 0) return "";
  const looped = [...products];
  while (looped.length < 12) looped.push(...products);

  return looped
    .map((product) => {
      const finalPrice = Math.round(
        product.price * (1 - product.discount / 100),
      );
      const perInstallment = Math.round(finalPrice / 4);
      const image = productImage(product);
      const codeBadge =
        product.discount > 0
          ? `<span class="amazing-code-badge">کد ${product.discount.toLocaleString("fa-IR")}</span>`
          : "";
      const priceRow =
        product.discount > 0
          ? `<span class="amazing-discount-badge">${product.discount.toLocaleString("fa-IR")}٪</span><span class="amazing-old-price">${product.price.toLocaleString("en-US")}</span>`
          : `<span></span><span></span>`;
      const rating = Number(product.rating ?? 0).toFixed(1);

      return `<div class="swiper-slide">
        <a class="amazing-card" href="/product?id=${product.id}" aria-label="${escapeAttr(product.name)}">
          <div class="amazing-card-img-wrap">
            ${codeBadge}
            ${image ? imageTag(image, product.name, "lazy") : '<i class="fas fa-image" aria-hidden="true"></i>'}
            <div class="amazing-store-badge"><i class="fas fa-star" style="color:#f59e0b;"></i> ${escapeHtml(rating)}</div>
          </div>
          <div class="amazing-card-body">
            <div class="amazing-installment-row">
              <div class="amazing-installment-badge"><b>۴</b><span>قسط</span></div>
              <div class="amazing-installment-price"><b>${perInstallment.toLocaleString("en-US")}</b><span>تومانی</span></div>
            </div>
            <div class="amazing-title">${escapeHtml(product.name)}</div>
            <div class="amazing-store-name"><i class="fas fa-store"></i>pnyshop فروشگاه</div>
            <div class="amazing-price-row">${priceRow}</div>
            <div class="amazing-final-price">${finalPrice.toLocaleString("en-US")} تومان</div>
          </div>
        </a>
      </div>`;
    })
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
