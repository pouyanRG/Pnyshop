"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SITE_MEDIA_PLACEMENTS,
  type SiteMediaInput,
} from "@/types/admin";
import type { SiteMediaPlacement } from "@/types/database";
import { requireAdmin } from "../require-admin";
import { writeAudit } from "../audit";
import {
  asNumber,
  asString,
  hasFieldErrors,
  type FieldErrors,
} from "../validation";

export type SiteMediaResult = {
  ok: boolean;
  message: string;
  fieldErrors?: FieldErrors;
  mediaId?: number;
};

type NormalizedSiteMedia = {
  placement: SiteMediaPlacement;
  image_url: string;
  mobile_image_url: string | null;
  link: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

const PLACEMENTS = new Set<string>(SITE_MEDIA_PLACEMENTS);

function optionalDate(
  value: unknown,
  field: string,
  errors: FieldErrors,
): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    errors[field] = "تاریخ معتبر نیست.";
    return null;
  }
  return parsed.toISOString();
}

function normalize(input: SiteMediaInput): {
  values: NormalizedSiteMedia | null;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};

  const placement = asString(input.placement);
  if (!PLACEMENTS.has(placement)) {
    errors.placement = "جایگاه رسانه معتبر نیست.";
  }

  const imageUrl = asString(input.image_url);
  if (!imageUrl) errors.image_url = "تصویر رسانه الزامی است.";
  else if (imageUrl.length > 1000) errors.image_url = "لینک تصویر حداکثر ۱۰۰۰ حرف است.";

  const sortOrder = asNumber(input.sort_order);
  if (sortOrder === null || !Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.sort_order = "ترتیب نمایش باید عدد صحیح مثبت باشد.";
  }

  const startsAt = optionalDate(input.starts_at, "starts_at", errors);
  const endsAt = optionalDate(input.ends_at, "ends_at", errors);
  if (startsAt && endsAt && endsAt < startsAt) {
    errors.ends_at = "پایان بازهٔ نمایش باید بعد از آغاز باشد.";
  }

  if (asString(input.mobile_image_url).length > 1000) {
    errors.mobile_image_url = "لینک تصویر موبایل حداکثر ۱۰۰۰ حرف است.";
  }
  if (asString(input.link).length > 1000) {
    errors.link = "لینک حداکثر ۱۰۰۰ حرف می‌تواند باشد.";
  }
  if (asString(input.title).length > 160) {
    errors.title = "عنوان حداکثر ۱۶۰ حرف می‌تواند باشد.";
  }

  if (hasFieldErrors(errors)) return { values: null, errors };

  return {
    values: {
      placement: placement as SiteMediaPlacement,
      image_url: imageUrl,
      mobile_image_url: asString(input.mobile_image_url) || null,
      link: asString(input.link).slice(0, 1000),
      title: asString(input.title).slice(0, 160),
      sort_order: sortOrder ?? 0,
      is_active: input.is_active,
      starts_at: startsAt,
      ends_at: endsAt,
    },
    errors,
  };
}

function storagePath(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /\/storage\/v1\/object\/(?:public\/)?pnyshop-media\/(.+)$/,
  );
  return match ? match[1] : null;
}

export async function createSiteMedia(
  input: SiteMediaInput,
): Promise<SiteMediaResult> {
  const admin = await requireAdmin();
  const { values, errors } = normalize(input);
  if (!values) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors: errors };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_media")
    .insert(values)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Could not create site media:", error);
    return { ok: false, message: "ذخیرهٔ رسانه انجام نشد." };
  }

  await writeAudit(
    admin,
    "create",
    "site_media",
    `رسانهٔ «${values.title || values.placement}» در جایگاه ${values.placement} ایجاد شد`,
  );
  return {
    ok: true,
    message: "رسانه ذخیره شد.",
    mediaId: data?.id,
  };
}

export async function updateSiteMedia(
  id: number,
  input: SiteMediaInput,
): Promise<SiteMediaResult> {
  const admin = await requireAdmin();
  const { values, errors } = normalize(input);
  if (!values) {
    return { ok: false, message: "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors: errors };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("site_media")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Could not update site media:", error);
    return { ok: false, message: "ذخیرهٔ رسانه انجام نشد." };
  }

  await writeAudit(
    admin,
    "update",
    "site_media",
    `رسانهٔ «${values.title || values.placement}» ویرایش شد`,
  );
  return { ok: true, message: "رسانه ذخیره شد." };
}

export async function toggleSiteMedia(
  id: number,
  isActive: boolean,
): Promise<SiteMediaResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("site_media")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Could not toggle site media:", error);
    return { ok: false, message: "تغییر وضعیت رسانه انجام نشد." };
  }
  await writeAudit(
    admin,
    "update",
    "site_media",
    `وضعیت رسانه با شناسهٔ ${id} به ${isActive ? "فعال" : "غیرفعال"} تغییر کرد`,
  );
  return { ok: true, message: "وضعیت رسانه به‌روزرسانی شد." };
}

export async function deleteSiteMedia(id: number): Promise<SiteMediaResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: media } = await supabase
    .from("site_media")
    .select("title,image_url,mobile_image_url")
    .eq("id", id)
    .maybeSingle();
  if (!media) return { ok: false, message: "رسانه یافت نشد." };

  const { error } = await supabase.from("site_media").delete().eq("id", id);
  if (error) {
    console.error("Could not delete site media:", error);
    return { ok: false, message: "حذف رسانه انجام نشد." };
  }

  const paths = [storagePath(media.image_url), storagePath(media.mobile_image_url)].filter(
    (path): path is string => Boolean(path),
  );
  if (paths.length > 0) {
    const { error: storageError } = await createSupabaseAdminClient().storage
      .from("pnyshop-media")
      .remove(paths);
    if (storageError) {
      console.error("Could not remove site media files:", storageError);
    }
  }

  await writeAudit(admin, "delete", "site_media", `رسانهٔ «${media.title || id}» حذف شد`);
  return { ok: true, message: "رسانه حذف شد." };
}
