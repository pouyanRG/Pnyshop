// =============================================
// LOGIN / REGISTER LOGIC — استخراج‌شده از login.html
// -----------------------------------------------
// این فایل خودش یک ماژول کامل و مستقل است (بر خلاف بقیه‌ی صفحات از
// الگوی window.fb* استفاده نمی‌کند، چون امضای احراز هویتش کاملاً
// اختصاصی و متفاوت از بقیه‌ی صفحات است: signInWithPopup،
// GoogleAuthProvider، sendPasswordResetEmail، deleteUser و ...).
// در login.html با <script type="module" src="Js/login.js"></script> لود شود.
// =============================================
import { auth, db } from "./firebase-config.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    sendEmailVerification,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    deleteUser
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, limit
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

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
        'auth/invalid-email': 'فرمت ایمیل وارد شده صحیح نیست',
        'auth/user-not-found': 'ایمیل یا رمز عبور اشتباه است',
        'auth/wrong-password': 'ایمیل یا رمز عبور اشتباه است',
        'auth/invalid-credential': 'ایمیل یا رمز عبور اشتباه است',
        'auth/email-already-in-use': 'این ایمیل قبلاً ثبت‌نام کرده است. وارد شوید.',
        'auth/weak-password': 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف و عدد باشد',
        'auth/too-many-requests': 'تعداد تلاش‌های ناموفق زیاد بود. کمی صبر کنید.',
        'auth/popup-closed-by-user': 'پنجره ورود بسته شد',
        'auth/popup-blocked': 'مرورگر شما پنجره ورود را مسدود کرد؛ در حال هدایت مستقیم...',
        'auth/network-request-failed': 'خطا در اتصال به شبکه. اتصال اینترنت را بررسی کنید.'
    };
    const msg = map[code];
    if (!msg) {
        // کدهای ناشناخته دیگر بی‌صدا بلعیده نمی‌شوند؛ برای دیباگ لاگ می‌شوند
        console.error('[Auth] کد خطای ناشناخته Firebase:', code);
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
   رشته‌ای مثل "abc" مستقیم به Firebase ارسال می‌شد.
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
   ایجاد/به‌روزرسانی پروفایل کاربر در Firestore
   ========================================================= */
async function ensureUserProfile(user, extra = {}) {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        await setDoc(ref, {
            uid: user.uid,
            email: user.email || '',
            name: extra.name || user.displayName || '',
            mobile: extra.mobile || '',
            melli: '', address: '', post: '',
            wallet: 0, points: 0,
            cart: [], wishlist: [], orders: [],
            emailVerified: !!user.emailVerified,
            createdAt: serverTimestamp()
        });
    }
}

/* =========================================================
   بررسی یکتا بودن شماره موبایل قبل از ثبت‌نام
   -------------------------------------------------------
   ⚠️ محدودیت شناخته‌شده: طبق firestore.rules فعلی، خواندن
   سند users/{uid} فقط برای owner یا admin مجاز است؛ کاربر
   تازه‌وارد (هنوز احراز هویت نشده) اجازه‌ی این کوئری روی
   اسناد کاربران دیگر را ندارد و Firestore با permission-denied
   پاسخ می‌دهد. اجرای واقعی و امنِ این قانون فقط با یکی از این دو
   راه ممکن است: (الف) یک Cloud Function که با دسترسی ادمین
   موبایل را چک کند، یا (ب) یک کالکشن عمومیِ فقط-شناسه مثل
   mobileIndex/{mobile} که صرفاً «تکراری بودن» را افشا کند، نه
   کل پروفایل کاربر — که هر دو نیازمند تغییر firestore.rules
   هستند و خارج از این فایل است.
   تا آن زمان، خطای دسترسی به‌صورت شفاف لاگ می‌شود (نه بلعیده‌
   شدن بی‌صدا) و رفتار محافظه‌کارانه‌ی فعلی (عدم مسدودسازی
   ثبت‌نام در صورت خطا) با آگاهی کامل حفظ شده است.
   ========================================================= */
async function isMobileTaken(mobile) {
    if (!mobile) return false;
    try {
        const q = query(collection(db, 'users'), where('mobile', '==', mobile), limit(1));
        const snap = await getDocs(q);
        return !snap.empty;
    } catch (e) {
        console.error('[MobileCheck] خطا در بررسی یکتایی شماره موبایل (احتمالاً permission-denied طبق firestore.rules فعلی):', e.code || e);
        return false; // در صورت خطا مانع ثبت‌نام نمی‌شویم (تصمیم آگاهانه، نه سکوت)
    }
}

/* پل موقت با سیستم قدیمی مبتنی بر localStorage */
function bridgeSession(user) {
    localStorage.setItem('current_user', user.uid);
}

/* =========================================================
   finishAuth اکنون async است و خطای واقعی ensureUserProfile را
   می‌بلعد نه با .finally() (که قبلاً چه موفق چه ناموفق، کاربر
   را ریدایرکت می‌کرد). اگر ساخت پروفایل شکست بخورد، کاربر در
   Firebase Auth لاگین می‌ماند اما به‌جای ریدایرکت کور به
   index.html (که بعداً توسط profile.html/sabad.html به‌خاطر
   نبود سند users/{uid} به همین صفحه پرت می‌شد)، خطای واقعی
   نمایش داده و دکمه فعال می‌شود تا کاربر بتواند دوباره تلاش کند.
   ========================================================= */
