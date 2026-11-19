import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/require-admin";
import styles from "./section-placeholder.module.css";

export const metadata: Metadata = {
  title: "بخش مدیریت | Pnyshop",
};

const SECTION_TITLES: Record<string, string> = {
  products: "مدیریت محصولات",
  categories: "مدیریت دسته‌بندی‌ها",
  brands: "مدیریت برندها",
  media: "مدیریت تصاویر و ظاهر سایت",
  orders: "مدیریت سفارش‌ها",
  coupons: "مدیریت کدهای تخفیف",
  customers: "مدیریت مشتریان",
  reports: "داشبورد و گزارش‌ها",
  audit: "گزارش فعالیت",
};

export default async function AdminSectionPlaceholder({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  await requireAdmin();
  const { section } = await params;
  const title = SECTION_TITLES[section] ?? "بخش مدیریت";

  return (
    <section className={styles.card}>
      <span className={styles.icon} aria-hidden="true">
        <i className="fas fa-person-digging" />
      </span>
      <h1>{title}</h1>
      <p>این بخش در فازهای بعدی پروژه تکمیل می‌شود.</p>
      <Link href="/admin">بازگشت به داشبورد</Link>
    </section>
  );
}
