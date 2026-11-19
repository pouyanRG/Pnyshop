import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Product } from "@/types/database";
import { CartPage } from "./cart-page";

export const metadata: Metadata = {
  title: "سبد خرید | PnySHOP",
  description: "مشاهده و مدیریت سبد خرید",
};

export default async function CartRoute() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login?next=%2Fcart");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("cart")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Could not load the signed-in user's cart:", profileError);
    return <CartPage initialCart={[]} products={[]} loadError />;
  }

  const cart = Array.isArray(profile?.cart) ? profile.cart : [];
  const ids = [...new Set(cart.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || !("id" in item)) return [];
    const id = String(item.id ?? "");
    return /^\d+$/.test(id) ? [id] : [];
  }))];

  let products: Product[] = [];
  if (ids.length > 0) {
    const { data, error } = await supabase.from("products")
      .select("*")
      .in("id", ids)
      .eq("is_active", true);
    if (error) {
      console.error("Could not load cart catalog items:", error);
      return <CartPage initialCart={cart} products={[]} loadError />;
    }
    products = data ?? [];
  }

  return <CartPage initialCart={cart} products={products} />;
}
