import type {
  Brand,
  Category,
  Product,
  ProductImage,
  ProductStripMode,
  ProductVariant,
  SiteMedia,
  SiteMediaPlacement,
  SiteSetting,
} from "./database";

export const SITE_MEDIA_PLACEMENTS = [
  "hero",
  "banner_r1",
  "banner_r2",
  "banner_r3",
  "banner_r4",
  "spotlight",
  "category_circle",
  "product_strip",
  "amazing_timer",
  "other",
] as const satisfies readonly SiteMediaPlacement[];

export const PRODUCT_STRIP_MODES = [
  "newest",
  "bestseller",
  "discount",
] as const satisfies readonly ProductStripMode[];

export type AdminProduct = Product & {
  product_images: ProductImage[];
  product_variants: ProductVariant[];
};

export type ProductFilters = {
  q: string;
  category_id: string;
  brand_id: string;
  stock: string;
  status: string;
  sort: string;
  page: number;
};

export const EMPTY_PRODUCT_FILTERS: ProductFilters = {
  q: "",
  category_id: "",
  brand_id: "",
  stock: "",
  status: "",
  sort: "newest",
  page: 1,
};

export type SiteSettingsInput = {
  logo_url: string | null;
  favicon_url: string | null;
  phone: string;
  email: string;
  address: string;
  instagram_url: string;
  telegram_url: string;
  whatsapp_url: string;
  twitter_url: string;
  aparat_url: string;
  about_text: string;
  copyright_text: string;
  amazing_timer_title: string;
  amazing_timer_is_active: boolean;
  /** empty string or an ISO timestamp */
  amazing_timer_starts_at: string;
  /** empty string or an ISO timestamp */
  amazing_timer_ends_at: string;
  product_strip_title: string;
  product_strip_mode: ProductStripMode;
  product_strip_limit: number;
};

export type SiteMediaInput = {
  placement: SiteMediaPlacement;
  image_url: string | null;
  mobile_image_url: string | null;
  link: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  /** empty string or an ISO timestamp */
  starts_at: string;
  /** empty string or an ISO timestamp */
  ends_at: string;
};

export type { Brand, Category, SiteMedia, SiteSetting };
