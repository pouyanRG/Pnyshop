import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { CategoriesClient } from "./categories-client";

export const metadata: Metadata = {
  title: "دسته‌بندی‌ها | پنل مدیریت",
};

export default async function CategoriesPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: categories, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) console.error("Could not load categories:", error);

  return (
    <CategoriesClient categories={categories ?? []} loadError={Boolean(error)} />
  );
}
