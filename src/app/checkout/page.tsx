import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LegacyCheckoutBehavior } from "./legacy-checkout-behavior";
import { StorefrontHeader } from "@/components/storefront/storefront-header";

export const metadata: Metadata = {
  title: "تکمیل سفارش | Pnyshop",
};

async function getLegacyCheckoutMarkup() {
  const source = await readFile(path.join(process.cwd(), "checkout.html"), "utf8");
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  const style = source.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1];
  if (!body || !style) throw new Error("Could not read the legacy checkout markup");
  return {
    style,
    body: body
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/href=(["'])index\.html\1/gi, 'href="/"')
      .replace(/href=(["'])sabad\.html\1/gi, 'href="/cart"')
      .replace(/href=(["'])profile\.html\1/gi, 'href="/profile"')
  };
}

export default async function CheckoutRoute() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login?next=%2Fcheckout");

  const { style, body } = await getLegacyCheckoutMarkup();
  return (
    <div className="checkout-page">
      <StorefrontHeader />
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <style>{`
        .checkout-page {
          min-height: 100vh;
          padding-top: var(--storefront-header-height);
          background: var(--bg-body);
        }
        :root {
          --primary: rgb(246,246,246);
          --secondary: #0d9488;
          --secondary-soft: rgba(13,148,136,0.1);
        }
        [data-theme="dark"] {
          --primary: rgb(33,33,33);
          --secondary: #2dd4bf;
          --secondary-soft: rgba(45,212,191,0.1);
        }
        body {
          background: var(--bg-body);
          color: var(--text-primary);
        }
        .container {
          max-width: 1200px;
          margin: 30px auto;
        }
        .card,
        .summary-sidebar .card {
          border: 1px solid var(--border-light);
          background: var(--bg-surface);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
        }
        .section-title,
        .page-header h1,
        .summary-row,
        label {
          color: var(--text-primary);
        }
        input,
        textarea,
        select,
        .coupon-box {
          border-color: var(--border-light);
          background: var(--bg-elevated);
          color: var(--text-primary);
        }
        .icon-badge {
          background: var(--secondary-soft);
          color: var(--secondary);
        }
        .btn-checkout,
        .coupon-input-row button {
          background: var(--secondary);
          border-radius: var(--radius-md);
        }
      `}</style>
      <LegacyCheckoutBehavior />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}
