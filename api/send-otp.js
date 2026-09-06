import { adminDb } from './_firebaseAdmin.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// throttle ساده: حداکثر یک ارسال هر ۶۰ ثانیه برای هر uid
const OTP_TTL_MS = 5 * 60 * 1000;      // ۵ دقیقه اعتبار
const RESEND_COOLDOWN_MS = 60 * 1000;  // ۶۰ ثانیه بین دو ارسال

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // ۶ رقم
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Buffer.from(buf).toString('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, email } = req.body || {};
  if (!uid || !email || typeof email !== 'string') {
    return res.status(400).json({ error: 'uid و email الزامی است' });
  }

  const otpRef = adminDb.collection('emailOtps').doc(uid);

  try {
    const existing = await otpRef.get();
    if (existing.exists) {
      const data = existing.data();
      if (data.lastSentAt && Date.now() - data.lastSentAt < RESEND_COOLDOWN_MS) {
        return res.status(429).json({ error: 'لطفاً کمی صبر کنید و دوباره تلاش کنید' });
      }
    }

    const code = generateOtp();
    const codeHash = await sha256Hex(code);

    await otpRef.set({
      codeHash,
      email,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      lastSentAt: Date.now()
    });

    await resend.emails.send({
      from: process.env.OTP_SENDER_EMAIL,
      to: email,
      subject: 'کد تأیید ایمیل شما در SHOP',
      html: `<div dir="rtl" style="font-family:sans-serif;">
        <p>کد تأیید شما:</p>
        <h2 style="letter-spacing:4px;">${code}</h2>
        <p>این کد تا ۵ دقیقه دیگر معتبر است.</p>
      </div>`
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send-otp error:', e);
    return res.status(500).json({ error: 'خطا در ارسال کد تأیید' });
  }
}