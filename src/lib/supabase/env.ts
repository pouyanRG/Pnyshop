export function getSupabaseUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!value) {
    throw new Error("Missing required environment variable: SUPABASE_URL");
  }
  return value;
}

export function getSupabasePublishableKey(): string {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!value) {
    throw new Error(
      "Missing required environment variable: SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return value;
}

export function getSupabaseSecretKey(): string {
  const value = process.env.SUPABASE_SECRET_KEY;
  if (!value) {
    throw new Error("Missing required environment variable: SUPABASE_SECRET_KEY");
  }
  return value;
}
