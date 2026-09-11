// =============================================
// Js/sentry-init.js — راه‌اندازی Sentry (فاز ۱ observability plan)
// -----------------------------------------------
// این فایل باید در <head> هر صفحه، بلافاصله بعد از تگ اسکریپت CDN
// Sentry Browser SDK و پیش از بقیه‌ی اسکریپت‌های صفحه لود شود:
//
//   <script src="https://browser.sentry-cdn.com/7.120.3/bundle.min.js" crossorigin="anonymous"></script>
//   <script src="Js/sentry-init.js"></script>
//
// با این کار Sentry به‌صورت خودکار window.onerror و
// unhandledrejection را می‌گیرد (همان Global Error Handler که قبلاً
// اصلاً وجود نداشت) و هر errorِ گرفته‌نشده در کل صفحه گزارش می‌شود.
//
// ⚠️ TODO (پوریا/پویان باید قبل از دیپلوی این را انجام دهد):
// مقدار DSN زیر را با DSN واقعی پروژه‌ی Sentry جایگزین کنید.
// بدون این مقدار، SDK غیرفعال می‌ماند و فقط fallback کنسول کار می‌کند.
// =============================================

(function () {
    var SENTRY_DSN = 'https://d4b838c24a36c39738f02651c9a70a86@o4512067545530368.ingest.de.sentry.io/4512067554705488';

    var sentryReady = false;

    if (window.Sentry && SENTRY_DSN && SENTRY_DSN !== 'YOUR_SENTRY_DSN_HERE') {
        try {
            Sentry.init({
                dsn: SENTRY_DSN,
                environment: 'production',
                // فعلاً فقط گرفتن خطا (Error Tracking)؛ tracesSampleRate پایین
                // نگه داشته شده تا فاز ۱ سبک و بدون هزینه‌ی اضافه بماند
                tracesSampleRate: 0.05
            });
            sentryReady = true;
        } catch (e) {
            console.error('[Sentry] خطا در مقداردهی اولیه:', e);
        }
    } else if (window.Sentry) {
        console.warn('[Sentry] DSN تنظیم نشده است — گزارش خطا غیرفعال است (فقط کنسول).');
    } else {
        console.warn('[Sentry] SDK از CDN لود نشد — گزارش خطا غیرفعال است (فقط کنسول).');
    }

    // =========================================================
    // window.logError — جایگزین تدریجی console.error در فاز ۲
    // -------------------------------------------------------
    // استفاده: window.logError('نام‌گذاری کانتکست', error, { extraKey: value })
    // همیشه در کنسول هم چاپ می‌شود، پس هیچ رفتار فعلی از بین نمی‌رود.
    // =========================================================
    window.logError = function (context, error, extra) {
        console.error(context, error);
        if (!sentryReady || !window.Sentry) return;
        try {
            var errObj = (error instanceof Error) ? error : new Error(String(error));
            Sentry.captureException(errObj, {
                tags: { context: context || 'unknown' },
                extra: extra || {}
            });
        } catch (e) {
            console.error('[Sentry] خطا در ارسال گزارش:', e);
        }
    };
})();
