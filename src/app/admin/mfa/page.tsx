import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminMfaChallenge } from "./admin-mfa-challenge";

export const metadata: Metadata = {
  title: "تأیید دومرحله‌ای مدیریت | Pnyshop",
};

export default async function AdminMfaPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  // A missing session is expected for anonymous visitors; only real auth
  // failures should surface as errors instead of the login redirect.
  if (authError && authError.name !== "AuthSessionMissingError") throw authError;
  if (!user) redirect("/login?next=%2Fadmin");

  const { data: userRoles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (roleError) throw roleError;
  if (!userRoles.some(({ role }) => role === "admin")) redirect("/");

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.currentLevel === "aal2") redirect("/admin");

  const { data: factors, error: factorsError } =
    await supabase.auth.mfa.listFactors();
  if (factorsError) throw factorsError;

  return (
    <AdminMfaChallenge factorId={factors.totp[0]?.id ?? null} />
  );
}
