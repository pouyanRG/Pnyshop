import type { Json } from "@/types/database";
import { storefrontPricing, type StorefrontProduct } from "./types";
import { renderProductCard } from "./home-markup";

export type SrpMode = "all" | "bestseller" | "discount";
export type SrpSort =
  | "relevant"
  | "cheapest"
  | "expensive"
  | "rating"
  | "newest";

export type SrpCriteria = {
  query: string;
  category: string;
  mode: SrpMode;
  minPrice: number;
  maxPrice: number;
  availableOnly: boolean;
  discountOnly: boolean;
  minRating: number;
  brands: Set<string>;
  colors: Set<string>;
};

export type CatalogColor = { name: string; code?: string };

export function finalPrice(product: StorefrontProduct): number {
  return storefrontPricing(product).finalPrice;
}

export function asColors(value: Json): CatalogColor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const color = item as Record<string, Json | undefined>;
    if (typeof color.name !== "string" || !color.name) return [];
    return [
      {
        name: color.name,
        code: typeof color.code === "string" ? color.code : undefined,
      },
    ];
  });
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function filterCatalog(
  products: StorefrontProduct[],
  criteria: SrpCriteria,
): StorefrontProduct[] {
  const query = normalize(criteria.query);
  const category = normalize(criteria.category);

  const result = products.filter((product) => {
    const price = finalPrice(product);
    if (price < criteria.minPrice) return false;
    if (criteria.maxPrice > 0 && price > criteria.maxPrice) return false;
    if (criteria.availableOnly && product.stock <= 0) return false;
    if (criteria.discountOnly && !storefrontPricing(product).hasDiscount)
      return false;
    if (criteria.minRating > 0 && Number(product.rating ?? 0) < criteria.minRating)
      return false;
    if (criteria.brands.size > 0) {
      const brand = product.brand.trim();
      if (!brand || !criteria.brands.has(brand)) return false;
    }
    if (criteria.colors.size > 0) {
      const names = asColors(product.colors).map((color) => color.name);
      if (!names.some((name) => criteria.colors.has(name))) return false;
    }
    if (criteria.mode === "discount" && !storefrontPricing(product).hasDiscount)
      return false;

    if (category) {
      const productCategory = normalize(product.category);
      if (
        productCategory !== category &&
        !productCategory.includes(category)
      )
        return false;
    }

    if (query) {
      const name = normalize(product.name);
      const brand = normalize(product.brand);
      const productCategory = normalize(product.category);
      if (
        !name.includes(query) &&
        !brand.includes(query) &&
        !productCategory.includes(query)
      )
        return false;
    }

    return true;
  });

  return sortCatalog(result, criteria.mode, "relevant");
}

export function sortCatalog(
  products: StorefrontProduct[],
  mode: SrpMode,
  sort: SrpSort,
): StorefrontProduct[] {
  const result = [...products];

  if (mode === "bestseller" || sort === "rating") {
    result.sort(
      (a, b) =>
        Number(b.rating ?? 0) * 10 +
        b.review_count -
        (Number(a.rating ?? 0) * 10 + a.review_count),
    );
  } else if (sort === "cheapest") {
    result.sort((a, b) => finalPrice(a) - finalPrice(b));
  } else if (sort === "expensive") {
    result.sort((a, b) => finalPrice(b) - finalPrice(a));
  } else if (sort === "newest") {
    result.sort((a, b) => b.id - a.id);
  }

  result.sort((a, b) => {
    if (a.stock === 0 && b.stock > 0) return 1;
    if (a.stock > 0 && b.stock === 0) return -1;
    return 0;
  });

  return result;
}

export function createSrpCard(
  product: StorefrontProduct,
  wished: boolean,
): string {
  return renderProductCard(product, { search: true, wished });
}
