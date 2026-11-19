export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Profile = {
  id: string;
  name: string;
  mobile: string | null;
  melli: string | null;
  address: string | null;
  postal_code: string | null;
  email_verified_at: string | null;
  wallet: number;
  points: number;
  cart: Json;
  wishlist: Json;
  created_at: string;
  updated_at: string;
};

export type ProductStatus = "draft" | "published";

export type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  discount: number;
  category: string;
  brand: string;
  image_url: string | null;
  gallery: Json;
  colors: Json;
  specifications: Json;
  rating: number | null;
  review_count: number;
  is_hot: boolean;
  is_active: boolean;
  slug: string | null;
  brand_id: number | null;
  category_id: number | null;
  warranty: string;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
};

export type Brand = {
  id: number;
  name: string;
  slug: string;
  description: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  image_url: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
  spec_template: Json;
  created_at: string;
  updated_at: string;
};

export type ProductImage = {
  id: number;
  product_id: number;
  url: string;
  alt: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
};

export type ProductVariant = {
  id: string;
  product_id: number;
  sku: string;
  color_name: string;
  color_code: string;
  size: string;
  price: number;
  discount: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SiteMediaPlacement =
  | "hero"
  | "banner_r1"
  | "banner_r2"
  | "banner_r3"
  | "banner_r4"
  | "spotlight"
  | "category_circle"
  | "product_strip"
  | "amazing_timer"
  | "other";

export type SiteMedia = {
  id: number;
  placement: SiteMediaPlacement;
  image_url: string;
  mobile_image_url: string | null;
  link: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SiteSetting = {
  id: number;
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
  updated_at: string;
};

export type Coupon = {
  id: string;
  code: string;
  title: string;
  icon_url: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  minimum_amount: number;
  maximum_discount: number | null;
  usage_limit: number | null;
  used_count: number;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  audience: string;
  audience_days: number | null;
  scope: string;
  scope_category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  user_id: string;
  idempotency_key: string;
  status:
    | "pending_payment"
    | "paid"
    | "processing"
    | "shipped"
    | "delivered"
    | "failed_payment";
  total_amount: number;
  shipping_method: string;
  shipping_cost: number;
  shipping_address: string;
  postal_code: string;
  coupon_code: string | null;
  coupon_discount_amount: number;
  payment_gateway: string | null;
  transaction_id: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: number | null;
  variant_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  selected_options: Json;
};

export type AuditLog = {
  id: string;
  admin_id: string | null;
  admin_email: string;
  action: string;
  entity_type: string;
  description: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        Partial<Profile> & Pick<Profile, "id">,
        Partial<Profile>
      >;
      user_roles: Table<
        { user_id: string; role: "admin"; created_at: string },
        { user_id: string; role: "admin"; created_at?: string },
        never
      >;
      products: Table<
        Product,
        Partial<Product> & Pick<Product, "name" | "price">,
        Partial<Product>
      >;
      brands: Table<
        Brand,
        Partial<Brand> & Pick<Brand, "name" | "slug">,
        Partial<Brand>
      >;
      categories: Table<
        Category,
        Partial<Category> & Pick<Category, "name" | "slug">,
        Partial<Category>
      >;
      product_images: Table<
        ProductImage,
        Partial<ProductImage> & Pick<ProductImage, "product_id" | "url">,
        Partial<ProductImage>
      >;
      product_variants: Table<
        ProductVariant,
        Partial<ProductVariant> &
          Pick<ProductVariant, "product_id" | "price">,
        Partial<ProductVariant>
      >;
      site_media: Table<
        SiteMedia,
        Partial<SiteMedia> &
          Pick<SiteMedia, "placement" | "image_url">,
        Partial<SiteMedia>
      >;
      site_settings: Table<
        SiteSetting,
        Partial<SiteSetting> & Pick<SiteSetting, "id">,
        Partial<SiteSetting>
      >;
      coupons: Table<
        Coupon,
        Partial<Coupon> &
          Pick<Coupon, "code" | "discount_type" | "discount_value">,
        Partial<Coupon>
      >;
      orders: Table<
        Order,
        Partial<Order> &
          Pick<Order, "user_id" | "total_amount" | "idempotency_key">,
        Partial<Order>
      >;
      order_items: Table<
        OrderItem,
        Partial<OrderItem> &
          Pick<OrderItem, "order_id" | "product_name" | "quantity" | "unit_price">,
        Partial<OrderItem>
      >;
      store_settings: Table<
        { key: string; value: Json; updated_at: string },
        { key: string; value?: Json; updated_at?: string },
        Partial<{ value: Json; updated_at: string }>
      >;
      audit_logs: Table<
        {
          id: string;
          admin_id: string | null;
          admin_email: string;
          action: string;
          entity_type: string;
          description: string;
          created_at: string;
        },
        {
          admin_id?: string | null;
          admin_email?: string;
          action: string;
          entity_type: string;
          description: string;
        },
        never
      >;
      email_otps: Table<
        {
          user_id: string;
          email: string;
          code_hash: string;
          expires_at: string;
          attempts: number;
          last_sent_at: string;
          created_at: string;
        },
        never,
        never
      >;
      api_rate_limits: Table<
        { rate_key: string; window_started_at: string; request_count: number },
        never,
        never
      >;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      create_checkout_order: {
        Args: {
          p_idempotency_key: string;
          p_shipping_method: string;
          p_shipping_address: string;
          p_postal_code: string;
          p_coupon_code: string | null;
          p_items: Json;
        };
        Returns: string;
      };
      ensure_current_user_profile: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      consume_api_rate_limit: {
        Args: {
          p_rate_key: string;
          p_window_seconds: number;
          p_max_requests: number;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
