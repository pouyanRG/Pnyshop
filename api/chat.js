import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, reply: 'Method Not Allowed' });
  }

  try {
    const { message, history, userProfile, productsCatalog } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        reply: 'کلید GEMINI_API_KEY در تنظیمات Vercel تعریف نشده است.'
      });
    }

    if (!message) {
      return res.status(400).json({ success: false, reply: 'پیام کاربر یافت نشد.' });
    }

    // ساخت دستورالعمل سیستم به همراه کاتالوگ محصولات و پروفایل کاربر
    let systemInstruction = 'شما دستیار هوشمند و پشتیبان خریداران فروشگاه هستید. صمیمی، محترمانه و به زبان فارسی پاسخ دهید.';

    if (productsCatalog && productsCatalog.length > 0) {
      systemInstruction += `\n\nکاتالوگ محصولات فروشگاه:\n${JSON.stringify(productsCatalog, null, 2)}`;
    }

    if (userProfile) {
      systemInstruction += `\n\nمشخصات کاربر فعلی:\n${JSON.stringify(userProfile, null, 2)}`;
    }

    // تبدیل تاریخچه پیام‌ها به ساختار استاندارد Gemini
    const contents = [];
    if (Array.isArray(history)) {
      history.forEach(item => {
        contents.push({
          role: item.role === 'bot' || item.role === 'model' ? 'model' : 'user',
          parts: [{ text: item.text }]
        });
      });
    }

    // افزودن پیام جدید کاربر
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // فراخوانی Gemini API
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return res.status(200).json({
      success: true,
      reply: response.text
    });

  } catch (error) {
    console.error('خطا در اجرای /api/chat:', error);
    return res.status(500).json({
      success: false,
      reply: error.message || 'خطای داخلی سرور رخ داده است.'
    });
  }
}