import type { Metadata } from "next";
import Link from "next/link";
import { AiPage } from "./ai-page";

export const metadata: Metadata = {
  title: "دستیار هوشمند Pnyshop",
};

export default function AiRoute() {
  return (
    <div className="ai-page">
      <Link className="ai-back-button" href="/" aria-label="بازگشت به صفحه اصلی">
        <i className="fas fa-arrow-left" aria-hidden="true" />
        بازگشت
      </Link>
      <AiPage />
    </div>
  );
}