async function finishAuth(user, extra = {}, activeBtnId, activeBtnLabel) {
    try {
        await ensureUserProfile(user, extra);
        bridgeSession(user);
        toast('خوش آمدید! در حال انتقال...', 'success');
        setTimeout(() => window.location.href = 'index.html', 1200);
    } catch (err) {
        console.error('[Profile] خطا در ساخت/خواندن پروفایل کاربر در Firestore:', err && err.code, err);
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
   قربانی + مصرف بی‌رویه‌ی کوتای Firebase). حالا throttle + قفل
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
    signInWithEmailAndPassword(auth, email, pass)
        .then(cred => finishAuth(cred.user, {}, 'loginBtn', 'ورود به حساب'))
        .catch(err => {
            releaseAllAuthLocks();
            setLoading('loginBtn', false, 'ورود به حساب');
            // پیام یکسان و عمومی برای هر سه کد خطا تا وجود/عدم‌وجود
            // حساب با این ایمیل افشا نشود (جلوگیری از account enumeration)
            if (err.code === 'auth/invalid-email' || err.code === 'auth/user-not-found' ||
                err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                console.error('[Login] کد خطای واقعی Firebase (فقط برای دیباگ، به کاربر نشان داده نمی‌شود):', err.code);
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
    sendPasswordResetEmail(auth, email)
        .then(() => { toast(genericSuccessMsg, 'success'); })
        .catch(err => {
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
                // پیام یکسان نمایش داده می‌شود؛ کد واقعی فقط در کنسول لاگ می‌شود
                console.error('[ForgotPassword] کد خطای واقعی:', err.code);
                toast(genericSuccessMsg, 'success');
            } else {
                console.error('[ForgotPassword] خطا:', err.code, err);
                toast(mapAuthError(err.code), 'error');
            }
        })
        .finally(() => {
            isForgotInProgress = false;
            if (forgotLink) { forgotLink.style.pointerEvents = ''; forgotLink.style.opacity = ''; }
        });
};

/* =========================================================
   ثبت‌نام با ایمیل
   -------------------------------------------------------
   بهبود کارایی: بررسی یکتایی موبایل و ساخت حساب Firebase
   اکنون به‌صورت موازی (Promise.all) اجرا می‌شوند نه پشت‌سرهم؛
   اگر (در آینده با تغییر قوانین Firestore) مشخص شد موبایل
   تکراری است، حساب Auth تازه‌ساخته‌شده بلافاصله حذف (rollback)
   و خطا به کاربر نشان داده می‌شود.
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
        // هر دو عملیات (چک موبایل + ساخت حساب) به‌صورت موازی شروع می‌شوند
        const mobileCheckPromise = mobile ? isMobileTaken(mobile) : Promise.resolve(false);
        const createUserPromise = createUserWithEmailAndPassword(auth, email, pass);

        const [mobileTaken, cred] = await Promise.all([mobileCheckPromise, createUserPromise]);

        if (mobileTaken) {
            // rollback: حساب Auth تازه‌ساخته‌شده حذف می‌شود چون موبایل تکراری بود
            try { await deleteUser(cred.user); } catch (delErr) { console.error('[Register] خطا در rollback حساب:', delErr); }
            releaseAllAuthLocks();
            setLoading('registerBtn', false, 'ایجاد حساب و ورود');
            setFieldError('reg-mobile', 'این شماره موبایل قبلاً ثبت شده است', true);
            return;
        }

        await updateProfile(cred.user, { displayName: name });
        // ارسال ایمیل تأیید — عدم موفقیت در ارسال نباید جلوی ثبت‌نام را بگیرد
        sendEmailVerification(cred.user).catch(err => console.warn('[Register] ارسال ایمیل تأیید ناموفق بود:', err));
        await finishAuth(cred.user, { name, mobile }, 'registerBtn', 'ایجاد حساب و ورود');
    } catch (err) {
        releaseAllAuthLocks();
        setLoading('registerBtn', false, 'ایجاد حساب و ورود');
        console.error('[Register] خطا در ثبت‌نام:', err.code, err);
        if (err.code === 'auth/email-already-in-use') setFieldError('reg-email', mapAuthError(err.code), true);
        else if (err.code === 'auth/invalid-email') setFieldError('reg-email', mapAuthError(err.code), true);
        else if (err.code === 'auth/weak-password') setFieldError('reg-pass', mapAuthError(err.code), true);
        else toast(mapAuthError(err.code), 'error');
    }
});

/* =========================================================
   ورود با گوگل — با fallback به redirect در صورت مسدود شدن popup
   ========================================================= */
window.handleGoogleAuth = function () {
    if (isAuthInProgress) return;
    if (throttled(() => lastSubmitTsGoogle, v => lastSubmitTsGoogle = v)) return;

    lockAllAuthEntryPoints();
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
        .then(cred => finishAuth(cred.user, {}, null, null))
        .catch(err => {
            if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
                toast(mapAuthError('auth/popup-blocked'), 'error');
                signInWithRedirect(auth, provider).catch(redirectErr => {
                    console.error('[GoogleAuth] خطا در هدایت redirect:', redirectErr);
                    releaseAllAuthLocks();
                });
                return;
            }
            releaseAllAuthLocks();
            // این دو کد یعنی کاربر خودش پنجره را بست/لغو کرد — رفتار طبیعی
            // است، نه خطای واقعی، پس toast نشان داده نمی‌شود
            if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
                console.error('[GoogleAuth] خطا:', err.code, err);
                toast(mapAuthError(err.code), 'error');
            }
        });
};

// در صورتی که ورود گوگل از طریق redirect انجام شده، نتیجه را هنگام بازگشت به صفحه بگیر
getRedirectResult(auth).then(result => {
    if (result && result.user) finishAuth(result.user, {}, null, null);
}).catch(err => {
    if (err && err.code) {
        console.error('[GoogleAuth][Redirect] خطا:', err.code, err);
        toast(mapAuthError(err.code), 'error');
    }
});

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