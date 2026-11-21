"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  SiteMedia,
  SiteMediaPlacement,
  SiteSetting,
} from "@/types/database";
import {
  PRODUCT_STRIP_MODES,
  SITE_MEDIA_PLACEMENTS,
  type SiteMediaInput,
  type SiteSettingsInput,
} from "@/types/admin";
import { ImageUploader } from "@/components/admin/image-uploader";
import { updateSiteSettings } from "@/lib/admin/actions/site-settings";
import {
  createSiteMedia,
  deleteSiteMedia,
  toggleSiteMedia,
  updateSiteMedia,
} from "@/lib/admin/actions/site-media";
import styles from "./media.module.css";

type MediaFormState = SiteMediaInput & { id?: number };
type Errors = Record<string, string>;

const PLACEMENT_LABELS: Record<SiteMediaPlacement, string> = {
  hero: "اسلایدر اصلی (هیرو)",
  banner_r1: "بنر اول ردیف یک (۱:۱)",
  banner_r2: "بنر دوم ردیف یک (۱:۳)",
  banner_r3: "بنر اول ردیف دو (۱:۳)",
  banner_r4: "بنر دوم ردیف دو (۱:۱)",
  spotlight: "ویترین ویژه",
  category_circle: "دایره‌های دسته",
  product_strip: "نوار محصولات",
  amazing_timer: "تایمر شگفت‌انگیز",
  other: "سایر رسانه‌ها",
};

const STRIP_MODE_LABELS: Record<(typeof PRODUCT_STRIP_MODES)[number], string> = {
  newest: "جدیدترین محصولات",
  bestseller: "پرفروش‌ترین محصولات",
  discount: "محصولات تخفیف‌دار",
};

function settingsToInput(settings: SiteSetting): SiteSettingsInput {
  return {
    logo_url: settings.logo_url,
    favicon_url: settings.favicon_url,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    instagram_url: settings.instagram_url,
    telegram_url: settings.telegram_url,
    whatsapp_url: settings.whatsapp_url,
    twitter_url: settings.twitter_url,
    aparat_url: settings.aparat_url,
    about_text: settings.about_text,
    copyright_text: settings.copyright_text,
    amazing_timer_title: settings.amazing_timer_title,
    amazing_timer_is_active: settings.amazing_timer_is_active,
    amazing_timer_starts_at: toDatetimeLocal(settings.amazing_timer_starts_at),
    amazing_timer_ends_at: toDatetimeLocal(settings.amazing_timer_ends_at),
    product_strip_title: settings.product_strip_title,
    product_strip_mode: settings.product_strip_mode,
    product_strip_limit: settings.product_strip_limit,
  };
}

function emptySettings(): SiteSettingsInput {
  return {
    logo_url: "/images/Pnyshop-img-logo.png",
    favicon_url: "/images/Glossy-Blue-pnyshop-Logo.png",
    phone: "",
    email: "",
    address: "",
    instagram_url: "",
    telegram_url: "",
    whatsapp_url: "",
    twitter_url: "",
    aparat_url: "",
    about_text: "",
    copyright_text: "",
    amazing_timer_title: "قسطی شگفت",
    amazing_timer_is_active: true,
    amazing_timer_starts_at: "",
    amazing_timer_ends_at: "",
    product_strip_title: "جدیدترین محصولات",
    product_strip_mode: "newest",
    product_strip_limit: 12,
  };
}

function emptyMedia(placement: SiteMediaPlacement, sortOrder: number): MediaFormState {
  return {
    placement,
    image_url: null,
    mobile_image_url: null,
    link: "",
    title: "",
    sort_order: sortOrder,
    is_active: true,
    starts_at: "",
    ends_at: "",
  };
}

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function mediaToForm(media: SiteMedia): MediaFormState {
  return {
    id: media.id,
    placement: media.placement,
    image_url: media.image_url,
    mobile_image_url: media.mobile_image_url,
    link: media.link,
    title: media.title,
    sort_order: media.sort_order,
    is_active: media.is_active,
    starts_at: toDatetimeLocal(media.starts_at),
    ends_at: toDatetimeLocal(media.ends_at),
  };
}

