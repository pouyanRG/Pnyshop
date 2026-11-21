import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Category,
  SiteMedia,
  SiteSetting,
} from "@/types/database";
import { storefrontPricing, type StorefrontProduct } from "./types";

export type HomeProduct = StorefrontProduct;

export type HomeData = {
  settings: SiteSetting;
  hero: SiteMedia[];
  banners: SiteMedia[];
  spotlight: SiteMedia[];
  categories: Category[];
  extraCircles: SiteMedia[];
  amazingProducts: HomeProduct[];
  productStrip: SiteMedia[];
  loadError: boolean;
};

export const DEFAULT_SITE_SETTINGS: SiteSetting = {
  id: 1,
  logo_url: "/images/Pnyshop-img-logo.png",
  favicon_url: "/images/Glossy-Blue-pnyshop-Logo.png",
  phone: "",
  email: "",
  address: "",
  instagram_url: "",
  telegram_url: "",
  whatsapp_url: "",
  twitter_url: "",
  aparat_url: "",
  about_text:
    "فروشگاه اینترنتی Pnyshop مرجع تخصصی نقد و بررسی و فروش اینترنتی کالا در ایران. با رعایت جدیدترین اصول معماری رابط کاربری.",
  copyright_text: "© ۱۴۰۵ تمامی حقوق این سایت محفوظ می‌باشد.",
  amazing_timer_title: "قسطی شگفت",
  amazing_timer_is_active: true,
  amazing_timer_starts_at: null,
  amazing_timer_ends_at: null,
  product_strip_title: "جدیدترین محصولات",
  product_strip_mode: "newest",
  product_strip_limit: 12,
  updated_at: "",
};

const FALLBACK_HERO: SiteMedia[] = [
  {
    id: -1,
    placement: "hero",
    image_url:
      "https://dkstatics-public.digikala.com/digikala-adservice-banners/114974665b95b81ac9f34f5c4541ed103cbeefc6_1781939408.jpg?x-oss-process=image/quality,q_95/format,webp",
    mobile_image_url: null,
    link: "",
    title: "",
    sort_order: 0,
    is_active: true,
    starts_at: null,
    ends_at: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: -2,
    placement: "hero",
    image_url:
      "https://dkstatics-public.digikala.com/digikala-adservice-banners/9187933a6a5d160c4dd53aa11d2ed21e3864fda1_1781700091.gif?x-oss-process=image?x-oss-process=image/format,webp",
    mobile_image_url: null,
    link: "",
    title: "",
    sort_order: 1,
    is_active: true,
    starts_at: null,
    ends_at: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: -3,
    placement: "hero",
    image_url:
      "https://dkstatics-public.digikala.com/digikala-adservice-banners/106a9545642ec0528d7bcb59f56625689ccac627_1781703061.jpg?x-oss-process=image/quality,q_95/format,webp",
    mobile_image_url: null,
    link: "",
    title: "",
    sort_order: 2,
    is_active: true,
    starts_at: null,
    ends_at: null,
    created_at: "",
    updated_at: "",
  },
];

async function queryAmazingProducts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{ products: HomeProduct[]; error: boolean }> {
  const selection =
    "*, product_images(url, is_primary, sort_order), product_variants(price, discount, stock, is_active, color_name, color_code, size, image_url)";

  const candidateLimit = 120;
  const [discountedProducts, discountedVariants] = await Promise.all([
    supabase
      .from("products")
      .select(selection)
      .eq("is_active", true)
      .eq("status", "published")
      .gt("discount", 0)
      .order("discount", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(candidateLimit),
    supabase
      .from("product_variants")
      .select("product_id, discount")
      .eq("is_active", true)
      .gt("discount", 0)
      .order("discount", { ascending: false })
      .limit(candidateLimit),
  ]);

  if (discountedProducts.error) {
    console.error(
      "Could not load discounted home products:",
      discountedProducts.error,
    );
    return { products: [], error: true };
  }
  if (discountedVariants.error) {
    console.error(
      "Could not load discounted product variants:",
      discountedVariants.error,
    );
    return { products: [], error: true };
  }

  const variantProductIds = [
    ...new Set((discountedVariants.data ?? []).map((variant) => variant.product_id)),
  ];
  let variantProducts: HomeProduct[] = [];

  if (variantProductIds.length > 0) {
    const { data, error } = await supabase
      .from("products")
      .select(selection)
      .eq("is_active", true)
      .eq("status", "published")
      .in("id", variantProductIds);

    if (error) {
      console.error(
        "Could not load products with discounted variants:",
        error,
      );
      return { products: [], error: true };
    }
    variantProducts = (data ?? []) as unknown as HomeProduct[];
  }

  const productsById = new Map<number, HomeProduct>();
  for (const product of [
    ...((discountedProducts.data ?? []) as unknown as HomeProduct[]),
    ...variantProducts,
  ]) {
    productsById.set(product.id, product);
  }

  const products = [...productsById.values()]
    .filter((product) => storefrontPricing(product).hasDiscount)
    .sort((a, b) => {
      const discountDifference =
        storefrontPricing(b).discount - storefrontPricing(a).discount;
      return discountDifference || b.created_at.localeCompare(a.created_at);
    })
    .slice(0, 12);

  return { products, error: false };
}

export async function getHomeData(): Promise<HomeData> {
  const supabase = await createSupabaseServerClient();

  const [settingsResult, mediaResult, categoryResult, amazingResult] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("site_media")
      .select("*")
      .order("placement", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(12),
    queryAmazingProducts(supabase),
  ]);

  if (settingsResult.error) {
    console.error("Could not load site settings:", settingsResult.error);
  }
  if (mediaResult.error) {
    console.error("Could not load site media:", mediaResult.error);
  }
  if (categoryResult.error) {
    console.error("Could not load categories:", categoryResult.error);
  }

  const settings = settingsResult.data ?? DEFAULT_SITE_SETTINGS;
  const media = mediaResult.data ?? [];
  const categories = categoryResult.data ?? [];

  const hero = media.filter((item) => item.placement === "hero");
  const banners = ["banner_r1", "banner_r2", "banner_r3", "banner_r4"].flatMap(
    (placement) =>
      media.filter((item) => item.placement === placement).slice(0, 1),
  );
  const spotlight = media.filter((item) => item.placement === "spotlight");
  const extraCircles = media.filter(
    (item) => item.placement === "category_circle",
  );
  const now = Date.now();
  const productStrip = media.filter(
    (item) =>
      item.placement === "product_strip" &&
      item.is_active &&
      (!item.starts_at || new Date(item.starts_at).getTime() <= now) &&
      (!item.ends_at || new Date(item.ends_at).getTime() >= now),
  );

  return {
    settings,
    hero: hero.length > 0 ? hero : FALLBACK_HERO,
    banners,
    spotlight,
    categories,
    extraCircles,
    amazingProducts: amazingResult.products,
    productStrip,
    loadError: Boolean(
      settingsResult.error ||
        mediaResult.error ||
        categoryResult.error ||
        amazingResult.error,
    ),
  };
}
