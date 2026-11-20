import type { Metadata } from "next";
import type { Order, Profile } from "@/types/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import {
  ORDER_STATUSES,
  type OrderStatus,
} from "@/types/admin";
import { OrdersClient } from "./orders-client";

export const metadata: Metadata = {
  title: "سفارش‌ها | پنل مدیریت",
};

const PAGE_SIZE = 20;

export type AdminOrder = Order & { profiles: Pick<Profile, "id" | "name" | "mobile"> | null };

export type OrderFilters = {
  q: string;
  status: string;
  page: number;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const params = await searchParams;

  const q = readParam(params, "q");
  const status = readParam(params, "status");
  const pageNumber = Number(readParam(params, "page"));
  const filters: OrderFilters = {
    q,
    status,
    page: Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("orders")
    .select("*, profiles(id, name, mobile)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (ORDER_STATUSES.includes(status as OrderStatus)) {
    query = query.eq("status", status as OrderStatus);
  }

  const safeQuery = q.replace(/[,()]/g, " ").trim();
  if (safeQuery) {
    const { data: matches } = await supabase
      .from("profiles")
      .select("id")
      .or(`name.ilike.%${safeQuery}%,mobile.ilike.%${safeQuery}%`)
      .limit(200);
    const ids = (matches ?? []).map((profile) => profile.id);
    query =
      ids.length > 0
        ? query.or(`id.ilike.%${safeQuery}%,user_id.in.(${ids.join(",")})`)
        : query.ilike("id", `%${safeQuery}%`);
  }

  const result = await query.range(
    (filters.page - 1) * PAGE_SIZE,
    filters.page * PAGE_SIZE - 1,
  );

  if (result.error) {
    console.error("Could not load admin orders:", result.error);
  }

  return (
    <OrdersClient
      orders={(result.data ?? []) as unknown as AdminOrder[]}
      total={result.count ?? 0}
      pageSize={PAGE_SIZE}
      filters={filters}
      loadError={Boolean(result.error)}
    />
  );
}
