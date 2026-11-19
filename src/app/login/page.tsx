import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthPage } from "./auth-page";

export const metadata: Metadata = {
  title: "ورود یا ساخت حساب | Pnyshop",
  description: "ورود یا ساخت حساب کاربری در Pnyshop",
};

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    redirect?: string | string[];
  }>;
};

function getSafeDestination(requested?: string) {
  if (!requested) return "/";
  try {
    const destination = new URL(requested, "http://pnyshop.invalid");
    if (destination.origin !== "http://pnyshop.invalid") return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") throw error;

  if (user) {
    const params = await searchParams;
    const requested = params.redirect ?? params.next;
    redirect(
      getSafeDestination(Array.isArray(requested) ? requested[0] : requested) as Route,
    );
  }

  return <AuthPage />;
}
