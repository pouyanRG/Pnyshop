import type { Metadata } from "next";
import Link from "next/link";
import type { Json, Order, OrderItem, ProductImage, Profile } from "@/types/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { OrderDetailClient, type OrderDetailItem } from "./order-detail-client";

export const metadata: Metadata = {
  title: "جزئیات سفارش | پنل مدیریت",
};

type OrderWithCustomer = Order & {
  profiles: Pick<Profile, "id" | "name" | "mobile" | "address" | "postal_code"> | null;
};

type Params = Promise<{ id: string }>;

export default async function OrderDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*, profiles(id, name, mobile, address, postal_code)")
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h1>سفارش یافت نشد</h1>
        <p>
          <Link href="/admin/orders">بازگشت به سفارش‌ها</Link>
        </p>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id)
    .order("id", { ascending: true });

  const productIds = (items ?? [])
    .map((item) => item.product_id)
    .filter((productId): productId is number => productId !== null);

  const [productsResult, imagesResult] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("products")
          .select("id, name, slug")
          .in("id", productIds)
      : Promise.resolve({ data: [] as { id: number; name: string; slug: string | null }[] }),
    productIds.length > 0
      ? supabase
          .from("product_images")
          .select("id, product_id, url")
          .in("product_id", productIds)
          .eq("is_primary", true)
          .limit(50)
      : Promise.resolve({ data: [] as ProductImage[] }),
  ]);

  const productById = new Map(
    (productsResult.data ?? []).map((product) => [product.id, product]),
  );
  const primaryImageByProduct = new Map<number, string>();
  for (const image of (imagesResult.data ?? []) as ProductImage[]) {
    if (!primaryImageByProduct.has(image.product_id)) {
      primaryImageByProduct.set(image.product_id, image.url);
    }
  }

  const detailItems: OrderDetailItem[] = (items ?? []).map((item) => {
    const base = item as OrderItem;
    return {
      ...base,
      products: base.product_id ? productById.get(base.product_id) ?? null : null,
      image_url: base.product_id
        ? primaryImageByProduct.get(base.product_id) ?? null
        : null,
      options: base.selected_options as Json,
    };
  });

  return (
    <OrderDetailClient
      order={order as unknown as OrderWithCustomer}
      items={detailItems}
    />
  );
}
