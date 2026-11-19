import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { MediaClient } from "./media-client";

export const metadata: Metadata = {
  title: "تصاویر و ظاهر سایت | پنل مدیریت",
};

export default async function MediaPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [settingsResult, mediaResult] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("site_media")
      .select("*")
      .order("placement", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (settingsResult.error) {
    console.error("Could not load site settings:", settingsResult.error);
  }
  if (mediaResult.error) {
    console.error("Could not load site media:", mediaResult.error);
  }

  return (
    <MediaClient
      settings={settingsResult.data ?? null}
      media={mediaResult.data ?? []}
      loadError={Boolean(settingsResult.error || mediaResult.error)}
    />
  );
}
