"use client";

import type { Route } from "next";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./auth-page.module.css";

type AuthMode = "login" | "register" | "forgot" | "verify" | "reset";
type LoginMethod = "password" | "sms";
type RecoveryMethod = "email" | "sms";
type AuthChannel = "email" | "phone";
type ChallengePurpose = "signup" | "sms-login" | "phone-recovery";
type AuthAction =
  | "login"
  | "register"
  | "google"
  | "sms-login"
  | "verify"
  | "resend"
  | "recovery"
  | "reset"
  | null;
type FieldErrors = Record<string, string>;
type Notice = { message: string; type: "success" | "error" };
type Contact = { kind: AuthChannel; value: string };
type Challenge = Contact & { purpose: ChallengePurpose };
type SupabaseBrowserClient = Awaited<
  ReturnType<typeof createSupabaseBrowserClient>
>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IRANIAN_MOBILE_PATTERN = /^09\d{9}$/;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_SYMBOL_PATTERN = /[\p{P}\p{S}]/u;
const OTP_LENGTH = 8;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const DEFAULT_STRENGTH_HINT =
  "حداقل ۱۲ کاراکتر، شامل حروف بزرگ و کوچک، عدد و نماد";
const THEME_EVENT = "pnyshop-theme-change";

function subscribeToTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_EVENT, onStoreChange);
  media.addEventListener("change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_EVENT, onStoreChange);
    media.removeEventListener("change", onStoreChange);
  };
}

function getThemeSnapshot(): "light" | "dark" {
  const storedTheme = window.localStorage.getItem("theme");
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getThemeServerSnapshot(): "light" | "dark" {
  return "light";
}

function normalizeDigits(value: string) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";

  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const index = persian.indexOf(digit);
    return String(index >= 0 ? index : arabic.indexOf(digit));
  });
}

function cleanText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function parseContact(value: string): Contact | null {
  const normalized = normalizeDigits(value).trim();
  const phone = normalized.replace(/[\s()-]/g, "");
  if (IRANIAN_MOBILE_PATTERN.test(phone)) {
    return { kind: "phone", value: phone };
  }
  if (EMAIL_PATTERN.test(normalized)) {
    return { kind: "email", value: normalized.toLowerCase() };
  }
  return null;
}

function meetsPasswordPolicy(value: string) {
  return (
    Array.from(value).length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    PASSWORD_SYMBOL_PATTERN.test(value)
  );
}

function getPasswordStrength(value: string) {
  if (!value) return 0;
  return (
    Number(Array.from(value).length >= PASSWORD_MIN_LENGTH) +
    Number(/[A-Z]/.test(value) && /[a-z]/.test(value)) +
    Number(/[0-9]/.test(value)) +
    Number(PASSWORD_SYMBOL_PATTERN.test(value))
  );
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }
  return undefined;
}

function authErrorMessage(error: unknown) {
  const messages: Record<string, string> = {
    invalid_credentials: "اطلاعات ورود صحیح نیست.",
    email_not_confirmed: "ابتدا ایمیل خود را با کد ارسال‌شده تأیید کنید.",
    weak_password:
      "رمز عبور باید حداقل ۱۲ کاراکتر و شامل حروف بزرگ و کوچک، عدد و نماد باشد.",
    otp_expired: "کد تأیید منقضی شده است. کد تازه‌ای درخواست کنید.",
    token_expired: "کد تأیید منقضی شده است. کد تازه‌ای درخواست کنید.",
    invalid_otp: "کد تأیید معتبر نیست.",
    otp_disabled: "ارسال کد در تنظیمات Supabase فعال نیست.",
    over_email_send_rate_limit:
      "تعداد درخواست‌های ایمیل زیاد بود. کمی صبر کنید.",
    over_sms_send_rate_limit:
      "تعداد درخواست‌های پیامک زیاد بود. کمی صبر کنید.",
    too_many_requests: "تعداد تلاش‌های ناموفق زیاد بود. کمی صبر کنید.",
    user_already_exists: "اگر اطلاعات قابل ثبت باشد، پیام تأیید ارسال می‌شود.",
  };
  const code = getErrorCode(error);

  if (code && messages[code]) return messages[code];
  console.error("[Auth] احراز هویت با خطا روبه‌رو شد:", code ?? "unknown");
  return "درخواست انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.";
}

