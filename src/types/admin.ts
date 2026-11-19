import type {
  Brand,
  Category,
  Product,
  ProductImage,
  ProductVariant,
} from "./database";

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

export type { Brand, Category };
