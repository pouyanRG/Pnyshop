import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminUser = {
  id: string;
  email: string;
};

export type AdminCheck =
  | { user: AdminUser }
  | { error: "unauthenticated" | "forbidden" | "mfa" };

/**
 * Server-side guard shared by the admin layout and admin API routes.
 * Requires a signed-in user, the `admin` role, an `aal2` session and a
 * successful `is_admin()` RPC call.
 */
export async function checkAdminUser(): Promise<AdminCheck> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw authError;
  }
  if (!user) return { error: "unauthenticated" };

  const { data: userRoles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (roleError) throw roleError;
  if (!userRoles.some(({ role }) => role === "admin")) {
    return { error: "forbidden" };
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.currentLevel !== "aal2") return { error: "mfa" };

  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");
  if (rpcError) throw rpcError;
  if (!isAdmin) return { error: "forbidden" };

  return { user: { id: user.id, email: user.email ?? "" } };
}
