// LOGIN / REGISTER LOGIC — Supabase Auth
import { dbDoc, dbGetDoc, supabaseClient } from "./supabase-bridge.js";

/* =========================================================
   THEME
   -------------------------------------------------------
   آیکون ماه/خورشید اکنون کاملاً با CSS بر اساس [data-theme]
   سوییچ می‌شود (به .theme-icon-moon/.theme-icon-sun در Css/auth.css
   نگاه کنید)؛ چون data-theme همان اول در <head> ست می‌شود،
   دیگر هیچ فلش «آیکون اشتباه» قبل از اجرای این اسکریپت رخ
   نمی‌دهد. اینجا فقط localStorage/attribute را همگام نگه می‌داریم.
   ========================================================= */
let currentTheme = localStorage.getItem('theme') || 'light';
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
}
window.toggleTheme = function () {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
};
applyTheme(currentTheme);

/* =========================================================
   UTIL: نرمال‌سازی ارقام فارسی/عربی به لاتین
   -------------------------------------------------------
   قبلاً رجکس‌های رمز عبور/موبایل (/[0-9]/) فقط ارقام ASCII را
   می‌شناختند و رقم فارسی «۰۹۱۲...» یا در رمز عبور، رد یا نادیده
   گرفته می‌شد. اینجا هر ورودی عددی پیش از اعتبارسنجی نرمال می‌شود.
   ========================================================= */
function toLatinDigits(str) {
    const fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
    return String(str || '').replace(/[۰-۹٠-٩]/g, ch => {
        const i1 = fa.indexOf(ch);
        if (i1 > -1) return String(i1);
        const i2 = ar.indexOf(ch);
        if (i2 > -1) return String(i2);
        return ch;
    });
}

/* اینپوت موبایل: ارقام فارسی را به لاتین تبدیل می‌کند (نه این‌که
   بی‌صدا حذفشان کند) و فقط سپس هر چیز غیرعددی را پاک می‌کند */
window.sanitizeMobileInput = function (inputEl) {
    const converted = toLatinDigits(inputEl.value).replace(/[^0-9]/g, '');
    inputEl.value = converted;
};

/* =========================================================
   ERROR MAPPING (فارسی)
   -------------------------------------------------------
   برای جلوگیری از افشای وجود/عدم‌وجود حساب (account
   enumeration)، خطاهای «کاربر یافت نشد» / «رمز اشتباه» /
   «invalid-credential» همه به یک پیام عمومی واحد نگاشت می‌شوند.
   ========================================================= */
function mapAuthError(code) {
    const map = {
        invalid_credentials: 'ایمیل یا رمز عبور اشتباه است',
        email_not_confirmed: 'ابتدا ایمیل خود را از طریق پیوند تأیید ارسال‌شده تأیید کنید',
        user_already_exists: 'این ایمیل قبلاً ثبت‌نام کرده است. وارد شوید.',
        weak_password: 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف و عدد باشد',
        over_email_send_rate_limit: 'تعداد درخواست‌های ایمیل زیاد بود. کمی صبر کنید.',
        too_many_requests: 'تعداد تلاش‌های ناموفق زیاد بود. کمی صبر کنید.'
    };
    const msg = map[code];
    if (!msg) {
        console.error('[Auth] خطای احراز هویت:', code);
    }
    return msg || 'خطایی رخ داد. دوباره تلاش کنید.';
}

/* =========================================================
   FIELD ERROR HELPERS (با پشتیبانی aria-invalid برای screen reader)
   ========================================================= */
function setFieldError(inputId, msg, focusIt) {
    const input = document.getElementById(inputId);
    const err = document.getElementById('err-' + inputId);
    if (input) { input.classList.add('field-error'); input.setAttribute('aria-invalid', 'true'); }
    if (err) { err.innerText = msg; err.classList.add('show'); }
    if (focusIt && input) input.focus();
}
function clearFieldError(inputId) {
    const input = document.getElementById(inputId);
    const err = document.getElementById('err-' + inputId);
    if (input) { input.classList.remove('field-error'); input.setAttribute('aria-invalid', 'false'); }
    if (err) { err.innerText = ''; err.classList.remove('show'); }
}
function clearAllErrors(prefix) {
    document.querySelectorAll(`[id^="err-${prefix}"]`).forEach(e => { e.innerText = ''; e.classList.remove('show'); });
    document.querySelectorAll(`#panel-${prefix === 'login' ? 'login' : 'register'} input`).forEach(i => {
        i.classList.remove('field-error');
        i.setAttribute('aria-invalid', 'false');
    });
}
/* فوکوس روی اولین فیلد دارای خطا — برای کاربران کیبورد/screen reader */
function focusFirstError(prefix) {
    const firstErr = document.querySelector(`#panel-${prefix === 'login' ? 'login' : 'register'} .field-error`);
    if (firstErr) firstErr.focus();
}

