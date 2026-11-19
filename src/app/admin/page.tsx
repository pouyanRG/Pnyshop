import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage } from "./admin-page";

export const metadata: Metadata = {
  title: "پنل مدیریت | Pnyshop",
};

export default async function AdminRoute() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login?next=%2Fadmin");

  const { data: userRoles, error: userRolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (userRolesError) throw userRolesError;
  if (!userRoles.some(({ role }) => role === "admin")) {
    // Sending a signed-in non-admin back to /login would loop forever: the
    // login page redirects authenticated users straight back to `next=/admin`.
    redirect("/");
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.currentLevel !== "aal2") {
    redirect("/admin/mfa" as Route);
  }

  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");
  if (roleError) throw roleError;
  if (!isAdmin) redirect("/");

  const [productsResult, couponsResult, ordersResult, auditResult] = await Promise.all([
    supabase.from("products").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("coupons").select("*").order("sort_order", { ascending: true }).limit(100),
    supabase.from("orders").select("id,user_id,status,total_amount,shipping_method,shipping_address,postal_code,coupon_code,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  if (productsResult.error) console.error("Could not load admin products:", productsResult.error);
  if (couponsResult.error) console.error("Could not load admin coupons:", couponsResult.error);
  if (ordersResult.error) console.error("Could not load admin orders:", ordersResult.error);
  if (auditResult.error) console.error("Could not load admin audit log:", auditResult.error);

  return (
    <AdminPage
      email={user.email ?? ""}
      products={productsResult.data ?? []}
      coupons={couponsResult.data ?? []}
      orders={ordersResult.data ?? []}
      auditLogs={auditResult.data ?? []}
      loadError={Boolean(
        productsResult.error ||
        couponsResult.error ||
        ordersResult.error ||
        auditResult.error,
      )}
    />
  );
}
