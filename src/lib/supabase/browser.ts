"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export async function createSupabaseBrowserClient() {
  const response = await fetch("/api/public-config", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Supabase public configuration could not be loaded");
  }
  const { url, publishableKey } = (await response.json()) as {
    url: string;
    publishableKey: string;
  };
  return createBrowserClient<Database>(url, publishableKey);
}