/* =========================================================
   EMAIL FORMAT VALIDATION
   -------------------------------------------------------
   قبلاً فرم‌ها با novalidate اعتبارسنجی native را غیرفعال
   کرده بودند اما جایگزین JS فقط «خالی نبودن» را چک می‌کرد؛
   رشته‌ای مثل "abc" مستقیم به سرویس احراز هویت ارسال می‌شد.
   ========================================================= */
function isValidEmail(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

/* =========================================================
   PASSWORD VISIBILITY TOGGLE
   ========================================================= */
window.togglePassVisibility = function (inputId, iconEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    iconEl.className = isHidden ? 'fas fa-eye-slash toggle-pass-btn' : 'fas fa-eye toggle-pass-btn';
    iconEl.setAttribute('aria-label', isHidden ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور');
};
// اجازه‌ی فعال‌سازی آیکون چشم با صفحه‌کلید (Enter/Space) چون role="button" است
document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('toggle-pass-btn')) {
        e.preventDefault();
        e.target.click();
    }
});

/* =========================================================
   PASSWORD STRENGTH — طول + تنوع کاراکتر (نه فقط طول)
   ارقام فارسی/عربی هم پیش از بررسی به لاتین تبدیل می‌شوند.
   ========================================================= */
window.checkStrength = function (rawVal) {
    const val = toLatinDigits(rawVal);
    const bar = document.getElementById('strengthBar');
    const hint = document.getElementById('strengthHint');
    const hasLetter = /[a-zA-Zآ-ی]/.test(val);
    const hasNumber = /[0-9]/.test(val);
    const hasSpecial = /[^a-zA-Z0-9آ-ی]/.test(val);
    let score = 0;
    if (val.length >= 8) score++;
    if (val.length >= 12) score++;
    if (hasLetter && hasNumber) score++;
    if (hasSpecial) score++;

    if (val.length === 0) { bar.style.width = '0%'; hint.innerText = 'حداقل ۸ کاراکتر، شامل حداقل یک حرف و یک عدد'; return; }
    if (score <= 1) { bar.style.width = '30%'; bar.style.background = 'var(--danger)'; hint.innerText = 'رمز عبور ضعیف است'; }
    else if (score === 2) { bar.style.width = '60%'; bar.style.background = 'var(--warning)'; hint.innerText = 'رمز عبور متوسط است'; }
    else { bar.style.width = '100%'; bar.style.background = 'var(--success)'; hint.innerText = 'رمز عبور قوی است ✓'; }
};

function isStrongEnoughPassword(rawVal) {
    const val = toLatinDigits(rawVal);
    return val.length >= 8 && /[a-zA-Zآ-ی]/.test(val) && /[0-9]/.test(val);
}

/* =========================================================
   ایجاد/به‌روزرسانی پروفایل کاربر در Supabase
   ========================================================= */
async function ensureUserProfile(user) {
    const userId = user.id || user.uid;
    const ref = dbDoc(supabaseClient, 'users', userId);
    const { error } = await supabaseClient.rpc('ensure_current_user_profile');
    if (error) throw error;
    const snap = await dbGetDoc(ref);
    if (!snap.exists()) {
        throw new Error('Supabase did not return the authenticated user profile');
    }
}

/* پل موقت با سیستم قدیمی مبتنی بر localStorage */
function bridgeSession(user) {
    localStorage.setItem('current_user', user.id || user.uid);
}