function maskContact(contact: Contact) {
  if (contact.kind === "phone") {
    return `${contact.value.slice(0, 4)}••••${contact.value.slice(-2)}`;
  }
  const [name, domain] = contact.value.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
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

export function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>("email");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyAction, setBusyAction] = useState<AuthAction>(null);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [registerIdentifier, setRegisterIdentifier] = useState("");
  const [recoveryIdentifier, setRecoveryIdentifier] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmation, setRegisterConfirmation] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState<Record<string, boolean>>(
    {},
  );
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationAttempts, setVerificationAttempts] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );
  const clientPromise = useRef<Promise<SupabaseBrowserClient> | null>(null);
  const oauthCallbackHandled = useRef(false);
  const lastActionAt = useRef<Record<string, number>>({});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (resendCooldown === 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((remaining) => Math.max(remaining - 1, 0)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const getClient = useCallback(() => {
    // TODO(API): Move auth exchange to a server endpoint that validates Origin/
    // CSRF, issues HttpOnly cookies, and honors remember-me/session-only choice.
    // Supabase-side rate limits and CAPTCHA/Turnstile must remain authoritative;
    // the client cooldowns and honeypots below are only defense-in-depth UX.
    clientPromise.current ??= createSupabaseBrowserClient();
    return clientPromise.current;
  }, []);

  const showNotice = useCallback((message: string, type: Notice["type"]) => {
    setNotice({ message, type });
  }, []);

  const finishAuthentication = useCallback(
    async (client: SupabaseBrowserClient, userId: string) => {
      const { error } = await client.rpc("ensure_current_user_profile");
      if (error) throw error;

      // This is a legacy user-id bridge, not an auth token.
      window.localStorage.setItem("current_user", userId);
      showNotice("خوش آمدید! در حال انتقال...", "success");
      window.setTimeout(() => {
        router.replace(getSafeRedirect() as Route);
      }, 700);
    },
    [router, showNotice],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isRecoveryCallback =
      params.get("recovery") === "1" ||
      params.get("type") === "recovery" ||
      window.location.hash.includes("type=recovery");
    const isOAuthCallback = params.get("oauth") === "1";
    if (!isRecoveryCallback && !isOAuthCallback) return;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    const completeOAuth = async (
      client: SupabaseBrowserClient,
      userId: string,
    ) => {
      if (!active || oauthCallbackHandled.current) return;
      oauthCallbackHandled.current = true;
      try {
        await finishAuthentication(client, userId);
      } catch (error) {
        oauthCallbackHandled.current = false;
        showNotice(authErrorMessage(error), "error");
      }
    };

    void getClient()
      .then(async (client) => {
        if (!active) return;
        const { data } = client.auth.onAuthStateChange((event, session) => {
          if (event === "PASSWORD_RECOVERY") setMode("reset");
          if (isOAuthCallback && event === "SIGNED_IN" && session?.user) {
            window.setTimeout(
              () => void completeOAuth(client, session.user.id),
              0,
            );
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();

        if (isRecoveryCallback) setMode("reset");
        if (isOAuthCallback) {
          const {
            data: { session },
            error,
          } = await client.auth.getSession();
          if (error) throw error;
          if (session?.user) await completeOAuth(client, session.user.id);
        }
      })
      .catch((error: unknown) => {
        if (active) showNotice(authErrorMessage(error), "error");
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [finishAuthentication, getClient, showNotice]);

  function isThrottled(action: string, windowMs = 1500) {
    const now = Date.now();
    if (now - (lastActionAt.current[action] ?? 0) < windowMs) return true;
    lastActionAt.current[action] = now;
    return false;
  }

  function updateFieldError(field: string, message: string) {
    setErrors((current) => ({ ...current, [field]: message }));
  }

  function clearFieldError(field: string) {
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function clearFeedback() {
    setErrors({});
    setNotice(null);
  }

  function changeMode(nextMode: AuthMode) {
    clearFeedback();
    setMode(nextMode);
  }

  function fieldError(field: string) {
    return (
      <p className={styles.fieldError} id={`error-${field}`} aria-live="polite">
        {errors[field] ?? ""}
      </p>
    );
  }

  function togglePassword(field: string) {
    setPasswordVisible((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  function validateContact(
    field: string,
    value: string,
    kind: "either" | AuthChannel,
  ) {
    const parsed = parseContact(value);
    if (!value.trim()) {
      updateFieldError(field, "این فیلد را تکمیل کنید.");
      return false;
    }
    if (!parsed || (kind !== "either" && parsed.kind !== kind)) {
      updateFieldError(
        field,
        kind === "email"
          ? "فرمت ایمیل صحیح نیست."
          : kind === "phone"
            ? "شماره موبایل را به‌شکل ۰۹xxxxxxxxx وارد کنید."
            : "ایمیل معتبر یا شماره موبایل ۱۱رقمی وارد کنید.",
      );
      return false;
    }
    clearFieldError(field);
    return true;
  }

  function validatePassword(field: string, value: string) {
    if (!meetsPasswordPolicy(value)) {
      updateFieldError(
        field,
        "رمز عبور باید حداقل ۱۲ کاراکتر و شامل حروف بزرگ و کوچک، عدد و نماد باشد.",
      );
      return false;
    }
    clearFieldError(field);
    return true;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    const form = new FormData(event.currentTarget);
    if (String(form.get("login-hp") ?? "")) return;
    if (busyAction) return;

    const password = String(form.get("login-password") ?? "");
    const validContact = validateContact(
      "login-identifier",
      loginIdentifier,
      "either",
    );
    if (!password) updateFieldError("login-password", "رمز عبور را وارد کنید.");
    else clearFieldError("login-password");
    if (!validContact || !password) return;
    if (isThrottled("login")) {
      showNotice("کمی صبر کنید و دوباره تلاش کنید.", "error");
      return;
    }

    const contact = parseContact(loginIdentifier);
    if (!contact) return;
    setBusyAction("login");
    try {
      const client = await getClient();
      const credentials =
        contact.kind === "email"
          ? { email: contact.value, password }
          : { phone: contact.value, password };
      const { data, error } = await client.auth.signInWithPassword(credentials);
      if (error) throw error;
      if (!data.user) throw new Error("Supabase returned no authenticated user");

      const isConfirmed =
        contact.kind === "email"
          ? Boolean(data.user.email_confirmed_at)
          : Boolean(data.user.phone_confirmed_at);
      if (!isConfirmed) {
        const { error: signOutError } = await client.auth.signOut();
        if (signOutError) throw signOutError;
        throw new Error("Unverified account cannot complete authentication");
      }
      await finishAuthentication(client, data.user.id);
    } catch (error) {
      const code = getErrorCode(error);
      console.error("[Login] ورود ناموفق بود:", code ?? "unknown");
      showNotice(authErrorMessage(error), "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendPhoneLoginCode() {
    clearFeedback();
    if (busyAction) return;
    const validContact = validateContact(
      "login-identifier",
      loginIdentifier,
      "phone",
    );
    if (!validContact) return;
    if (isThrottled("sms-login", 15000)) {
      showNotice("کمی صبر کنید و دوباره تلاش کنید.", "error");
      return;
    }

    const contact = parseContact(loginIdentifier);
    if (!contact || contact.kind !== "phone") return;
    setBusyAction("sms-login");
    try {
      const client = await getClient();
      const { error } = await client.auth.signInWithOtp({
        phone: contact.value,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setChallenge({
        ...contact,
        purpose: "sms-login",
      });
      setVerificationCode("");
      setVerificationAttempts(0);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setMode("verify");
      showNotice(
        "اگر شماره به حسابی متصل باشد، کد یک‌بارمصرف ارسال می‌شود.",
        "success",
      );
    } catch (error) {
      console.error("[SMSLogin] ارسال کد ناموفق بود:", getErrorCode(error) ?? "unknown");
      showNotice(authErrorMessage(error), "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    const form = new FormData(event.currentTarget);
    if (String(form.get("register-hp") ?? "")) return;
    if (busyAction) return;

    const name = cleanText(String(form.get("register-name") ?? ""));
    const password = registerPassword;
    let invalid = false;
    if (Array.from(name).length < 3) {
      updateFieldError("register-name", "نام را با حداقل ۳ حرف وارد کنید.");
      invalid = true;
    } else {
      clearFieldError("register-name");
    }
    if (!validateContact("register-identifier", registerIdentifier, "either")) {
      invalid = true;
    }
    if (!validatePassword("register-password", password)) invalid = true;
    if (password !== registerConfirmation) {
      updateFieldError("register-confirmation", "تکرار رمز عبور همخوانی ندارد.");
      invalid = true;
    } else {
      clearFieldError("register-confirmation");
    }
    if (!termsAccepted) {
      updateFieldError("terms", "برای ادامه، پذیرش قوانین الزامی است.");
      invalid = true;
    }
    if (invalid) return;
    if (isThrottled("register", 5000)) {
      showNotice("کمی صبر کنید و دوباره تلاش کنید.", "error");
      return;
    }

    const contact = parseContact(registerIdentifier);
    if (!contact) return;
    setBusyAction("register");
    try {
      const client = await getClient();
      const metadata = {
        name,
        mobile: contact.kind === "phone" ? contact.value : "",
      };
      // TODO(API): Record the terms version and acceptance timestamp server-side.
      const credentials =
        contact.kind === "email"
          ? {
              email: contact.value,
              password,
              options: { data: metadata },
            }
          : {
              phone: contact.value,
              password,
              options: { data: metadata },
            };
      const { data, error } = await client.auth.signUp(credentials);
      if (error) throw error;
      if (!data.user) throw new Error("Supabase returned no user after signup");

      const isConfirmed =
        contact.kind === "email"
          ? Boolean(data.user.email_confirmed_at)
          : Boolean(data.user.phone_confirmed_at);
      if (data.session && isConfirmed) {
        await finishAuthentication(client, data.user.id);
        return;
      }
      if (data.session) {
        const { error: signOutError } = await client.auth.signOut();
        if (signOutError) throw signOutError;
        throw new Error("Confirmation must be enabled for new accounts");
      }

      setChallenge({ ...contact, purpose: "signup" });
      setVerificationCode("");
      setVerificationAttempts(0);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setMode("verify");
      setRegisterPassword("");
      setRegisterConfirmation("");
      setTermsAccepted(false);
      showNotice(
        "اگر اطلاعات قابل ثبت باشد، کد تأیید برای آن ارسال می‌شود.",
        "success",
      );
    } catch (error) {
      console.error("[Register] ثبت‌نام ناموفق بود:", getErrorCode(error) ?? "unknown");
      if (getErrorCode(error) === "weak_password") {
        updateFieldError("register-password", authErrorMessage(error));
      } else {
        showNotice(authErrorMessage(error), "error");
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!challenge || busyAction) return;
    if (verificationAttempts >= OTP_MAX_ATTEMPTS) {
      showNotice("تعداد تلاش‌ها تمام شد. کد تازه‌ای درخواست کنید.", "error");
      return;
    }
    const token = normalizeDigits(verificationCode).replace(/\D/g, "");
    if (token.length !== OTP_LENGTH) {
      updateFieldError("verification-code", "کد تأیید باید ۸ رقم باشد.");
      return;
    }
    if (isThrottled("verify", 1000)) return;

    setBusyAction("verify");
    try {
      const client = await getClient();
      const params =
        challenge.kind === "email"
          ? { email: challenge.value, token, type: "signup" as const }
          : { phone: challenge.value, token, type: "sms" as const };
      const { data, error } = await client.auth.verifyOtp(params);
      if (error) throw error;
      if (!data.user || !data.session) {
        throw new Error("OTP verification returned no authenticated session");
      }

      const confirmed =
        challenge.kind === "email"
          ? Boolean(data.user.email_confirmed_at)
          : Boolean(data.user.phone_confirmed_at);
      if (!confirmed) throw new Error("OTP verification did not confirm contact");

      if (challenge.purpose === "phone-recovery") {
        setChallenge(null);
        setMode("reset");
        showNotice("شماره تأیید شد؛ رمز عبور جدید را تعیین کنید.", "success");
        return;
      }

      await finishAuthentication(client, data.user.id);
    } catch (error) {
      setVerificationAttempts((attempts) => attempts + 1);
      console.error("[OTP] تأیید کد ناموفق بود:", getErrorCode(error) ?? "unknown");
      showNotice(authErrorMessage(error), "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResendChallenge() {
    if (!challenge || busyAction || resendCooldown > 0) return;
    if (isThrottled("resend", 15000)) {
      showNotice("کمی صبر کنید و دوباره تلاش کنید.", "error");
      return;
    }

    setBusyAction("resend");
    clearFeedback();
    try {
      const client = await getClient();
      let error: { message: string; code?: string } | null = null;
      if (challenge.purpose === "signup" && challenge.kind === "email") {
        ({ error } = await client.auth.resend({
          type: "signup",
          email: challenge.value,
        }));
      } else if (challenge.purpose === "signup" && challenge.kind === "phone") {
        ({ error } = await client.auth.resend({
          type: "sms",
          phone: challenge.value,
        }));
      } else if (challenge.kind === "phone") {
        ({ error } = await client.auth.signInWithOtp({
          phone: challenge.value,
          options: { shouldCreateUser: false },
        }));
      }
      if (error) throw error;
      setVerificationAttempts(0);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setVerificationCode("");
      showNotice("اگر درخواست معتبر باشد، کد تازه‌ای ارسال می‌شود.", "success");
    } catch (error) {
      console.error("[OTP] ارسال مجدد ناموفق بود:", getErrorCode(error) ?? "unknown");
      showNotice(authErrorMessage(error), "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (busyAction) return;
    const form = new FormData(event.currentTarget);
    if (String(form.get("recovery-hp") ?? "")) return;
    const contactKind = recoveryMethod === "email" ? "email" : "phone";
    if (
      !validateContact(
        "recovery-identifier",
        recoveryIdentifier,
        contactKind,
      )
    ) {
      return;
    }
    if (isThrottled("recovery", 15000)) {
      showNotice("کمی صبر کنید و دوباره تلاش کنید.", "error");
      return;
    }

    const contact = parseContact(recoveryIdentifier);
    if (!contact) return;
    setBusyAction("recovery");
    try {
      const client = await getClient();
      if (contact.kind === "email") {
        const callback = new URL("/login", window.location.origin);
        callback.searchParams.set("recovery", "1");
        const redirect = getSafeRedirect();
        if (redirect !== "/") callback.searchParams.set("redirect", redirect);
        const { error } = await client.auth.resetPasswordForEmail(contact.value, {
          redirectTo: callback.toString(),
        });
        if (error) throw error;
        showNotice(
          "اگر حسابی با این ایمیل ثبت شده باشد، لینک بازیابی برایش ارسال می‌شود.",
          "success",
        );
        return;
      }

      const { error } = await client.auth.signInWithOtp({
        phone: contact.value,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setChallenge({ ...contact, purpose: "phone-recovery" });
      setVerificationCode("");
      setVerificationAttempts(0);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setMode("verify");
      showNotice(
        "اگر شماره به حسابی متصل باشد، کد بازیابی برای آن ارسال می‌شود.",
        "success",
      );
    } catch (error) {
      console.error("[Recovery] درخواست بازیابی ناموفق بود:", getErrorCode(error) ?? "unknown");
      showNotice(authErrorMessage(error), "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (busyAction) return;
    let invalid = false;
    if (!validatePassword("reset-password", resetPassword)) invalid = true;
    if (resetPassword !== resetConfirmation) {
      updateFieldError("reset-confirmation", "تکرار رمز عبور همخوانی ندارد.");
      invalid = true;
    } else {
      clearFieldError("reset-confirmation");
    }
    if (invalid) return;

    setBusyAction("reset");
    try {
      const client = await getClient();
      const { data, error } = await client.auth.updateUser({
        password: resetPassword,
      });
      if (error) throw error;
      if (!data.user) throw new Error("Password update returned no user");
      setResetPassword("");
      setResetConfirmation("");
      await finishAuthentication(client, data.user.id);
    } catch (error) {
      console.error("[ResetPassword] تغییر رمز ناموفق بود:", getErrorCode(error) ?? "unknown");
      showNotice(authErrorMessage(error), "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGoogleAuth() {
    if (busyAction || isThrottled("google")) return;
    setBusyAction("google");
    try {
      const client = await getClient();
      const callback = new URL("/login", window.location.origin);
      callback.searchParams.set("oauth", "1");
      const redirect = getSafeRedirect();
      if (redirect !== "/") callback.searchParams.set("redirect", redirect);
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });
      if (error) throw error;
    } catch (error) {
      console.error("[GoogleAuth] ورود با گوگل ناموفق بود:", getErrorCode(error) ?? "unknown");
      showNotice(authErrorMessage(error), "error");
      setBusyAction(null);
    }
  }

  const strength = getPasswordStrength(registerPassword);
  const strengthLabel =
    strength >= 4 ? "قوی" : strength >= 2 ? "متوسط" : "ضعیف";
  const strengthColor =
    strength >= 4
      ? "var(--success)"
      : strength >= 2
        ? "var(--warning)"
        : "var(--danger)";
  const busy = busyAction !== null;
  const title =
    mode === "register"
      ? "ساخت حساب کاربری"
      : mode === "forgot"
        ? "بازیابی رمز عبور"
        : mode === "verify"
          ? "تأیید کد یک‌بارمصرف"
          : mode === "reset"
            ? "تعیین رمز عبور جدید"
            : "به فروشگاه خوش آمدید";

  return (
    <main className={`${styles.authPage} login-page`} dir="rtl">
      {notice && (
        <div
          className={`${styles.toast} ${notice.type === "error" ? styles.error : styles.success}`}
          role={notice.type === "error" ? "alert" : "status"}
          aria-live={notice.type === "error" ? "assertive" : "polite"}
        >
          {notice.message}
        </div>
      )}

      <div className={styles.authShell}>
        <aside className={styles.brandPanel} aria-labelledby="brandTitle">
          <div className={styles.brandMark} aria-hidden="true">
            <i className="fas fa-bag-shopping" />
          </div>
          <p className={styles.brandEyebrow}>خریدی ساده، تجربه‌ای بهتر</p>
          <h2 className={styles.brandTitle} id="brandTitle">
            انتخاب مطمئن شما، از همین‌جا شروع می‌شود.
          </h2>
          <p className={styles.brandDescription}>
            وارد حساب خود شوید تا سفارش‌ها، علاقه‌مندی‌ها و سبد خریدتان همیشه
            همراهتان باشد.
          </p>
          <div className={styles.brandBenefits}>
            <span>
              <i className="fas fa-shield-alt" aria-hidden="true" />
              پرداخت امن
            </span>
            <span>
              <i className="fas fa-truck" aria-hidden="true" />
              پیگیری آسان سفارش
            </span>
          </div>
          <span className={styles.brandFoot}>SHOP · تجربه‌ای برای هر روز</span>
        </aside>

        <section className={styles.authContainer} aria-labelledby="authTitle">
          <header className={styles.formHeader}>
            <span className={styles.formEyebrow}>حساب کاربری SHOP</span>
            <h1 className={styles.pageTitle} id="authTitle">
              {title}
            </h1>
            <p className={styles.subtitle}>
              {mode === "login"
                ? "با ایمیل یا شماره موبایل وارد حساب خود شوید."
                : mode === "register"
                  ? "برای دسترسی به خدمات فروشگاه، حساب خود را بسازید."
                  : mode === "forgot"
                    ? "روش دریافت لینک یا کد بازیابی را انتخاب کنید."
                    : mode === "verify"
                      ? "کد ارسال‌شده را برای ادامه وارد کنید."
                      : "رمز تازه‌ای انتخاب کنید تا دوباره به حسابتان دسترسی داشته باشید."}
            </p>
          </header>

          {(mode === "login" || mode === "register") && (
            <div className={styles.tabs} role="tablist" aria-label="نوع عملیات">
              <button
                className={`${styles.tabButton} ${mode === "login" ? styles.activeTab : ""}`}
                id="tab-login"
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                aria-controls="auth-form-panel"
                onClick={() => changeMode("login")}
              >
                ورود
              </button>
              <button
                className={`${styles.tabButton} ${mode === "register" ? styles.activeTab : ""}`}
                id="tab-register"
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                aria-controls="auth-form-panel"
                onClick={() => changeMode("register")}
              >
                ثبت‌نام
              </button>
            </div>
          )}

          <div
            className={styles.tabPanel}
            id="auth-form-panel"
            role={mode === "login" || mode === "register" ? "tabpanel" : undefined}
            aria-labelledby={
              mode === "login"
                ? "tab-login"
                : mode === "register"
                  ? "tab-register"
                  : undefined
            }
          >
            {mode === "login" && (
              <>
                <div className={styles.methodSwitch} aria-label="روش ورود">
                  <button
                    type="button"
                    className={loginMethod === "password" ? styles.methodActive : ""}
                    aria-pressed={loginMethod === "password"}
                    onClick={() => {
                      setLoginMethod("password");
                      clearFeedback();
                    }}
                  >
                    با رمز عبور
                  </button>
                  <button
                    type="button"
                    className={loginMethod === "sms" ? styles.methodActive : ""}
                    aria-pressed={loginMethod === "sms"}
                    onClick={() => {
                      setLoginMethod("sms");
                      clearFeedback();
                    }}
                  >
                    کد پیامکی
                  </button>
                </div>
                <form onSubmit={handleLogin} noValidate>
                  <div className={styles.formGroup}>
                    <label htmlFor="login-identifier">ایمیل یا شماره موبایل</label>
                    <div className={styles.inputWrapper}>
                      <input
                        className={styles.input}
                        type="text"
                        id="login-identifier"
                        name="login-identifier"
                        placeholder="ایمیل یا ۰۹۱۲۳۴۵۶۷۸۹"
                        autoComplete="username"
                        inputMode="email"
                        dir="auto"
                        value={loginIdentifier}
                        aria-invalid={Boolean(errors["login-identifier"])}
                        aria-describedby="error-login-identifier"
                        onChange={(event) => {
                          setLoginIdentifier(normalizeDigits(event.currentTarget.value));
                          clearFieldError("login-identifier");
                        }}
                        onBlur={() =>
                          loginIdentifier &&
                          validateContact("login-identifier", loginIdentifier, "either")
                        }
                        required
                      />
                      <i className="fas fa-user" aria-hidden="true" />
                    </div>
                    {fieldError("login-identifier")}
                  </div>

                  {loginMethod === "password" && (
                    <div className={styles.formGroup}>
                      <label htmlFor="login-password">رمز عبور</label>
                      <div className={styles.inputWrapper}>
                        <input
                          className={styles.input}
                          type={passwordVisible.login ? "text" : "password"}
                          id="login-password"
                          name="login-password"
                          placeholder="رمز عبور خود را وارد کنید"
                          autoComplete="current-password"
                          aria-invalid={Boolean(errors["login-password"])}
                          aria-describedby="error-login-password"
                          onChange={() => clearFieldError("login-password")}
                          onBlur={(event) =>
                            !event.currentTarget.value &&
                            updateFieldError("login-password", "رمز عبور را وارد کنید.")
                          }
                          required
                        />
                        <i className="fas fa-lock" aria-hidden="true" />
                        <button
                          className={styles.passwordToggle}
                          type="button"
                          onClick={() => togglePassword("login")}
                          aria-label={
                            passwordVisible.login
                              ? "مخفی کردن رمز عبور"
                              : "نمایش رمز عبور"
                          }
                        >
                          <i
                            className={`fas ${passwordVisible.login ? "fa-eye-slash" : "fa-eye"}`}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      {fieldError("login-password")}
                    </div>
                  )}

                  <div className={styles.formOptions}>
                    {loginMethod === "password" ? (
                      <div className={styles.rememberOption}>
                        <label className={styles.checkLabel}>
                          <input
                            type="checkbox"
                            disabled
                            aria-describedby="remember-hint"
                          />
                          <span>مرا به خاطر بسپار</span>
                        </label>
                        <span className={styles.inlineHint} id="remember-hint">
                          نیازمند نشست امن سمت سرور
                        </span>
                      </div>
                    ) : (
                      <span className={styles.inlineHint}>
                        ارسال کد فقط برای حساب‌های موجود
                      </span>
                    )}
                    <button
                      className={styles.textButton}
                      type="button"
                      onClick={() => {
                        setRecoveryIdentifier(loginIdentifier);
                        changeMode("forgot");
                      }}
                    >
                      فراموشی رمز؟
                    </button>
                  </div>

                  <div className={styles.honeypot} aria-hidden="true">
                    <label htmlFor="login-hp">این فیلد را خالی بگذارید</label>
                    <input
                      id="login-hp"
                      type="text"
                      name="login-hp"
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>
                  <button
                    className={styles.actionButton}
                    type={loginMethod === "password" ? "submit" : "button"}
                    onClick={
                      loginMethod === "sms"
                        ? () => void handleSendPhoneLoginCode()
                        : undefined
                    }
                    disabled={busy}
                    aria-busy={busyAction === "login" || busyAction === "sms-login"}
                  >
                    {busyAction === "login" || busyAction === "sms-login" ? (
                      <span className={styles.spinner} aria-hidden="true" />
                    ) : null}
                    <span>
                      {busyAction === "login" || busyAction === "sms-login"
                        ? "در حال پردازش..."
                        : loginMethod === "password"
                          ? "ورود به حساب"
                          : "دریافت کد پیامکی"}
                    </span>
                    <i className="fas fa-arrow-left" aria-hidden="true" />
                  </button>
                </form>
                <SocialLogin
                  busy={busy}
                  googleBusy={busyAction === "google"}
                  onGoogle={() => void handleGoogleAuth()}
                />
              </>
            )}

            {mode === "register" && (
              <>
                <form onSubmit={handleRegister} noValidate>
                  <div className={styles.formGroup}>
                    <label htmlFor="register-name">نام و نام‌خانوادگی</label>
                    <div className={styles.inputWrapper}>
                      <input
                        className={styles.input}
                        type="text"
                        id="register-name"
                        name="register-name"
                        placeholder="مثال: علی محمدی"
                        autoComplete="name"
                        aria-invalid={Boolean(errors["register-name"])}
                        aria-describedby="error-register-name"
                        onBlur={(event) => {
                          if (Array.from(cleanText(event.currentTarget.value)).length < 3) {
                            updateFieldError("register-name", "نام را با حداقل ۳ حرف وارد کنید.");
                          }
                        }}
                        onChange={() => clearFieldError("register-name")}
                        required
                      />
                      <i className="fas fa-user" aria-hidden="true" />
                    </div>
                    {fieldError("register-name")}
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="register-identifier">ایمیل یا شماره موبایل</label>
                    <div className={styles.inputWrapper}>
                      <input
                        className={styles.input}
                        type="text"
                        id="register-identifier"
                        name="register-identifier"
                        placeholder="ایمیل یا ۰۹۱۲۳۴۵۶۷۸۹"
                        autoComplete="username"
                        inputMode="email"
                        dir="auto"
                        value={registerIdentifier}
                        aria-invalid={Boolean(errors["register-identifier"])}
                        aria-describedby="error-register-identifier"
                        onChange={(event) => {
                          setRegisterIdentifier(normalizeDigits(event.currentTarget.value));
                          clearFieldError("register-identifier");
                        }}
                        onBlur={() =>
                          registerIdentifier &&
                          validateContact(
                            "register-identifier",
                            registerIdentifier,
                            "either",
                          )
                        }
                        required
                      />
                      <i className="fas fa-at" aria-hidden="true" />
                    </div>
                    {fieldError("register-identifier")}
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="register-password">تعیین رمز عبور</label>
                    <div className={styles.inputWrapper}>
                      <input
                        className={styles.input}
                        type={passwordVisible.register ? "text" : "password"}
                        id="register-password"
                        name="register-password"
                        placeholder="حداقل ۱۲ کاراکتر"
                        autoComplete="new-password"
                        value={registerPassword}
                        aria-invalid={Boolean(errors["register-password"])}
                        aria-describedby="error-register-password password-strength"
                        onChange={(event) => {
                          setRegisterPassword(event.currentTarget.value);
                          clearFieldError("register-password");
                        }}
                        onBlur={() =>
                          registerPassword &&
                          validatePassword("register-password", registerPassword)
                        }
                        required
                      />
                      <i className="fas fa-lock" aria-hidden="true" />
                      <PasswordToggle
                        visible={Boolean(passwordVisible.register)}
                        onToggle={() => togglePassword("register")}
                      />
                    </div>
                    <div
                      className={styles.strengthTrack}
                      role="meter"
                      aria-label="قدرت رمز عبور"
                      aria-valuemin={0}
                      aria-valuemax={4}
                      aria-valuenow={strength}
                    >
                      <span
                        className={styles.strengthBar}
                        style={{
                          width: `${Math.min(strength, 4) * 25}%`,
                          backgroundColor: strengthColor,
                        }}
                      />
                    </div>
                    <p className={styles.strengthHint} id="password-strength" aria-live="polite">
                      {registerPassword
                        ? `قدرت رمز: ${strengthLabel}`
                        : DEFAULT_STRENGTH_HINT}
                    </p>
                    {fieldError("register-password")}
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="register-confirmation">تکرار رمز عبور</label>
                    <div className={styles.inputWrapper}>
                      <input
                        className={styles.input}
                        type={passwordVisible.registerConfirm ? "text" : "password"}
                        id="register-confirmation"
                        name="register-confirmation"
                        autoComplete="new-password"
                        value={registerConfirmation}
                        aria-invalid={Boolean(errors["register-confirmation"])}
                        aria-describedby="error-register-confirmation"
                        onChange={(event) => {
                          setRegisterConfirmation(event.currentTarget.value);
                          clearFieldError("register-confirmation");
                        }}
                        onBlur={() =>
                          registerConfirmation &&
                          registerConfirmation !== registerPassword &&
                          updateFieldError(
                            "register-confirmation",
                            "تکرار رمز عبور همخوانی ندارد.",
                          )
                        }
                        required
                      />
                      <i className="fas fa-check-double" aria-hidden="true" />
                      <PasswordToggle
                        visible={Boolean(passwordVisible.registerConfirm)}
                        onToggle={() => togglePassword("registerConfirm")}
                      />
                    </div>
                    {fieldError("register-confirmation")}
                  </div>
                  <label className={styles.termsCheck}>
                    <input
                      type="checkbox"
                      name="terms-accepted"
                      checked={termsAccepted}
                      aria-invalid={Boolean(errors.terms)}
                      aria-describedby="error-terms"
                      onChange={(event) => {
                        setTermsAccepted(event.currentTarget.checked);
                        if (event.currentTarget.checked) clearFieldError("terms");
                      }}
                    />
                    <span>
                      شرایط خدمات و سیاست حریم خصوصی را خوانده و می‌پذیرم.
                    </span>
                  </label>
                  {fieldError("terms")}
                  <div className={styles.honeypot} aria-hidden="true">
                    <label htmlFor="register-hp">این فیلد را خالی بگذارید</label>
                    <input
                      id="register-hp"
                      type="text"
                      name="register-hp"
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>
                  <button
                    className={styles.actionButton}
                    type="submit"
                    disabled={busy}
                    aria-busy={busyAction === "register"}
                  >
                    {busyAction === "register" ? (
                      <span className={styles.spinner} aria-hidden="true" />
                    ) : null}
                    <span>
                      {busyAction === "register"
                        ? "در حال ایجاد حساب..."
                        : "ادامه و دریافت کد تأیید"}
                    </span>
                    <i className="fas fa-arrow-left" aria-hidden="true" />
                  </button>
                </form>
                <SocialLogin
                  busy={busy}
                  googleBusy={busyAction === "google"}
                  onGoogle={() => void handleGoogleAuth()}
                />
              </>
            )}

            {mode === "forgot" && (
              <form onSubmit={handleRecovery} noValidate>
                <div className={styles.methodSwitch} aria-label="روش بازیابی">
                  <button
                    type="button"
                    className={recoveryMethod === "email" ? styles.methodActive : ""}
                    aria-pressed={recoveryMethod === "email"}
                    onClick={() => {
                      setRecoveryMethod("email");
                      clearFeedback();
                    }}
                  >
                    لینک ایمیل
                  </button>
                  <button
                    type="button"
                    className={recoveryMethod === "sms" ? styles.methodActive : ""}
                    aria-pressed={recoveryMethod === "sms"}
                    onClick={() => {
                      setRecoveryMethod("sms");
                      clearFeedback();
                    }}
                  >
                    کد پیامکی
                  </button>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="recovery-identifier">
                    {recoveryMethod === "email" ? "ایمیل" : "شماره موبایل"}
                  </label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={styles.input}
                      type={recoveryMethod === "email" ? "email" : "tel"}
                      id="recovery-identifier"
                      name="recovery-identifier"
                      placeholder={
                        recoveryMethod === "email"
                          ? "example@mail.com"
                          : "۰۹۱۲۳۴۵۶۷۸۹"
                      }
                      autoComplete="username"
                      inputMode={recoveryMethod === "email" ? "email" : "numeric"}
                      dir="ltr"
                      value={recoveryIdentifier}
                      aria-invalid={Boolean(errors["recovery-identifier"])}
                      aria-describedby="error-recovery-identifier"
                      onChange={(event) => {
                        setRecoveryIdentifier(normalizeDigits(event.currentTarget.value));
                        clearFieldError("recovery-identifier");
                      }}
                      onBlur={() =>
                        recoveryIdentifier &&
                        validateContact(
                          "recovery-identifier",
                          recoveryIdentifier,
                          recoveryMethod === "email" ? "email" : "phone",
                        )
                      }
                      required
                    />
                    <i className="fas fa-envelope" aria-hidden="true" />
                  </div>
                  {fieldError("recovery-identifier")}
                </div>
                <div className={styles.honeypot} aria-hidden="true">
                  <label htmlFor="recovery-hp">این فیلد را خالی بگذارید</label>
                  <input
                    id="recovery-hp"
                    type="text"
                    name="recovery-hp"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>
                <button
                  className={styles.actionButton}
                  type="submit"
                  disabled={busy}
                  aria-busy={busyAction === "recovery"}
                >
                  {busyAction === "recovery" ? (
                    <span className={styles.spinner} aria-hidden="true" />
                  ) : null}
                  <span>
                    {busyAction === "recovery" ? "در حال ارسال..." : "ارسال درخواست بازیابی"}
                  </span>
                  <i className="fas fa-arrow-left" aria-hidden="true" />
                </button>
                <button
                  className={styles.backButton}
                  type="button"
                  onClick={() => changeMode("login")}
                >
                  بازگشت به ورود
                </button>
              </form>
            )}

            {mode === "verify" && challenge && (
              <form onSubmit={handleVerify} noValidate>
                <p className={styles.challengeText}>
                  کد ارسال‌شده به <b dir="ltr">{maskContact(challenge)}</b> را وارد کنید.
                </p>
                <div className={styles.formGroup}>
                  <label htmlFor="verification-code">کد تأیید ۸ رقمی</label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={`${styles.input} ${styles.otpInput}`}
                      type="text"
                      id="verification-code"
                      name="verification-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{8}"
                      maxLength={OTP_LENGTH}
                      dir="ltr"
                      value={verificationCode}
                      aria-invalid={Boolean(errors["verification-code"])}
                      aria-describedby="error-verification-code otp-attempts"
                      onChange={(event) => {
                        setVerificationCode(
                          normalizeDigits(event.currentTarget.value)
                            .replace(/\D/g, "")
                            .slice(0, OTP_LENGTH),
                        );
                        clearFieldError("verification-code");
                      }}
                      onBlur={() =>
                        verificationCode.length > 0 &&
                        verificationCode.length !== OTP_LENGTH &&
                        updateFieldError(
                          "verification-code",
                          "کد تأیید باید ۸ رقم باشد.",
                        )
                      }
                      required
                    />
                    <i className="fas fa-shield-alt" aria-hidden="true" />
                  </div>
                  {fieldError("verification-code")}
                  <p className={styles.inlineHint} id="otp-attempts" aria-live="polite">
                    {verificationAttempts > 0
                      ? `${Math.max(OTP_MAX_ATTEMPTS - verificationAttempts, 0)} تلاش باقی‌مانده`
                      : "کد را بدون فاصله وارد کنید."}
                  </p>
                </div>
                <button
                  className={styles.actionButton}
                  type="submit"
                  disabled={busy || verificationAttempts >= OTP_MAX_ATTEMPTS}
                  aria-busy={busyAction === "verify"}
                >
                  {busyAction === "verify" ? (
                    <span className={styles.spinner} aria-hidden="true" />
                  ) : null}
                  <span>
                    {busyAction === "verify" ? "در حال بررسی..." : "تأیید و ادامه"}
                  </span>
                  <i className="fas fa-check" aria-hidden="true" />
                </button>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => void handleResendChallenge()}
                  disabled={busy || resendCooldown > 0}
                >
                  {busyAction === "resend"
                    ? "در حال ارسال..."
                    : resendCooldown > 0
                      ? `ارسال دوباره (${resendCooldown} ثانیه)`
                      : "ارسال دوباره کد"}
                </button>
                <button
                  className={styles.backButton}
                  type="button"
                  onClick={() =>
                    changeMode(
                      challenge.purpose === "signup"
                        ? "register"
                        : challenge.purpose === "phone-recovery"
                          ? "forgot"
                          : "login",
                    )
                  }
                >
                  بازگشت
                </button>
              </form>
            )}

            {mode === "reset" && (
              <form onSubmit={handleResetPassword} noValidate>
                <div className={styles.formGroup}>
                  <label htmlFor="reset-password">رمز عبور جدید</label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={styles.input}
                      type={passwordVisible.reset ? "text" : "password"}
                      id="reset-password"
                      name="reset-password"
                      autoComplete="new-password"
                      placeholder="حداقل ۱۲ کاراکتر"
                      value={resetPassword}
                      aria-invalid={Boolean(errors["reset-password"])}
                      aria-describedby="error-reset-password reset-strength"
                      onChange={(event) => {
                        setResetPassword(event.currentTarget.value);
                        clearFieldError("reset-password");
                      }}
                      onBlur={() =>
                        resetPassword &&
                        validatePassword("reset-password", resetPassword)
                      }
                      required
                    />
                    <i className="fas fa-lock" aria-hidden="true" />
                    <PasswordToggle
                      visible={Boolean(passwordVisible.reset)}
                      onToggle={() => togglePassword("reset")}
                    />
                  </div>
                  <p className={styles.strengthHint} id="reset-strength">
                    {DEFAULT_STRENGTH_HINT}
                  </p>
                  {fieldError("reset-password")}
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="reset-confirmation">تکرار رمز عبور جدید</label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={styles.input}
                      type={passwordVisible.resetConfirm ? "text" : "password"}
                      id="reset-confirmation"
                      name="reset-confirmation"
                      autoComplete="new-password"
                      value={resetConfirmation}
                      aria-invalid={Boolean(errors["reset-confirmation"])}
                      aria-describedby="error-reset-confirmation"
                      onChange={(event) => {
                        setResetConfirmation(event.currentTarget.value);
                        clearFieldError("reset-confirmation");
                      }}
                      onBlur={() =>
                        resetConfirmation &&
                        resetConfirmation !== resetPassword &&
                        updateFieldError(
                          "reset-confirmation",
                          "تکرار رمز عبور همخوانی ندارد.",
                        )
                      }
                      required
                    />
                    <i className="fas fa-check-double" aria-hidden="true" />
                    <PasswordToggle
                      visible={Boolean(passwordVisible.resetConfirm)}
                      onToggle={() => togglePassword("resetConfirm")}
                    />
                  </div>
                  {fieldError("reset-confirmation")}
                </div>
                <button
                  className={styles.actionButton}
                  type="submit"
                  disabled={busy}
                  aria-busy={busyAction === "reset"}
                >
                  {busyAction === "reset" ? (
                    <span className={styles.spinner} aria-hidden="true" />
                  ) : null}
                  <span>
                    {busyAction === "reset" ? "در حال ذخیره..." : "ذخیره رمز جدید"}
                  </span>
                  <i className="fas fa-check" aria-hidden="true" />
                </button>
              </form>
            )}
          </div>

          <div className={styles.legalNote}>
            با ادامه، <a href="#terms">شرایط خدمات</a> و{" "}
            <a href="#privacy">سیاست حریم خصوصی</a> را می‌پذیرید.
          </div>
        </section>
      </div>
    </main>
  );
}

function PasswordToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={styles.passwordToggle}
      type="button"
      onClick={onToggle}
      aria-label={visible ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"}
    >
      <i
        className={`fas ${visible ? "fa-eye-slash" : "fa-eye"}`}
        aria-hidden="true"
      />
    </button>
  );
}

function SocialLogin({
  busy,
  googleBusy,
  onGoogle,
}: {
  busy: boolean;
  googleBusy: boolean;
  onGoogle: () => void;
}) {
  return (
    <>
      <div className={styles.divider}>یا</div>
      <button
        className={styles.socialButton}
        type="button"
        onClick={onGoogle}
        disabled={busy}
      >
        {googleBusy ? <span className={styles.spinner} aria-hidden="true" /> : null}
        <i className="fab fa-google" aria-hidden="true" />
        ادامه با گوگل
      </button>
    </>
  );
}
