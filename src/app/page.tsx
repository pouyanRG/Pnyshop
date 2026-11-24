import type { Metadata } from "next";
import { cache } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LegacyHomeBehavior } from "@/components/storefront/legacy-home-behavior";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getHomeData, type HomeData } from "@/lib/storefront/home-data";
import {
  renderAmazingSlides,
  renderAmazingTitle,
  renderBanners,
  renderCategoryCircles,
  renderFooter,
  renderHeroSlides,
  renderProductStrip,
  renderSpotlight,
  escapeAttr,
} from "@/lib/storefront/home-markup";

const getCachedHomeData = cache(async () => getHomeData());

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getCachedHomeData();
  return {
    title: "Pnyshop فروشگاه اینترنتی",
    description:
      settings.about_text.slice(0, 160) || "فروشگاه اینترنتی Pnyshop",
    icons: settings.favicon_url ? { icon: settings.favicon_url } : undefined,
  };
}

async function getLegacyHomeMarkup(): Promise<string> {
  const source = await readFile(path.join(process.cwd(), "index.html"), "utf8");
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (!body) {
    throw new Error("Could not read the legacy storefront body from index.html");
  }
  return body;
}

function replaceOnce(
  source: string,
  pattern: string | RegExp,
  replacement: string,
) {
  return source.replace(pattern, replacement);
}

async function buildHomeMarkup(home: HomeData): Promise<string> {
  const { settings } = home;
  const logoUrl = settings.logo_url || "/images/Pnyshop-img-logo.png";

  let html = await getLegacyHomeMarkup();

  html = html
    .replace(
      /<div class="loading-screen" id="loadingScreen">[\s\S]*?(?=<header class="main-header")/i,
      "",
    )
    .replace(
      /<header class="main-header"[\s\S]*?(?=<main>)/i,
      "",
    )
    .replace(/<nav class="mobile-nav"[\s\S]*?<\/nav>/i, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/href=(["'])index\.html\1/gi, 'href="/"')
    .replace(/href=(["'])profile\.html\1/gi, 'href="/profile"')
    .replace(/href=(["'])login\.html\1/gi, 'href="/login"')
    .replace(/href=(["'])sabad\.html\1/gi, 'href="/cart"')
    .replace(/href=(["'])checkout\.html\1/gi, 'href="/checkout"')
    .replace(/href=(["'])admin\.html\1/gi, 'href="/admin"')
    .replace(/href=(["'])Ai\.html\1/gi, 'href="/ai"');

  /* Decorative product strip (admin-managed media) */
  html = replaceOnce(
    html,
    /<section class="product-nav-section">[\s\S]*?<\/section>/,
    renderProductStrip(home.productStrip),
  );

  /* Category circles */
  html = replaceOnce(
    html,
    /<section class="section" aria-label="دسته‌بندی‌ها">[\s\S]*?<\/section>/,
    renderCategoryCircles(home.categories.slice(0, 12), home.extraCircles),
  );

  /* Spotlight */
  html = replaceOnce(
    html,
    /<section class="section" aria-label="ویترین ویژه">[\s\S]*?<\/section>/,
    renderSpotlight(home.spotlight),
  );

  /* Banners */
  html = replaceOnce(
    html,
    /<section class="section" aria-label="بنرها">[\s\S]*?<\/section>/,
    renderBanners(home.banners),
  );

  /* Footer */
  html = replaceOnce(
    html,
    /<footer class="site-footer" role="contentinfo">[\s\S]*?<\/footer>/,
    renderFooter(settings),
  );

  /* Amazing offers */
  const amazingSlides = renderAmazingSlides(home.amazingProducts);
  html = replaceOnce(
    html,
    /<div class="ah-right-title">[\s\S]*?<\/div>/,
    `<div class="ah-right-title">${renderAmazingTitle(settings.amazing_timer_title)}</div>`,
  );
  html = replaceOnce(
    html,
    'id="dealsScroll"></div>',
    `id="dealsScroll">${amazingSlides}</div>`,
  );
  html = replaceOnce(
    html,
    'id="amazingSkeletonRow"',
    'id="amazingSkeletonRow" style="display:none;"',
  );
  html = replaceOnce(
    html,
    '<div class="swiper amazing-swiper" id="amazingSwiperEl" dir="rtl" hidden>',
    `<div class="swiper amazing-swiper" id="amazingSwiperEl" dir="rtl"${amazingSlides ? "" : " hidden"}>`,
  );
  if (home.amazingProducts.length <= 1) {
    html = replaceOnce(
      html,
      '<div class="swiper-button-next amazing-nav-next"></div>',
      '<div class="swiper-button-next amazing-nav-next" hidden></div>',
    );
    html = replaceOnce(
      html,
      '<div class="swiper-button-prev amazing-nav-prev"></div>',
      '<div class="swiper-button-prev amazing-nav-prev" hidden></div>',
    );
  }
  if (!amazingSlides) {
    html = replaceOnce(
      html,
      'id="amazingEmptyState" style="display:none;"',
      'id="amazingEmptyState"',
    );
  }
  html = replaceOnce(
    html,
    '<section class="section" aria-label="پیشنهادهای شگفت‌انگیز" id="amazingSectionRoot">',
    `<section class="section" aria-label="پیشنهادهای شگفت‌انگیز" id="amazingSectionRoot" data-timer-active="${settings.amazing_timer_is_active ? "true" : "false"}" data-timer-start="${escapeAttr(settings.amazing_timer_starts_at ?? "")}" data-timer-end="${escapeAttr(settings.amazing_timer_ends_at ?? "")}">`,
  );

  /* Hero slider */
  html = replaceOnce(
    html,
    'id="sliderTrack"></div>',
    `id="sliderTrack">${renderHeroSlides(home.hero)}</div>`,
  );
  html = replaceOnce(
    html,
    'id="heroLoadingState"',
    'id="heroLoadingState" style="display:none;"',
  );
  html = replaceOnce(
    html,
    'id="heroSwiperContainer" dir="rtl" style="display:none;"',
    'id="heroSwiperContainer" dir="rtl"',
  );

  /* Logo */
  html = replaceOnce(
    html,
    'src="img/Pnyshop-img-logo.png"',
    `src="${escapeAttr(logoUrl)}"`,
  );

  html = html.replace(/(["'(])\/?img\//g, "$1/images/");

  return html;
}

export default async function HomePage() {
  const home = await getCachedHomeData();
  const markup = await buildHomeMarkup(home);

  return (
    <>
      <StorefrontHeader
        categories={home.categories}
        logoUrl={home.settings.logo_url || "/images/Pnyshop-img-logo.png"}
      />
      <LegacyHomeBehavior />
      <div
        className="legacy-home-page"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </>
  );
}