/* =========================================================
   finishAuth اکنون async است و خطای واقعی ensureUserProfile را
   می‌بلعد نه با .finally() (که قبلاً چه موفق چه ناموفق، کاربر
   را ریدایرکت می‌کرد). اگر ساخت پروفایل شکست بخورد، کاربر در
   Supabase Auth لاگین می‌ماند اما به‌جای ریدایرکت کور به
   index.html (که بعداً توسط profile.html/sabad.html به‌خاطر
   نبود سند users/{uid} به همین صفحه پرت می‌شد)، خطای واقعی
   نمایش داده و دکمه فعال می‌شود تا کاربر بتواند دوباره تلاش کند.
   ========================================================= */
async function finishAuth(user, activeBtnId, activeBtnLabel) {
    try {
        await ensureUserProfile(user);
        bridgeSession(user);
        toast('خوش آمدید! در حال انتقال...', 'success');
        setTimeout(() => window.location.href = 'index.html', 1200);
    } catch (err) {
        console.error('[Profile] خطا در ساخت/خواندن پروفایل کاربر در Supabase:', err && err.code, err);
        toast('ورود انجام شد اما ساخت پروفایل با خطا مواجه شد. لطفاً دوباره تلاش کنید.', 'error');
        releaseAllAuthLocks();
        if (activeBtnId) setLoading(activeBtnId, false, activeBtnLabel);
    }
}

function setLoading(btnId, loading, label) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    const span = btn.querySelector('.btn-label');
    if (span) {
        span.innerHTML = loading ? '<span class="spinner-inline"></span> در حال پردازش...' : label;
    }
}
function setSocialLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
}

/* =========================================================
   قفل سراسری بین سه مسیر احراز هویت (ورود ایمیل/ثبت‌نام/گوگل)
   -------------------------------------------------------
   قبلاً هر کدام از این سه مسیر فقط دکمه‌ی خودش را غیرفعال
   می‌کرد؛ یعنی وقتی فرم ایمیل در حال ارسال بود، دکمه‌ی گوگل
   یا تب مقابل هنوز فعال بودند و کاربر می‌توانست هم‌زمان دو
   درخواست احراز هویت متفاوت اجرا کند (race condition).
   همچنین throttle قبلاً یک تایمر مشترک (lastSubmitTs) بین
   هر سه مسیر داشت که باعث throttle نابجا هنگام رفتن به تب
   دیگر می‌شد؛ اکنون هر مسیر تایمر throttle مستقل خودش را دارد.
   ========================================================= */
let isAuthInProgress = false;
let lastSubmitTsLogin = 0;
let lastSubmitTsRegister = 0;
let lastSubmitTsGoogle = 0;
/* SECURITY FIX: قبلاً handleForgotPassword هیچ throttle یا قفلی
   نداشت (برخلاف ورود/ثبت‌نام/گوگل که هرکدام throttle مستقل خود
   را دارند)؛ یعنی با کلیک‌های پیاپی روی «رمز عبور را فراموش‌
   کرده‌اید؟» می‌شد به هر ایمیل دلخواه، بدون هیچ محدودیتی، پی‌درپی
   ایمیل ریست رمز عبور فرستاد (email-bombing روی صندوق ورودی
   قربانی). حالا throttle + قفل
   دکمه در حین ارسال درخواست اضافه شده است. */
let lastSubmitTsForgot = 0;
let isForgotInProgress = false;

function throttled(lastTsGetter, lastTsSetter, windowMs) {
    const now = Date.now();
    if (now - lastTsGetter() < (windowMs || 1500)) return true;
    lastTsSetter(now);
    return false;
}

function lockAllAuthEntryPoints() {
    isAuthInProgress = true;
    document.getElementById('loginBtn').disabled = true;
    document.getElementById('registerBtn').disabled = true;
    setSocialLoading('googleLoginBtn', true);
    setSocialLoading('googleRegisterBtn', true);
}
function releaseAllAuthLocks() {
    isAuthInProgress = false;
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('registerBtn').disabled = false;
    setSocialLoading('googleLoginBtn', false);
    setSocialLoading('googleRegisterBtn', false);
}

/* =========================================================
   ورود با ایمیل
   ========================================================= */
