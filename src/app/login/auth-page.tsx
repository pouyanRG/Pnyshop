"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./auth-page.module.css";

type SupabaseBrowserClient = Awaited<
  ReturnType<typeof createSupabaseBrowserClient>
>;
type StoredChallenge = {
  email: string;
  resendAt: number;
  expiresAt: number;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 8;
const RESEND_COOLDOWN_MS = 45_000;
const CHALLENGE_TTL_MS = 60 * 60 * 1000;
const CHALLENGE_STORAGE_KEY = "pnyshop:email-otp-challenge";
const CHALLENGE_EVENT = "pnyshop:email-otp-challenge-change";

function normalizeDigits(value: string) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";

  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const index = persian.indexOf(digit);
    return String(index >= 0 ? index : arabic.indexOf(digit));
  });
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }
  return undefined;
}

function getAuthErrorMessage(error: unknown, action: "email" | "code") {
  const code = getErrorCode(error);
  const messages: Record<string, string> = {
    over_email_send_rate_limit: "درخواست‌های ایمیل زیاد است؛ کمی بعد دوباره تلاش کنید.",
    over_request_rate_limit: "درخواست‌های ورود زیاد است؛ کمی بعد دوباره تلاش کنید.",
    too_many_requests: "تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.",
    otp_expired: "این کد منقضی شده است؛ کد تازه‌ای درخواست کنید.",
    token_expired: "این کد منقضی شده است؛ کد تازه‌ای درخواست کنید.",
    invalid_otp: "کد واردشده معتبر نیست.",
    otp_disabled: "فعلاً امکان ارسال کد وجود ندارد؛ کمی بعد دوباره تلاش کنید.",
  };

  if (!code) return null;
  return (
    messages[code] ??
    (action === "email"
      ? "ارسال کد انجام نشد؛ ایمیل را بررسی و دوباره تلاش کنید."
      : "بررسی کد انجام نشد؛ کد را بررسی و دوباره تلاش کنید.")
  );
}

function getSafeRedirect() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("redirect") ?? params.get("next");
  if (!requested) return "/";

  try {
    const candidate = new URL(requested, window.location.origin);
    if (candidate.origin !== window.location.origin) return "/";
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return "/";
  }
}

