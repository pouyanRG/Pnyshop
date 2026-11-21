import type { Product, ProductImage, ProductVariant } from "@/types/database";

export type StorefrontProductImage = Pick<
  ProductImage,
  "url" | "is_primary" | "sort_order"
>;

export type StorefrontProductVariant = Pick<
  ProductVariant,
  | "price"
  | "discount"
  | "stock"
  | "is_active"
  | "color_name"
  | "color_code"
  | "size"
  | "image_url"
>;

export type StorefrontProduct = Product & {
  product_images: StorefrontProductImage[];
  product_variants?: StorefrontProductVariant[];
};

export type StorefrontPricing = {
  finalPrice: number;
  originalPrice: number | null;
  discount: number;
  startsAt: boolean;
  hasDiscount: boolean;
};

export function storefrontPricing(
  product: StorefrontProduct,
): StorefrontPricing {
  const variants = (product.product_variants ?? []).filter(
    (variant) => variant.is_active,
  );

  if (variants.length === 0) {
    return {
      finalPrice: Math.round(product.price * (1 - product.discount / 100)),
      originalPrice: product.discount > 0 ? product.price : null,
      discount: product.discount,
      startsAt: false,
      hasDiscount: product.discount > 0,
    };
  }

  const offers = variants.map((variant) => ({
    finalPrice: Math.round(variant.price * (1 - variant.discount / 100)),
    originalPrice: variant.discount > 0 ? variant.price : null,
    discount: variant.discount,
  }));
  const lowestOffer = offers.reduce((lowest, offer) =>
    offer.finalPrice < lowest.finalPrice ? offer : lowest,
  );

  return {
    ...lowestOffer,
    startsAt: new Set(offers.map((offer) => offer.finalPrice)).size > 1,
    hasDiscount: variants.some((variant) => variant.discount > 0),
  };
}

/** Primary gallery image when one exists, otherwise the legacy image_url. */
export function productImage(product: StorefrontProduct): string | null {
  const images = Array.isArray(product.product_images)
    ? product.product_images
    : [];
  const primary = images.find((image) => image.is_primary) ?? images[0];
  return primary?.url ?? product.image_url ?? null;
}