document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clearAllErrors('login');

    // honeypot — اگر پر شده باشد یعنی بات است
    if (document.getElementById('login-hp').value) return;
    if (isAuthInProgress) return;
    if (throttled(() => lastSubmitTsLogin, v => lastSubmitTsLogin = v)) return;

    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;

    let hasError = false;
    let firstErrorField = null;
    if (!email) { setFieldError('login-email', 'ایمیل را وارد کنید'); hasError = true; firstErrorField = firstErrorField || 'login-email'; }
    else if (!isValidEmail(email)) { setFieldError('login-email', 'فرمت ایمیل صحیح نیست'); hasError = true; firstErrorField = firstErrorField || 'login-email'; }
    if (!pass) { setFieldError('login-pass', 'رمز عبور را وارد کنید'); hasError = true; firstErrorField = firstErrorField || 'login-pass'; }
    if (hasError) { const el = document.getElementById(firstErrorField); if (el) el.focus(); return; }

    lockAllAuthEntryPoints();
    setLoading('loginBtn', true);
    supabaseClient.auth.signInWithPassword({ email, password: pass })
        .then(({ data, error }) => {
            if (error) throw error;
            return finishAuth(data.user, 'loginBtn', 'ورود به حساب');
        })
        .catch(err => {
            releaseAllAuthLocks();
            setLoading('loginBtn', false, 'ورود به حساب');
            if (err.code === 'invalid_credentials') {
                setFieldError('login-pass', 'ایمیل یا رمز عبور اشتباه است', true);
            } else {
                console.error('[Login] خطای ورود:', err.code, err);
                toast(mapAuthError(err.code), 'error');
            }
        });
});

/* =========================================================
   فراموشی رمز عبور
   -------------------------------------------------------
   پیام موفقیت اکنون حتی برای ایمیل ثبت‌نشده هم عمومی و یکسان
   نمایش داده می‌شود (الگوی استاندارد ضد enumeration)، به‌جای
   فاش کردن این‌که «حسابی با این ایمیل یافت نشد».
   ========================================================= */