export function MediaClient({
  settings: initialSettings,
  media,
  loadError,
}: {
  settings: SiteSetting | null;
  media: SiteMedia[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<SiteSettingsInput>(() =>
    initialSettings ? settingsToInput(initialSettings) : emptySettings(),
  );
  const [mediaForm, setMediaForm] = useState<MediaFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    loadError ? "تنظیمات یا رسانه‌های سایت از پایگاه داده خوانده نشدند." : "",
  );
  const [settingsErrors, setSettingsErrors] = useState<Errors>({});
  const [mediaErrors, setMediaErrors] = useState<Errors>({});

  const grouped = SITE_MEDIA_PLACEMENTS.map((placement) => ({
    placement,
    items: media.filter((item) => item.placement === placement),
  }));

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    setSettingsErrors({});
    const result = await updateSiteSettings({
      ...settings,
      amazing_timer_starts_at: toIso(settings.amazing_timer_starts_at),
      amazing_timer_ends_at: toIso(settings.amazing_timer_ends_at),
    });
    if (result.ok) {
      setNotice(result.message);
      router.refresh();
    } else {
      setNotice(result.message);
      setSettingsErrors(result.fieldErrors ?? {});
    }
    setBusy(false);
  }

  function openCreateMedia(placement: SiteMediaPlacement) {
    const count = media.filter((item) => item.placement === placement).length;
    setMediaForm(emptyMedia(placement, count));
    setMediaErrors({});
    setNotice("");
  }

  function openEditMedia(item: SiteMedia) {
    setMediaForm(mediaToForm(item));
    setMediaErrors({});
    setNotice("");
  }

  async function saveMedia(event: FormEvent) {
    event.preventDefault();
    if (busy || !mediaForm) return;
    setBusy(true);
    setNotice("");
    setMediaErrors({});
    const payload = {
      ...mediaForm,
      starts_at: toIso(mediaForm.starts_at),
      ends_at: toIso(mediaForm.ends_at),
    };
    const result = mediaForm.id
      ? await updateSiteMedia(mediaForm.id, payload)
      : await createSiteMedia(payload);
    if (result.ok) {
      setNotice(result.message);
      setMediaForm(null);
      router.refresh();
    } else {
      setNotice(result.message);
      setMediaErrors(result.fieldErrors ?? {});
    }
    setBusy(false);
  }

  async function toggleMedia(item: SiteMedia) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const result = await toggleSiteMedia(item.id, !item.is_active);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  async function removeMedia(item: SiteMedia) {
    if (busy) return;
    if (!window.confirm(`رسانهٔ «${item.title || item.placement}» حذف شود؟`)) return;
    setBusy(true);
    setNotice("");
    const result = await deleteSiteMedia(item.id);
    setNotice(result.message);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1>تصاویر و ظاهر سایت</h1>
          <p>
            لوگو، اسلایدر، بنرها، ویترین، تایمر شگفت‌انگیز، نوار محصولات و فوتر
            فروشگاه را از این‌جا مدیریت کنید.
          </p>
        </div>
      </header>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      <form className={styles.form} onSubmit={saveSettings} noValidate>
        <h2>تنظیمات عمومی</h2>
        <div className={styles.grid}>
          <div className={styles.field}>
            <span>لوگوی سایت</span>
            <ImageUploader
              label="لوگوی سایت"
              value={settings.logo_url}
              onChange={(url) => setSettings({ ...settings, logo_url: url })}
              maxSizeMB={4}
              compress={{ maxWidth: 800, quality: 0.85 }}
            />
            {settingsErrors.logo_url && (
              <small className={styles.error}>{settingsErrors.logo_url}</small>
            )}
          </div>
          <div className={styles.field}>
            <span>فاوآیکون</span>
            <ImageUploader
              label="فاوآیکون"
              value={settings.favicon_url}
              onChange={(url) => setSettings({ ...settings, favicon_url: url })}
              maxSizeMB={2}
              compress={{ maxWidth: 256, quality: 0.85 }}
            />
            {settingsErrors.favicon_url && (
              <small className={styles.error}>{settingsErrors.favicon_url}</small>
            )}
          </div>
          <label className={styles.field}>
            <span>شمارهٔ تماس</span>
            <input
              value={settings.phone}
              onChange={(event) => setSettings({ ...settings, phone: event.target.value })}
              maxLength={40}
            />
            {settingsErrors.phone && (
              <small className={styles.error}>{settingsErrors.phone}</small>
            )}
          </label>
          <label className={styles.field}>
            <span>ایمیل</span>
            <input
              value={settings.email}
              onChange={(event) => setSettings({ ...settings, email: event.target.value })}
              maxLength={160}
              dir="ltr"
            />
            {settingsErrors.email && (
              <small className={styles.error}>{settingsErrors.email}</small>
            )}
          </label>
          <label className={`${styles.field} ${styles.full}`}>
            <span>آدرس</span>
            <input
              value={settings.address}
              onChange={(event) => setSettings({ ...settings, address: event.target.value })}
              maxLength={400}
            />
            {settingsErrors.address && (
              <small className={styles.error}>{settingsErrors.address}</small>
            )}
          </label>
          <label className={styles.field}>
            <span>لینک اینستاگرام</span>
            <input
              value={settings.instagram_url}
              onChange={(event) =>
                setSettings({ ...settings, instagram_url: event.target.value })
              }
              maxLength={300}
              dir="ltr"
            />
            {settingsErrors.instagram_url && (
              <small className={styles.error}>{settingsErrors.instagram_url}</small>
            )}
          </label>
          <label className={styles.field}>
            <span>لینک تلگرام</span>
            <input
              value={settings.telegram_url}
              onChange={(event) =>
                setSettings({ ...settings, telegram_url: event.target.value })
              }
              maxLength={300}
              dir="ltr"
            />
            {settingsErrors.telegram_url && (
              <small className={styles.error}>{settingsErrors.telegram_url}</small>
            )}
          </label>
          <label className={styles.field}>
            <span>لینک واتساپ</span>
            <input
              value={settings.whatsapp_url}
              onChange={(event) =>
                setSettings({ ...settings, whatsapp_url: event.target.value })
              }
              maxLength={300}
              dir="ltr"
            />
            {settingsErrors.whatsapp_url && (
              <small className={styles.error}>{settingsErrors.whatsapp_url}</small>
            )}
          </label>
          <label className={styles.field}>
            <span>لینک توییتر</span>
            <input
              value={settings.twitter_url}
              onChange={(event) =>
                setSettings({ ...settings, twitter_url: event.target.value })
              }
              maxLength={300}
              dir="ltr"
            />
            {settingsErrors.twitter_url && (
              <small className={styles.error}>{settingsErrors.twitter_url}</small>
            )}
          </label>
          <label className={styles.field}>
            <span>لینک آپارات</span>
            <input
              value={settings.aparat_url}
              onChange={(event) =>
                setSettings({ ...settings, aparat_url: event.target.value })
              }
              maxLength={300}
              dir="ltr"
            />
            {settingsErrors.aparat_url && (
              <small className={styles.error}>{settingsErrors.aparat_url}</small>
            )}
          </label>
          <label className={`${styles.field} ${styles.full}`}>
            <span>متن دربارهٔ فروشگاه (فوتر)</span>
            <textarea
              value={settings.about_text}
              onChange={(event) =>
                setSettings({ ...settings, about_text: event.target.value })
              }
              rows={3}
              maxLength={1000}
            />
            {settingsErrors.about_text && (
              <small className={styles.error}>{settingsErrors.about_text}</small>
            )}
          </label>
          <label className={styles.field}>
            <span>متن کپی‌رایت (فوتر)</span>
            <input
              value={settings.copyright_text}
              onChange={(event) =>
                setSettings({ ...settings, copyright_text: event.target.value })
              }
              maxLength={300}
            />
            {settingsErrors.copyright_text && (
              <small className={styles.error}>{settingsErrors.copyright_text}</small>
            )}
          </label>
        </div>

        <h2>تایمر شگفت‌انگیز</h2>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>عنوان تایمر</span>
            <input
              value={settings.amazing_timer_title}
              onChange={(event) =>
                setSettings({ ...settings, amazing_timer_title: event.target.value })
              }
              maxLength={80}
            />
            {settingsErrors.amazing_timer_title && (
              <small className={styles.error}>
                {settingsErrors.amazing_timer_title}
              </small>
            )}
          </label>
          <label className={`${styles.field} ${styles.inline}`}>
            <input
              type="checkbox"
              checked={settings.amazing_timer_is_active}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  amazing_timer_is_active: event.target.checked,
                })
              }
            />
            <span>تایمر فعال باشد</span>
          </label>
          <label className={styles.field}>
            <span>آغاز بازهٔ نمایش</span>
            <input
              type="datetime-local"
              value={settings.amazing_timer_starts_at}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  amazing_timer_starts_at: event.target.value,
                })
              }
            />
            {settingsErrors.amazing_timer_starts_at && (
              <small className={styles.error}>
                {settingsErrors.amazing_timer_starts_at}
              </small>
            )}
          </label>
          <label className={styles.field}>
            <span>پایان بازهٔ نمایش</span>
            <input
              type="datetime-local"
              value={settings.amazing_timer_ends_at}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  amazing_timer_ends_at: event.target.value,
                })
              }
            />
            {settingsErrors.amazing_timer_ends_at && (
              <small className={styles.error}>
                {settingsErrors.amazing_timer_ends_at}
              </small>
            )}
          </label>
        </div>

        <h2>نوار محصولات</h2>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>عنوان نوار محصولات</span>
            <input
              value={settings.product_strip_title}
              onChange={(event) =>
                setSettings({ ...settings, product_strip_title: event.target.value })
              }
              maxLength={80}
            />
            {settingsErrors.product_strip_title && (
              <small className={styles.error}>
                {settingsErrors.product_strip_title}
              </small>
            )}
          </label>
          <label className={styles.field}>
            <span>معیار انتخاب محصولات</span>
            <select
              value={settings.product_strip_mode}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  product_strip_mode: event.target
                    .value as SiteSettingsInput["product_strip_mode"],
                })
              }
            >
              {PRODUCT_STRIP_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {STRIP_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
            {settingsErrors.product_strip_mode && (
              <small className={styles.error}>
                {settingsErrors.product_strip_mode}
              </small>
            )}
          </label>
          <label className={styles.field}>
            <span>تعداد محصولات (۱ تا ۲۴)</span>
            <input
              type="number"
              min={1}
              max={24}
              value={settings.product_strip_limit}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  product_strip_limit: Number(event.target.value),
                })
              }
            />
            {settingsErrors.product_strip_limit && (
              <small className={styles.error}>
                {settingsErrors.product_strip_limit}
              </small>
            )}
          </label>
        </div>

        <div className={styles.formActions}>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات ظاهر"}
          </button>
        </div>
      </form>

      <section className={styles.sectionHead}>
        <div>
          <h2>رسانه‌های ظاهر سایت</h2>
          <p>تصاویر اسلایدر، بنرها، ویترین و سایر جایگاه‌ها را مدیریت کنید.</p>
        </div>
      </section>

      {mediaForm && (
        <form className={styles.form} onSubmit={saveMedia} noValidate>
          <h2>
            {mediaForm.id
              ? `ویرایش رسانه — ${PLACEMENT_LABELS[mediaForm.placement]}`
              : "رسانهٔ جدید"}
          </h2>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>جایگاه رسانه *</span>
              <select
                value={mediaForm.placement}
                onChange={(event) =>
                  setMediaForm({
                    ...mediaForm,
                    placement: event.target.value as SiteMediaPlacement,
                  })
                }
              >
                {SITE_MEDIA_PLACEMENTS.map((placement) => (
                  <option key={placement} value={placement}>
                    {PLACEMENT_LABELS[placement]}
                  </option>
                ))}
              </select>
              {mediaErrors.placement && (
                <small className={styles.error}>{mediaErrors.placement}</small>
              )}
            </label>
            <label className={styles.field}>
              <span>عنوان</span>
              <input
                value={mediaForm.title}
                onChange={(event) =>
                  setMediaForm({ ...mediaForm, title: event.target.value })
                }
                maxLength={160}
              />
              {mediaErrors.title && (
                <small className={styles.error}>{mediaErrors.title}</small>
              )}
            </label>
            <div className={`${styles.field} ${styles.full}`}>
              <ImageUploader
                label="تصویر رسانه *"
                value={mediaForm.image_url}
                onChange={(url) => setMediaForm({ ...mediaForm, image_url: url })}
                maxSizeMB={5}
                compress={{ maxWidth: 1920, quality: 0.85 }}
              />
              {mediaErrors.image_url && (
                <small className={styles.error}>{mediaErrors.image_url}</small>
              )}
            </div>
            <div className={`${styles.field} ${styles.full}`}>
              <ImageUploader
                label="تصویر موبایل (اختیاری)"
                value={mediaForm.mobile_image_url}
                onChange={(url) =>
                  setMediaForm({ ...mediaForm, mobile_image_url: url })
                }
                maxSizeMB={5}
                compress={{ maxWidth: 1200, quality: 0.85 }}
              />
              {mediaErrors.mobile_image_url && (
                <small className={styles.error}>
                  {mediaErrors.mobile_image_url}
                </small>
              )}
            </div>
            <label className={`${styles.field} ${styles.full}`}>
              <span>لینک</span>
              <input
                value={mediaForm.link}
                onChange={(event) =>
                  setMediaForm({ ...mediaForm, link: event.target.value })
                }
                maxLength={1000}
                dir="ltr"
              />
              {mediaErrors.link && (
                <small className={styles.error}>{mediaErrors.link}</small>
              )}
            </label>
            <label className={styles.field}>
              <span>ترتیب نمایش</span>
              <input
                type="number"
                min={0}
                value={mediaForm.sort_order}
                onChange={(event) =>
                  setMediaForm({
                    ...mediaForm,
                    sort_order: Number(event.target.value),
                  })
                }
              />
              {mediaErrors.sort_order && (
                <small className={styles.error}>{mediaErrors.sort_order}</small>
              )}
            </label>
            <label className={`${styles.field} ${styles.inline}`}>
              <input
                type="checkbox"
                checked={mediaForm.is_active}
                onChange={(event) =>
                  setMediaForm({
                    ...mediaForm,
                    is_active: event.target.checked,
                  })
                }
              />
              <span>رسانه فعال باشد</span>
            </label>
            <label className={styles.field}>
              <span>آغاز نمایش</span>
              <input
                type="datetime-local"
                value={mediaForm.starts_at}
                onChange={(event) =>
                  setMediaForm({ ...mediaForm, starts_at: event.target.value })
                }
              />
              {mediaErrors.starts_at && (
                <small className={styles.error}>{mediaErrors.starts_at}</small>
              )}
            </label>
            <label className={styles.field}>
              <span>پایان نمایش</span>
              <input
                type="datetime-local"
                value={mediaForm.ends_at}
                onChange={(event) =>
                  setMediaForm({ ...mediaForm, ends_at: event.target.value })
                }
              />
              {mediaErrors.ends_at && (
                <small className={styles.error}>{mediaErrors.ends_at}</small>
              )}
            </label>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "در حال ذخیره…" : "ذخیرهٔ رسانه"}
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setMediaForm(null)}
              disabled={busy}
            >
              انصراف
            </button>
          </div>
        </form>
      )}

      {grouped.map(({ placement, items }) => (
        <section key={placement} className={styles.group}>
          <div className={styles.groupHead}>
            <div>
              <h3>{PLACEMENT_LABELS[placement]}</h3>
              <span>
                {items.length.toLocaleString("fa-IR")} مورد — ترتیب نمایش بر
                اساس فیلد «ترتیب نمایش» است.
              </span>
            </div>
            <button
              type="button"
              className={styles.small}
              onClick={() => openCreateMedia(placement)}
              disabled={busy}
            >
              <i className="fas fa-plus" aria-hidden="true" /> افزودن رسانه
            </button>
          </div>

          {items.length === 0 ? (
            <p className={styles.empty}>هنوز رسانه‌ای در این جایگاه ثبت نشده است.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>تصویر</th>
                    <th>عنوان</th>
                    <th>لینک</th>
                    <th>ترتیب</th>
                    <th>وضعیت</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image_url} alt={item.title || item.placement} />
                      </td>
                      <td>{item.title || <span className={styles.muted}>—</span>}</td>
                      <td className={styles.muted} dir="ltr">
                        {item.link || "—"}
                      </td>
                      <td>{item.sort_order.toLocaleString("fa-IR")}</td>
                      <td>
                        <button
                          type="button"
                          className={`${styles.status} ${item.is_active ? styles.statusActive : ""}`}
                          onClick={() => toggleMedia(item)}
                          disabled={busy}
                        >
                          {item.is_active ? "فعال" : "غیرفعال"}
                        </button>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            onClick={() => openEditMedia(item)}
                            disabled={busy}
                            aria-label="ویرایش رسانه"
                          >
                            <i className="fas fa-pen" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={styles.danger}
                            onClick={() => removeMedia(item)}
                            disabled={busy}
                            aria-label="حذف رسانه"
                          >
                            <i className="fas fa-trash" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
