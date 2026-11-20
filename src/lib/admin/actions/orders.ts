"use server";

import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus,
} from "@/types/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "../require-admin";
import { writeAudit } from "../audit";

export type OrderResult = {
  ok: boolean;
  message: string;
};

function labelOf(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

/** Maps trigger exceptions raised by the orders table to Persian messages. */
function friendlyError(message: string): string {
  if (message.includes("Insufficient stock"))
    return "موجودی کالای سفارش کافی نیست؛ ابتدا موجودی را بررسی کنید.";
  if (message.includes("usage limit"))
    return "محدودیت استفاده از کد تخفیف این سفارش به پایان رسیده است.";
  if (message.includes("no longer exists"))
    return "کد تخفیف این سفارش دیگر در سیستم وجود ندارد.";
  if (message.includes("Only pending orders"))
    return "فقط سفارش‌های در انتظار پرداخت قابل نهایی‌سازی هستند.";
  return "تغییر وضعیت سفارش انجام نشد.";
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<OrderResult> {
  const admin = await requireAdmin();

  if (!ORDER_STATUSES.includes(status)) {
    return { ok: false, message: "وضعیت انتخاب‌شده معتبر نیست." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, delivered_at")
    .eq("id", id)
    .maybeSingle();
  if (!order) return { ok: false, message: "سفارش یافت نشد." };
  if (order.status === status) {
    return { ok: true, message: "وضعیت سفارش بدون تغییر بود." };
  }

  const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(status)) {
    return {
      ok: false,
      message: `تغییر وضعیت از «${labelOf(order.status)}» به «${labelOf(status)}» مجاز نیست.`,
    };
  }

  const patch: {
    status: OrderStatus;
    updated_at: string;
    delivered_at: string | null;
  } = {
    status,
    updated_at: new Date().toISOString(),
    delivered_at:
      status === "delivered" ? (order.delivered_at ?? new Date().toISOString()) : null,
  };

  const { error } = await supabase.from("orders").update(patch).eq("id", id);
  if (error) {
    console.error("Could not update order status:", error);
    return { ok: false, message: friendlyError(error.message) };
  }

  await writeAudit(
    admin,
    "update",
    "order",
    `وضعیت سفارش ${id} از «${labelOf(order.status)}» به «${labelOf(status)}» تغییر کرد`,
  );
  return { ok: true, message: `وضعیت سفارش به «${labelOf(status)}» تغییر کرد.` };
}
