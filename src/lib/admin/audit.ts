import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminUser } from "./session";

export async function writeAudit(
  admin: AdminUser,
  action: "create" | "update" | "delete",
  entityType: string,
  description: string,
) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.from("audit_logs").insert({
      admin_id: admin.id,
      admin_email: admin.email,
      action,
      entity_type: entityType,
      description,
    });
  } catch (error) {
    console.error("Could not write admin audit log:", error);
  }
}