function formatCountdown(seconds: number) {
  const formatDigit = (value: number) =>
    new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(value);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${formatDigit(minutes)}:${formatDigit(remainingSeconds).padStart(2, "۰")}`;
}

function getStoredChallengeSnapshot() {
  try {
    return window.sessionStorage.getItem(CHALLENGE_STORAGE_KEY);
  } catch (error) {
    console.error("[Auth] وضعیت مرحله ورود در مرورگر قابل خواندن نبود:", error);
    return null;
  }
}

function getServerChallengeSnapshot() {
  return null;
}

function subscribeToChallenge(onStoreChange: () => void) {
  window.addEventListener(CHALLENGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CHALLENGE_EVENT, onStoreChange);
}

function parseStoredChallenge(raw: string | null): StoredChallenge | null {
  if (!raw) return null;

  try {
    const stored: unknown = JSON.parse(raw);
    if (
      typeof stored !== "object" ||
      stored === null ||
      !("email" in stored) ||
      !("resendAt" in stored) ||
      !("expiresAt" in stored) ||
      typeof stored.email !== "string" ||
      !EMAIL_PATTERN.test(stored.email) ||
      typeof stored.resendAt !== "number" ||
      typeof stored.expiresAt !== "number"
    ) {
      throw new Error("Stored email OTP challenge is invalid");
    }

    return {
      email: stored.email,
      resendAt: stored.resendAt,
      expiresAt: stored.expiresAt,
    };
  } catch (error) {
    console.error("[Auth] مرحله ذخیره‌شده ورود معتبر نبود:", error);
    return null;
  }
}

function persistChallenge(challenge: StoredChallenge) {
  try {
    window.sessionStorage.setItem(
      CHALLENGE_STORAGE_KEY,
      JSON.stringify(challenge),
    );
    window.dispatchEvent(new Event(CHALLENGE_EVENT));
    return true;
  } catch (error) {
    console.error("[Auth] مرحله ورود در مرورگر ذخیره نشد:", error);
    return false;
  }
}

function clearPersistedChallenge() {
  try {
    window.sessionStorage.removeItem(CHALLENGE_STORAGE_KEY);
    window.dispatchEvent(new Event(CHALLENGE_EVENT));
  } catch (error) {
    console.error("[Auth] وضعیت مرحله ورود از مرورگر پاک نشد:", error);
  }
}

export function AuthPage() {
  const router = useRouter();
  const storedChallenge = useSyncExternalStore(
    subscribeToChallenge,
    getStoredChallengeSnapshot,
    getServerChallengeSnapshot,
  );
  const parsedChallenge = useMemo(
    () => parseStoredChallenge(storedChallenge),
    [storedChallenge],
  );
  const [temporaryChallenge, setTemporaryChallenge] =
    useState<StoredChallenge | null>(null);
  const challenge = temporaryChallenge ?? parsedChallenge;
  const step = challenge ? "code" : "email";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const clientPromise = useRef<Promise<SupabaseBrowserClient> | null>(null);
  const lastActionAt = useRef(0);

  useEffect(() => {
    if (storedChallenge && !parsedChallenge) clearPersistedChallenge();
    else if (parsedChallenge && parsedChallenge.expiresAt <= Date.now()) {
      clearPersistedChallenge();
    }
  }, [parsedChallenge, storedChallenge]);

  useEffect(() => {
    if (!challenge || challenge.resendAt <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge, now]);

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
    else emailInputRef.current?.focus();
  }, [step]);

  const getClient = useCallback(() => {
    clientPromise.current ??= createSupabaseBrowserClient();
    return clientPromise.current;
  }, []);

  const finishAuthentication = useCallback(
    async (client: SupabaseBrowserClient, userId: string) => {
      const { error } = await client.rpc("ensure_current_user_profile");
      if (error) throw error;

      clearPersistedChallenge();
      window.localStorage.setItem("current_user", userId);
      router.replace(getSafeRedirect() as Route);
      router.refresh();
    },
    [router],
  );

  function showFailure(error: unknown, action: "email" | "code") {
    const message = getAuthErrorMessage(error, action);
    if (message) {
      setFieldError(message);
      return;
    }

    console.error("[Auth] ارتباط با سرویس احراز هویت ناموفق بود:", error);
    setNotice("ارتباط برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.");
  }

  function beginCodeStep(emailAddress: string) {
    const sentAt = Date.now();
    const nextChallenge = {
      email: emailAddress,
      resendAt: sentAt + RESEND_COOLDOWN_MS,
      expiresAt: sentAt + CHALLENGE_TTL_MS,
    };

    setEmail(emailAddress);
    setCode("");
    setFieldError("");
    if (!persistChallenge(nextChallenge)) {
      setTemporaryChallenge(nextChallenge);
      setFieldError(
        "مرحله ورود در این مرورگر ذخیره نشد؛ تا پایان ورود این صفحه را نبندید.",
      );
    } else {
      setTemporaryChallenge(null);
    }
  }

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError("");
    setNotice("");
    if (busy) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setFieldError("یک ایمیل معتبر وارد کنید.");
      return;
    }
    if (Date.now() - lastActionAt.current < 1500) return;
    lastActionAt.current = Date.now();

    setBusy(true);
    try {
      const client = await getClient();
      const { error } = await client.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      beginCodeStep(normalizedEmail);
    } catch (error) {
      showFailure(error, "email");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError("");
    setNotice("");
    if (busy || !challenge) return;

    const token = normalizeDigits(code).replace(/\D/g, "");
    if (token.length !== OTP_LENGTH) {
      setFieldError("کد ورود باید ۸ رقم باشد.");
      return;
    }

    setBusy(true);
    try {
      const client = await getClient();
      const { data, error } = await client.auth.verifyOtp({
        email: challenge.email,
        token,
        type: "email",
      });
      if (error) throw error;
      if (!data.user || !data.session) {
        throw new Error("Email OTP verification returned no authenticated session");
      }

      await finishAuthentication(client, data.user.id);
    } catch (error) {
      showFailure(error, "code");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (
      !challenge ||
      busy ||
      Math.ceil((challenge.resendAt - now) / 1000) > 0
    ) {
      return;
    }
    setFieldError("");
    setNotice("");
    setBusy(true);
    try {
      const client = await getClient();
      const { error } = await client.auth.signInWithOtp({
        email: challenge.email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;

      const nextChallenge = {
        ...challenge,
        resendAt: Date.now() + RESEND_COOLDOWN_MS,
      };
      setCode("");
      setNow(Date.now());
      if (!persistChallenge(nextChallenge)) {
        setTemporaryChallenge(nextChallenge);
        setFieldError(
          "مرحله ورود در این مرورگر ذخیره نشد؛ تا پایان ورود این صفحه را نبندید.",
        );
      } else {
        setTemporaryChallenge(null);
      }
    } catch (error) {
      showFailure(error, "code");
    } finally {
      setBusy(false);
    }
  }

  function editEmail() {
    if (challenge) setEmail(challenge.email);
    clearPersistedChallenge();
    setTemporaryChallenge(null);
    setCode("");
    setFieldError("");
    setNotice("");
  }

  const cooldown = challenge
    ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000))
    : 0;

  return (
    <main className={styles.authPage} dir="rtl">
      {notice && (
        <div className={styles.toast} role="alert" aria-live="assertive">
          {notice}
        </div>
      )}

      <section className={styles.authShell} aria-labelledby="authTitle">
        <div className={styles.authContainer}>
          <Link className={styles.logo} href="/" aria-label="بازگشت به Pnyshop">
            <Image
              src="/images/Pnyshop-img-logo.png"
              alt="Pnyshop"
              width={112}
              height={58}
              priority
            />
          </Link>

          <header className={styles.formHeader}>
            <h1 className={styles.pageTitle} id="authTitle">
              {step === "email" ? "به Pnyshop خوش آمدید" : "کد را وارد کنید"}
            </h1>
            <p className={styles.subtitle}>
              {step === "email"
                ? "برای ورود یا ساخت حساب، ایمیل خود را وارد کنید. کد ورود برایتان ارسال می‌شود."
                : "کد ۸ رقمی به "}
              {step === "code" && (
                <>
                  <bdi dir="ltr">{challenge?.email}</bdi> ارسال شد.
                </>
              )}
            </p>
          </header>

          {step === "email" ? (
            <form onSubmit={sendCode} noValidate>
              <div className={styles.formGroup}>
                <label htmlFor="auth-email">ایمیل</label>
                <input
                  ref={emailInputRef}
                  className={styles.input}
                  id="auth-email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  dir="ltr"
                  autoFocus
                  value={email}
                  onChange={(event) => {
                    setEmail(event.currentTarget.value);
                    setFieldError("");
                  }}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? "auth-field-error" : undefined}
                  disabled={busy}
                />
                <p
                  className={styles.fieldError}
                  id="auth-field-error"
                  aria-live="polite"
                >
                  {fieldError}
                </p>
              </div>
              <button
                className={styles.actionButton}
                type="submit"
                disabled={busy}
              >
                {busy ? "در حال ارسال..." : "ادامه"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} noValidate>
              <button
                className={styles.textButton}
                type="button"
                onClick={editEmail}
                disabled={busy}
              >
                ایمیل اشتباه است؟ ویرایش
              </button>
              <div className={styles.formGroup}>
                <label htmlFor="auth-code">کد ۸ رقمی</label>
                <input
                  ref={codeInputRef}
                  className={`${styles.input} ${styles.otpInput}`}
                  id="auth-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  pattern="[0-9]{8}"
                  dir="ltr"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      normalizeDigits(event.currentTarget.value)
                        .replace(/\D/g, "")
                        .slice(0, OTP_LENGTH),
                    )
                  }
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? "auth-field-error" : undefined}
                  disabled={busy}
                />
                <p
                  className={styles.fieldError}
                  id="auth-field-error"
                  aria-live="polite"
                >
                  {fieldError}
                </p>
              </div>
              <button
                className={styles.actionButton}
                type="submit"
                disabled={busy}
              >
                {busy ? "در حال بررسی..." : "تأیید کد"}
              </button>
              <button
                className={styles.textButton}
                type="button"
                onClick={() => void resendCode()}
                disabled={busy || cooldown > 0}
              >
                {busy
                  ? "در حال ارسال..."
                  : cooldown > 0
                    ? `ارسال مجدد کد (${formatCountdown(cooldown)})`
                    : "ارسال مجدد کد"}
              </button>
              <p className={styles.inlineHint}>
                ایمیل را نمی‌بینید؟ پوشه اسپم را بررسی کنید.
              </p>
            </form>
          )}

          <p className={styles.legalNote}>
            با ادامه، شرایط خدمات و حریم خصوصی را می‌پذیرید.
          </p>
        </div>
      </section>
    </main>
  );
}
