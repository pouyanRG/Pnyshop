import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function GET() {
  try {
    return Response.json(
      {
        url: getSupabaseUrl(),
        publishableKey: getSupabasePublishableKey(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Supabase public configuration is unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
