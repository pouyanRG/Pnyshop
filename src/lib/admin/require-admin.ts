import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { checkAdminUser, type AdminUser } from "./session";

export async function requireAdmin(): Promise<AdminUser> {
  const result = await checkAdminUser();

  if ("user" in result) return result.user;
  if (result.error === "unauthenticated") redirect("/login?next=%2Fadmin");
  if (result.error === "mfa") redirect("/admin/mfa" as Route);
  redirect("/");
}
