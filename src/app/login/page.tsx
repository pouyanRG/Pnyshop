import type { Metadata } from "next";
import { AuthPage } from "./auth-page";

export const metadata: Metadata = {
  title: "ورود / ثبت‌نام | SHOP",
  description: "ورود یا ثبت‌نام در فروشگاه اینترنتی SHOP",
};

export default function LoginPage() {
  return <AuthPage />;
}
