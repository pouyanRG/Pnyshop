import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { checkAdminUser } from "@/lib/admin/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_TYPES = [
  { type: "image/jpeg", ext: ".jpg" },
  { type: "image/png", ext: ".png" },
  { type: "image/webp", ext: ".webp" },
  { type: "image/avif", ext: ".avif" },
] as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

async function writeAudit(
  adminId: string,
  adminEmail: string,
  action: "create" | "delete",
  description: string,
) {
  try {
    await createSupabaseAdminClient()
      .from("audit_logs")
      .insert({
        admin_id: adminId,
        admin_email: adminEmail,
        action,
        entity_type: "media",
        description,
      });
  } catch (error) {
    console.error("Could not write media audit log:", error);
  }
}

async function consumeRateLimit(userId: string, key: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("consume_api_rate_limit", {
    p_rate_key: `admin-media-${key}:${userId}`,
    p_window_seconds: 600,
    p_max_requests: 60,
  });
  if (error) return { ok: false as const, error };
  return { ok: data === true, error: null };
}

export async function POST(request: Request) {
  const check = await checkAdminUser();
  if (!("user" in check)) {
    return jsonError(
      check.error === "unauthenticated"
        ? "برای آپلود تصویر باید وارد حساب مدیر شوید."
        : "دسترسی به آپلود تصویر فقط برای مدیر مجاز است.",
      check.error === "unauthenticated" ? 401 : 403,
    );
  }
  const user = check.user;

  const rateLimit = await consumeRateLimit(user.id, "upload");
  if (!rateLimit.ok) {
    return jsonError(
      rateLimit.error
        ? "بررسی محدودیت نرخ انجام نشد."
        : "تعداد درخواست‌های آپلود به حد مجاز رسیده است. کمی بعد دوباره تلاش کنید.",
      rateLimit.error ? 500 : 429,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("بدنهٔ درخواست معتبر نیست.", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("تصویری برای آپلود ارسال نشده است.", 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError("حجم تصویر بیش از ۸ مگابایت مجاز نیست.", 413);
  }

  const extension = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
  const matched =
    ALLOWED_TYPES.find((item) => item.type === file.type) ??
    ALLOWED_TYPES.find((item) => item.ext === extension);
  if (!matched) {
    return jsonError("فقط فرمت‌های JPG، PNG، WebP و AVIF مجاز هستند.", 415);
  }

  const path = `admin/${user.id}/${randomUUID()}${matched.ext}`;
  const admin = createSupabaseAdminClient();
  const { error: uploadError } = await admin.storage
    .from("pnyshop-media")
    .upload(path, file, {
      contentType: matched.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    return jsonError("آپلود تصویر در حافظهٔ سایت ناموفق بود.", 502);
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("pnyshop-media").getPublicUrl(path);

  await writeAudit(user.id, user.email, "create", `تصویر «${file.name}» آپلود شد`);

  return NextResponse.json({ success: true, url: publicUrl, path });
}

export async function DELETE(request: Request) {
  const check = await checkAdminUser();
  if (!("user" in check)) {
    return jsonError(
      check.error === "unauthenticated"
        ? "برای حذف تصویر باید وارد حساب مدیر شوید."
        : "دسترسی به حذف تصویر فقط برای مدیر مجاز است.",
      check.error === "unauthenticated" ? 401 : 403,
    );
  }
  const user = check.user;

  const rateLimit = await consumeRateLimit(user.id, "delete");
  if (!rateLimit.ok) {
    return jsonError(
      rateLimit.error
        ? "بررسی محدودیت نرخ انجام نشد."
        : "تعداد درخواست‌های حذف به حد مجاز رسیده است. کمی بعد دوباره تلاش کنید.",
      rateLimit.error ? 500 : 429,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("بدنهٔ درخواست معتبر نیست.", 400);
  }

  const path = (body as { path?: unknown }).path;
  if (
    typeof path !== "string" ||
    path.includes("..") ||
    !/^(admin|media)\/[\w.-]+\/[\w.-]+$/.test(path)
  ) {
    return jsonError("مسیر تصویر معتبر نیست.", 400);
  }

  const admin = createSupabaseAdminClient();
  const { error: deleteError } = await admin.storage
    .from("pnyshop-media")
    .remove([path]);
  if (deleteError) {
    return jsonError("حذف تصویر از حافظهٔ سایت ناموفق بود.", 502);
  }

  await writeAudit(user.id, user.email, "delete", `تصویر «${path}» حذف شد`);

  return NextResponse.json({ success: true });
}
