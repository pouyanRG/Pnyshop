import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { AdminProduct, ProductFilters } from "@/types/admin";
import { ProductsClient } from "./products-client";

export const metadata: Metadata = {
  title: "محصولات | پنل مدیریت",
};

const PAGE_SIZE = 15;

const SORT_OPTIONS: Record<string, [string, boolean]> = {
  newest: ["created_at", false],
  oldest: ["created_at", true],
  price_asc: ["price", true],
  price_desc: ["price", false],
  name: ["name", true],
  stock: ["stock", true],
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function readFilters(searchParams: SearchParams): Promise<ProductFilters> {
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const page = Number(read("page"));
  return {
    q: read("q"),
    category_id: read("category_id"),
    brand_id: read("brand_id"),
    stock: read("stock"),
    status: read("status"),
    sort: SORT_OPTIONS[read("sort")] ? read("sort") : "newest",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const filters = await readFilters(searchParams);
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("products")
    .select(
      "*, product_images(id, url, alt, sort_order, is_primary), product_variants(id, sku, color_name, color_code, size, price, discount, stock, image_url, is_active)",
      { count: "exact" },
    );

  if (filters.q.trim()) {
    query = query.ilike("name", `%${filters.q.trim()}%`);
  }
  if (filters.category_id) {
    query = query.eq("category_id", Number(filters.category_id));
  }
  if (filters.brand_id) {
    query = query.eq("brand_id", Number(filters.brand_id));
  }
  if (filters.stock === "out") {
    query = query.eq("stock", 0);
  } else if (filters.stock === "low") {
    query = query.lte("stock", 5);
  } else if (filters.stock === "in") {
    query = query.gt("stock", 0);
  }
  if (filters.status === "active") {
    query = query.eq("is_active", true);
  } else if (filters.status === "inactive") {
    query = query.eq("is_active", false);
  } else if (filters.status === "draft") {
    query = query.eq("status", "draft");
  } else if (filters.status === "published") {
    query = query.eq("status", "published");
  }

  const [sortColumn, ascending] = SORT_OPTIONS[filters.sort] ?? [
    "created_at",
    false,
  ];
  query = query.order(sortColumn, { ascending });
  query = query.range(
    (filters.page - 1) * PAGE_SIZE,
    filters.page * PAGE_SIZE - 1,
  );

  const [productsResult, categoriesResult, brandsResult] = await Promise.all([
    query,
    supabase.from("categories").select("*").order("sort_order", { ascending: true }),
    supabase.from("brands").select("*").order("name", { ascending: true }),
  ]);

  if (productsResult.error) {
    console.error("Could not load admin products:", productsResult);
  }

  const products = (productsResult.data ?? []) as unknown as AdminProduct[];

  return (
    <ProductsClient
      products={products}
      total={productsResult.count ?? 0}
      pageSize={PAGE_SIZE}
      filters={filters}
      categories={categoriesResult.data ?? []}
      brands={brandsResult.data ?? []}
      loadError={Boolean(productsResult.error)}
    />
  );
}
