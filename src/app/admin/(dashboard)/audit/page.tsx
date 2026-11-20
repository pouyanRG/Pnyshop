import type { Metadata } from "next";
import type { AuditLog } from "@/types/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { AUDIT_ACTIONS, type AuditAction } from "@/types/admin";
import { AuditClient } from "./audit-client";

export const metadata: Metadata = {
  title: "گزارش فعالیت | پنل مدیریت",
};

const PAGE_SIZE = 20;

export type AuditFilters = {
  q: string;
  entity: string;
  action: string;
  page: number;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const params = await searchParams;

  const q = readParam(params, "q");
  const entity = readParam(params, "entity");
  const action = readParam(params, "action");
  const pageNumber = Number(readParam(params, "page"));
  const filters: AuditFilters = {
    q,
    entity,
    action,
    page: Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (AUDIT_ACTIONS.includes(action as AuditAction)) {
    query = query.eq("action", action as AuditAction);
  }

  const safeEntity = entity.replace(/[,()]/g, " ").trim();
  if (safeEntity) {
    query = query.eq("entity_type", safeEntity);
  }

  const safeQuery = q.replace(/[,()]/g, " ").trim();
  if (safeQuery) {
    query = query.or(`description.ilike.%${safeQuery}%,admin_email.ilike.%${safeQuery}%`);
  }

  const result = await query.range(
    (filters.page - 1) * PAGE_SIZE,
    filters.page * PAGE_SIZE - 1,
  );

  if (result.error) {
    console.error("Could not load admin audit logs:", result.error);
  }

  return (
    <AuditClient
      logs={(result.data ?? []) as AuditLog[]}
      total={result.count ?? 0}
      pageSize={PAGE_SIZE}
      filters={filters}
      loadError={Boolean(result.error)}
    />
  );
}
