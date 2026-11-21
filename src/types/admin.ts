import type {
  Brand,
  Category,
  Coupon,
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

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "failed_payment",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "در انتظار پرداخت",
  paid: "پرداخت‌شده",
  processing: "در حال پردازش",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  failed_payment: "پرداخت ناموفق",
};

/** Statuses an admin may move an order to from each status. */
export const ORDER_STATUS_TRANSITIONS: Record<
  OrderStatus,
  readonly OrderStatus[]
> = {
  pending_payment: ["paid", "failed_payment"],
  paid: ["processing", "shipped", "delivered", "failed_payment"],
  processing: ["shipped", "delivered", "failed_payment"],
  shipped: ["delivered", "failed_payment"],
  delivered: [],
  failed_payment: ["pending_payment"],
};

export type CouponInput = {
  code: string;
  title: string;
  icon_url: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  minimum_amount: number;
  maximum_discount: number | null;
  usage_limit: number | null;
  sort_order: number;
  /** empty string or YYYY-MM-DD */
  starts_at: string;
  /** empty string or YYYY-MM-DD */
  ends_at: string;
  audience: "all" | "newUsers" | "oldUsers";
  audience_days: number | null;
  scope: "all" | "category";
  scope_category: string;
  is_active: boolean;
};

export const AUDIT_ACTIONS = ["create", "update", "delete"] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: "ایجاد",
  update: "ویرایش",
  delete: "حذف",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  brand: "برند",
  category: "دسته‌بندی",
  coupon: "کد تخفیف",
  order: "سفارش",
  product: "محصول",
  media: "رسانه",
  site_media: "رسانهٔ سایت",
  site_settings: "تنظیمات سایت",
};

export type { Brand, Category, Coupon, SiteMedia, SiteSetting };
