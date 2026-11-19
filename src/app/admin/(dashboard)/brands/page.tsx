import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { BrandsClient } from "./brands-client";

export const metadata: Metadata = {
  title: "برندها | پنل مدیریت",
};

export default async function BrandsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: brands, error } = await supabase
    .from("brands")
    .select("*")
    .order("id", { ascending: true });

  if (error) console.error("Could not load brands:", error);

  return <BrandsClient brands={brands ?? []} loadError={Boolean(error)} />;
}
