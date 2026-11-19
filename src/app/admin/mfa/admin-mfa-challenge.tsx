"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "../../login/auth-page.module.css";

type Enrollment = {
  id: string;
  qrCode: string;
  secret: string;
};

export function AdminMfaChallenge({
  factorId: initialFactorId,
}: {
  factorId: string | null;
}) {
  const router = useRouter();
  const [factorId, setFactorId] = useState(initialFactorId);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function beginEnrollment() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const supabase = await createSupabaseBrowserClient();
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      for (const factor of factors.all) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          const { error } = await supabase.auth.mfa.unenroll({
            factorId: factor.id,
          });
          if (error) throw error;
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Pnyshop admin authenticator",
      });
      if (error) throw error;

      setFactorId(data.id);
      setEnrollment({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (error) {
      console.error("Could not start admin MFA enrollment:", error);
      setNotice("راه‌اندازی تأیید دومرحله‌ای انجام نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !factorId) return;
    if (!/^\d{6}$/.test(code)) {
      setNotice("کد برنامهٔ احراز هویت باید ۶ رقم باشد.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const supabase = await createSupabaseBrowserClient();
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      setEnrollment(null);
      router.replace("/admin");
      router.refresh();
    } catch (error) {
      console.error("Could not verify admin MFA code:", error);
      setNotice("کد معتبر نیست یا منقضی شده است. کد تازه‌ای وارد کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <StorefrontHeader />
      <section className={styles.authShell} aria-labelledby="adminMfaTitle">
        <div className={styles.authContainer}>
          <h1 id="adminMfaTitle">تأیید دومرحله‌ای مدیریت</h1>
          <p className={styles.subtitle}>
            برای دسترسی به پنل مدیریت، کد برنامهٔ احراز هویت را وارد کنید.
          </p>

          {enrollment ? (
            <>
              <p className={styles.subtitle}>
                QR را با برنامه‌ای مانند Google Authenticator یا 1Password
                اسکن کنید؛ اگر اسکن ممکن نیست، کلید زیر را دستی وارد کنید.
              </p>
              <Image
                src={enrollment.qrCode}
                alt="کد QR برای راه‌اندازی احراز هویت دومرحله‌ای"
                width={220}
                height={220}
                unoptimized
              />
              <div className={styles.formGroup}>
                <label htmlFor="mfa-secret">کلید راه‌اندازی</label>
                <input
                  className={styles.input}
                  id="mfa-secret"
                  type="password"
                  value={enrollment.secret}
                  readOnly
                  autoComplete="off"
                />
              </div>
            </>
          ) : !factorId ? (
            <button
              className={styles.actionButton}
              type="button"
              onClick={beginEnrollment}
              disabled={busy}
            >
              {busy ? "در حال آماده‌سازی..." : "راه‌اندازی برنامهٔ احراز هویت"}
            </button>
          ) : null}

          {factorId && (
            <form onSubmit={verifyCode} noValidate>
              <div className={styles.formGroup}>
                <label htmlFor="mfa-code">کد شش‌رقمی</label>
                <input
                  className={styles.input}
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  dir="ltr"
                  value={code}
                  onChange={(event) =>
                    setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                />
              </div>
              <button
                className={styles.actionButton}
                type="submit"
                disabled={busy}
              >
                {busy ? "در حال بررسی..." : "تأیید و ورود به پنل"}
              </button>
            </form>
          )}

          {notice && (
            <p
              className={`${styles.fieldError} ${styles.fieldErrorVisible}`}
              role="alert"
            >
              {notice}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
