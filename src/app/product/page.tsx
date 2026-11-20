import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Product } from "@/types/database";
import { ProductPage, type ProductPageVariant } from "./product-page";

type Props = {
  searchParams: Promise<{ id?: string | string[] }>;
};

function getProductId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { id: queryId } = await searchParams;
  const id = getProductId(queryId);
  if (!id) return { title: "جزئیات محصول | Pnyshop" };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("products")
    .select("name")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  return { title: data?.name ? `${data.name} | Pnyshop` : "جزئیات محصول | Pnyshop" };
}

export default async function ProductRoute({ searchParams }: Props) {
  const { id: queryId } = await searchParams;
  const id = getProductId(queryId);

  if (!id) {
    return (
      <main className="migration-state" dir="rtl">
        <h1>محصول یافت نشد</h1>
        <p>شناسهٔ محصول معتبر نیست.</p>
        <Link href="/">بازگشت به فروشگاه</Link>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Could not load the product from Supabase:", error);
    return (
      <main className="migration-state" dir="rtl">
        <h1>نمایش محصول موقتاً ممکن نیست</h1>
        <p>اتصال به کاتالوگ سوپابیس در دسترس نیست. لطفاً بعداً دوباره تلاش کنید.</p>
        <Link href="/">بازگشت به فروشگاه</Link>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="migration-state" dir="rtl">
        <h1>محصول یافت نشد</h1>
        <p>این محصول وجود ندارد یا در حال حاضر فعال نیست.</p>
        <Link href="/">بازگشت به فروشگاه</Link>
      </main>
    );
  }

  let related: Product[] = [];
  if (product.category) {
    const relatedResult = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("category", product.category)
      .neq("id", product.id)
      .order("created_at", { ascending: false })
      .limit(4);
    if (relatedResult.error) {
      console.error("Could not load related products:", relatedResult.error);
    } else {
      related = relatedResult.data ?? [];
    }
  }

  let variants: ProductPageVariant[] = [];
  const variantsResult = await supabase
    .from("product_variants")
    .select("color_name, price, discount, is_active")
    .eq("product_id", product.id);
  if (variantsResult.error) {
    console.error("Could not load product variants:", variantsResult.error);
  } else {
    variants = variantsResult.data ?? [];
  }

  return <ProductPage product={product} related={related} variants={variants} />;
}
