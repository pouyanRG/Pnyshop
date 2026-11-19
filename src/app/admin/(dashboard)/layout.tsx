import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/require-admin";
import { AdminShell } from "./admin-shell";

export const metadata: Metadata = {
  title: "پنل مدیریت | Pnyshop",
};

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return <AdminShell email={user.email}>{children}</AdminShell>;
}
