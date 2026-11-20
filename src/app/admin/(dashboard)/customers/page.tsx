import type { Metadata } from "next";
import type { Profile } from "@/types/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { CustomersClient } from "./customers-client";

export const metadata: Metadata = {
  title: "مشتریان | پنل مدیریت",
};

const PAGE_SIZE = 20;

const REVENUE_STATUSES = ["paid", "processing", "shipped", "delivered"];

export type AdminCustomer = Pick<
  Profile,
  "id" | "name" | "mobile" | "wallet" | "points" | "created_at"
> & {
  orderCount: number;
  totalSpent: number;
};

export type CustomerFilters = {
  q: string;
  page: number;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const params = await searchParams;

  const q = readParam(params, "q");
  const pageNumber = Number(readParam(params, "page"));
  const filters: CustomerFilters = {
    q,
    page: Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("profiles")
    .select("id, name, mobile, wallet, points, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  const safeQuery = q.replace(/[,()]/g, " ").trim();
  if (safeQuery) {
    query = query.or(`name.ilike.%${safeQuery}%,mobile.ilike.%${safeQuery}%`);
  }

  const result = await query.range(
    (filters.page - 1) * PAGE_SIZE,
    filters.page * PAGE_SIZE - 1,
  );

  if (result.error) {
    console.error("Could not load admin customers:", result.error);
  }

  const rows = (result.data ?? []) as Pick<
    Profile,
    "id" | "name" | "mobile" | "wallet" | "points" | "created_at"
  >[];

  const stats = new Map<string, { orderCount: number; totalSpent: number }>();
  if (rows.length > 0) {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("user_id, status, total_amount")
      .in(
        "user_id",
        rows.map((row) => row.id),
      );
    if (ordersError) {
      console.error("Could not load customer order stats:", ordersError);
    }
    for (const order of orders ?? []) {
      const entry = stats.get(order.user_id) ?? { orderCount: 0, totalSpent: 0 };
      entry.orderCount += 1;
      if (REVENUE_STATUSES.includes(order.status)) {
        entry.totalSpent += order.total_amount;
      }
      stats.set(order.user_id, entry);
    }
  }

  const customers: AdminCustomer[] = rows.map((row) => ({
    ...row,
    orderCount: stats.get(row.id)?.orderCount ?? 0,
    totalSpent: stats.get(row.id)?.totalSpent ?? 0,
  }));

  return (
    <CustomersClient
      customers={customers}
      total={result.count ?? 0}
      pageSize={PAGE_SIZE}
      filters={filters}
      loadError={Boolean(result.error)}
    />
  );
}