window.handleForgotPassword = function () {
    const emailInput = document.getElementById('login-email');
    const email = emailInput.value.trim();
    clearFieldError('login-email');

    // SECURITY FIX: قفل هم‌زمانی + throttle مستقل (۱۵ ثانیه) — قبلاً
    // این مسیر هیچ محدودیتی نداشت و کلیک پیاپی/اسکریپت می‌توانست
    // بی‌نهایت ایمیل ریست رمز برای هر آدرسی بفرستد.
    if (isForgotInProgress) return;
    if (throttled(() => lastSubmitTsForgot, v => lastSubmitTsForgot = v, 15000)) {
        toast('کمی صبر کنید و دوباره تلاش کنید.', 'error');
        return;
    }

    if (!email) {
        setFieldError('login-email', 'برای بازیابی رمز، ابتدا ایمیل خود را وارد کنید', true);
        return;
    }
    if (!isValidEmail(email)) {
        setFieldError('login-email', 'فرمت ایمیل صحیح نیست', true);
        return;
    }

    const forgotLink = document.querySelector('.forgot-pass-link');
    isForgotInProgress = true;
    if (forgotLink) { forgotLink.style.pointerEvents = 'none'; forgotLink.style.opacity = '0.6'; }

    const genericSuccessMsg = 'اگر حسابی با این ایمیل ثبت شده باشد، لینک بازیابی رمز عبور برایش ارسال می‌شود.';
    supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login.html`
    })
        .then(({ error }) => {
            if (error) throw error;
            toast(genericSuccessMsg, 'success');
        })
        .catch(err => {
            console.error('[ForgotPassword] خطا:', err.code, err);
            toast(mapAuthError(err.code), 'error');
        })
        .finally(() => {
            isForgotInProgress = false;
            if (forgotLink) { forgotLink.style.pointerEvents = ''; forgotLink.style.opacity = ''; }
        });
};

/* =========================================================
   ثبت‌نام با ایمیل
   -------------------------------------------------------
   ساخت پروفایل هنگام ایجاد حساب انجام می‌شود و یکتایی موبایل
   با قید دیتابیس تضمین می‌شود.
   ========================================================= */
document.getElementById('registerForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    clearAllErrors('reg');

    if (document.getElementById('reg-hp').value) return; // honeypot
    if (isAuthInProgress) return;
    if (throttled(() => lastSubmitTsRegister, v => lastSubmitTsRegister = v)) return;

    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const mobile = toLatinDigits(document.getElementById('reg-mobile').value.trim());
    const pass = document.getElementById('reg-pass').value;
    const confirm = document.getElementById('reg-pass-confirm').value;

    let hasError = false;
    let firstErrorField = null;
    const markErr = (field, msg) => { setFieldError(field, msg); hasError = true; firstErrorField = firstErrorField || field; };

    if (name.length < 3) markErr('reg-name', 'نام خود را به‌درستی وارد کنید (حداقل ۳ حرف)');
    if (!email) markErr('reg-email', 'ایمیل را وارد کنید');
    else if (!isValidEmail(email)) markErr('reg-email', 'فرمت ایمیل صحیح نیست');
    if (mobile && !/^09\d{9}$/.test(mobile)) markErr('reg-mobile', 'شماره موبایل معتبر نیست');
    if (!isStrongEnoughPassword(pass)) markErr('reg-pass', 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف و عدد باشد');
    if (pass !== confirm) markErr('reg-pass-confirm', 'تکرار رمز عبور همخوانی ندارد');
    if (hasError) { const el = document.getElementById(firstErrorField); if (el) el.focus(); return; }

    lockAllAuthEntryPoints();
    setLoading('registerBtn', true);

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password: pass,
            options: {
                data: { name, mobile },
                emailRedirectTo: `${window.location.origin}/index.html`
            }
        });
        if (error) throw error;

        if (!data.session) {
            releaseAllAuthLocks();
            setLoading('registerBtn', false, 'ایجاد حساب و ورود');
            toast('برای تکمیل ثبت‌نام، پیوند تأیید ارسال‌شده به ایمیل را باز کنید.', 'success');
            return;
        }

        await finishAuth(data.user, 'registerBtn', 'ایجاد حساب و ورود');
    } catch (err) {
        releaseAllAuthLocks();
        setLoading('registerBtn', false, 'ایجاد حساب و ورود');
        console.error('[Register] خطا در ثبت‌نام:', err.code, err);
        if (err.code === 'user_already_exists') setFieldError('reg-email', mapAuthError(err.code), true);
        else if (err.code === 'weak_password') setFieldError('reg-pass', mapAuthError(err.code), true);
        else toast(mapAuthError(err.code), 'error');
    }
});

/* ورود با Google OAuth از طریق Supabase Auth */
window.handleGoogleAuth = function () {
    if (isAuthInProgress) return;
    if (throttled(() => lastSubmitTsGoogle, v => lastSubmitTsGoogle = v)) return;

    lockAllAuthEntryPoints();
    supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/index.html` }
    }).then(({ error }) => {
        if (!error) return;
        releaseAllAuthLocks();
        console.error('[GoogleAuth] خطا:', error.code, error);
        toast(mapAuthError(error.code), 'error');
    }).catch(error => {
        releaseAllAuthLocks();
        console.error('[GoogleAuth] خطا:', error);
        toast(mapAuthError(error.code), 'error');
    });
};

/* =========================================================
   UI Utilities
   ========================================================= */
window.switchTab = function (tab) {
    const isLogin = tab === 'login';
    document.getElementById('panel-login').classList.toggle('active', isLogin);
    document.getElementById('panel-register').classList.toggle('active', !isLogin);
    document.getElementById('tabLoginBtn').classList.toggle('active', isLogin);
    document.getElementById('tabRegisterBtn').classList.toggle('active', !isLogin);
    document.getElementById('tabLoginBtn').setAttribute('aria-selected', isLogin ? 'true' : 'false');
    document.getElementById('tabRegisterBtn').setAttribute('aria-selected', !isLogin ? 'true' : 'false');
};

/* توست: برای پیام‌های موفقیت role="status"/aria-live="polite" کافی
   است، اما پیام‌های خطا باید assertive/alert باشند تا فوری توسط
   screen reader اعلام شوند (قبلاً همیشه polite بود). */
let toastTimer = null;
function toast(msg, type = 'success') {
    const t = document.getElementById('loginToast');
    clearTimeout(toastTimer);
    t.innerText = msg;
    t.className = 'toast show ' + type;
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}