import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LegacyAiBehavior } from "./legacy-ai-behavior";
import { StorefrontHeader } from "@/components/storefront/storefront-header";

export const metadata: Metadata = {
  title: "دستیار هوشمند Pnyshop",
};

async function getLegacyAiMarkup() {
  const source = await readFile(path.join(process.cwd(), "Ai.html"), "utf8");
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (!body) throw new Error("Could not read the legacy AI body");
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/href=(["'])login\.html\1/gi, 'href="/login"')
    .replace(/href=(["'])profile\.html\1/gi, 'href="/profile"')
    .replace(/src=(["'])img\//gi, 'src="/images/')
    .replace(/src=(["'])img\//gi, 'src="/images/');
}

export default async function AiRoute() {
  const markup = await getLegacyAiMarkup();
  return (
    <div className="ai-page">
      <StorefrontHeader />
      <LegacyAiBehavior />
      <div dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
  );
}
