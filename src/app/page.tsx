import { readFile } from "node:fs/promises";
import path from "node:path";
import { LegacyHomeBehavior } from "@/components/storefront/legacy-home-behavior";

const heroSlides = [
  {
    image:
      "https://dkstatics-public.digikala.com/digikala-adservice-banners/114974665b95b81ac9f34f5c4541ed103cbeefc6_1781939408.jpg?x-oss-process=image/quality,q_95/format,webp",
  },
  {
    image:
      "https://dkstatics-public.digikala.com/digikala-adservice-banners/9187933a6a5d160c4dd53aa11d2ed21e3864fda1_1781700091.gif?x-oss-process=image?x-oss-process=image/format,webp",
  },
  {
    image:
      "https://dkstatics-public.digikala.com/digikala-adservice-banners/106a9545642ec0528d7bcb59f56625689ccac627_1781703061.jpg?x-oss-process=image/quality,q_95/format,webp",
  },
];

async function getLegacyHomeMarkup() {
  const source = await readFile(path.join(process.cwd(), "index.html"), "utf8");
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (!body) {
    throw new Error("Could not read the legacy storefront body from index.html");
  }

  const trackMarker = 'id="sliderTrack"></div>';
  if (!body.includes(trackMarker)) {
    throw new Error("Could not find the legacy hero slider in index.html");
  }

  const slides = heroSlides
    .map(
      ({ image }) =>
        `<div class="swiper-slide"><img src="${image}" alt="" loading="eager" onerror="this.onerror=null;this.src='/img/banner-card--r1-wide.png'"></div>`,
    )
    .join("");

  return body
    .replace(
      /<div class="loading-screen" id="loadingScreen">[\s\S]*?(?=<header class="main-header")/i,
      "",
    )
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/href=(["'])index\.html\1/gi, 'href="/"')
    .replace(/href=(["'])profile\.html\1/gi, 'href="/profile"')
    .replace(/href=(["'])login\.html\1/gi, 'href="/login"')
    .replace(/href=(["'])sabad\.html\1/gi, 'href="/cart"')
    .replace(/href=(["'])checkout\.html\1/gi, 'href="/checkout"')
    .replace(/href=(["'])admin\.html\1/gi, 'href="/admin"')
    .replace(/href=(["'])Ai\.html\1/gi, 'href="/ai"')
    .replace(trackMarker, `id="sliderTrack">${slides}</div>`)
    .replace(/(["'(])\/?img\//g, "$1/images/")
    .replace('id="heroLoadingState"', 'id="heroLoadingState" style="display:none;"')
    .replace(
      'id="heroSwiperContainer" dir="rtl" style="display:none;"',
      'id="heroSwiperContainer" dir="rtl"',
    )
    .replace('id="amazingSkeletonRow"', 'id="amazingSkeletonRow" style="display:none;"')
    .replace('id="amazingEmptyState" style="display:none;"', 'id="amazingEmptyState"')
    .replace('id="spotlightLoadingState"', 'id="spotlightLoadingState" style="display:none;"')
    .replace(
      'id="spotlightGrid" style="display:none;"></div>',
      'id="spotlightGrid"><div class="spotlight-empty-state"><i class="fas fa-store"></i><div class="se-title">ویترین ویژه فعلاً خالی است</div><div class="se-sub">به‌زودی محصولات منتخب اینجا نمایش داده می‌شوند.</div></div></div>',
    );
}

export default async function HomePage() {
  const markup = await getLegacyHomeMarkup();

  return (
    <>
      <LegacyHomeBehavior />
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
