import { adminDb } from './_firebaseAdmin.js';

const MAX_ATTEMPTS = 5;

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Buffer.from(buf).toString('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, code } = req.body || {};
  if (!uid || !code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'کد وارد شده نامعتبر است' });
  }

  const otpRef = adminDb.collection('emailOtps').doc(uid);

  try {
    const snap = await otpRef.get();
    if (!snap.exists) return res.status(400).json({ error: 'کدی برای این حساب یافت نشد. دوباره درخواست بدهید' });

    const data = snap.data();

    if (Date.now() > data.expiresAt) {
      await otpRef.delete();
      return res.status(400).json({ error: 'کد منقضی شده است. کد جدید درخواست کنید' });
    }

    if ((data.attempts || 0) >= MAX_ATTEMPTS) {
      await otpRef.delete();
      return res.status(429).json({ error: 'تعداد تلاش‌ها بیش از حد مجاز است. کد جدید درخواست کنید' });
    }

    const inputHash = await sha256Hex(code);
    if (inputHash !== data.codeHash) {
      await otpRef.update({ attempts: (data.attempts || 0) + 1 });
      return res.status(400).json({ error: 'کد وارد شده صحیح نیست' });
    }

    // موفق: کد مصرف می‌شود و پروفایل کاربر تأیید می‌شود
    await adminDb.collection('users').doc(uid).update({ emailVerifiedCustom: true });
    await otpRef.delete();

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('verify-otp error:', e);
    return res.status(500).json({ error: 'خطا در بررسی کد' });
  }
}