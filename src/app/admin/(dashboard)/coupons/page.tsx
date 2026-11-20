import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { CouponsClient } from "./coupons-client";

export const metadata: Metadata = {
  title: "کدهای تخفیف | پنل مدیریت",
};

export default async function CouponsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: coupons, error } = await supabase
    .from("coupons")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) console.error("Could not load coupons:", error);

  return (
    <CouponsClient coupons={coupons ?? []} loadError={Boolean(error)} />
  );
}
