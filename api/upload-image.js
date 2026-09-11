// =============================================
// api/upload-image.js — Vercel Serverless Function
// -----------------------------------------------
// FIX امنیتی (فاز ۰ observability plan): قبلاً IMGBB_API_KEY به‌صورت
// plaintext داخل Js/admin.js (کد کلاینت) قرار داشت و در View Source
// برای هرکسی قابل مشاهده/سوءاستفاده بود. از این پس کلید فقط اینجا،
// روی سرور و از process.env خوانده می‌شود — دقیقاً هم‌الگو با
// GEMINI_API_KEY در api/chat.js.
//
// ورودی مورد انتظار (JSON body): { image: "<base64 بدون پیشوند data:...>" }
// خروجی موفق: { success: true, url: "..." }
// خروجی ناموفق با کلید تنظیم‌نشده: { success: false, code: 'MISSING_CONFIG', message: "..." }
// =============================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

    if (!IMGBB_API_KEY) {
      return res.status(500).json({
        success: false,
        code: 'MISSING_CONFIG',
        message: 'کلید IMGBB_API_KEY در تنظیمات Vercel تعریف نشده است.'
      });
    }

    const { image } = req.body || {};

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, message: 'تصویری برای آپلود ارسال نشده است.' });
    }

    // محدودیت ساده‌ی اندازه (base64 خام)؛ جلوگیری از سوءاستفاده/درخواست‌های غول‌آسا
    // ~ حدود ۱۲ مگابایت فایل اصلی پیش از base64
    if (image.length > 16 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: 'حجم تصویر بیش از حد مجاز است.' });
    }

    const formData = new URLSearchParams();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', image);
    // expiration عمداً ارسال نمی‌شود تا لینک برای همیشه (نه موقت) معتبر بماند

    const uploadRes = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const json = await uploadRes.json();

    if (!uploadRes.ok || !json.success) {
      console.error('خطای پاسخ ImgBB:', json);
      return res.status(502).json({ success: false, message: 'آپلود تصویر به ImgBB ناموفق بود.' });
    }

    return res.status(200).json({
      success: true,
      url: json.data.url
    });

  } catch (error) {
    // نکته: در فاز ۳ این خط با Sentry.captureException(error) تکمیل می‌شود
    console.error('خطا در اجرای /api/upload-image:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'خطای داخلی سرور رخ داده است.'
    });
  }
}
