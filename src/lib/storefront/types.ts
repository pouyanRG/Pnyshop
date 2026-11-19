import type { Product, ProductImage } from "@/types/database";

export type StorefrontProductImage = Pick<
  ProductImage,
  "url" | "is_primary" | "sort_order"
>;

export type StorefrontProduct = Product & {
  product_images: StorefrontProductImage[];
};

/** Primary gallery image when one exists, otherwise the legacy image_url. */
export function productImage(product: StorefrontProduct): string | null {
  const images = Array.isArray(product.product_images)
    ? product.product_images
    : [];
  const primary = images.find((image) => image.is_primary) ?? images[0];
  return primary?.url ?? product.image_url ?? null;
}
