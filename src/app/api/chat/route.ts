import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { success: false, reply: "کلید GEMINI_API_KEY در تنظیمات سرور تعریف نشده است." },
        { status: 500 },
      );
    }

    const body = await request.json() as {
      message?: string;
      history?: Array<{ role: string; text: string }>;
      userProfile?: unknown;
      productsCatalog?: unknown;
    };
    if (!body.message?.trim()) {
      return Response.json(
        { success: false, reply: "پیام کاربر یافت نشد." },
        { status: 400 },
      );
    }

    let systemInstruction =
      "شما دستیار هوشمند و پشتیبان خریداران فروشگاه PnySHOP هستید. صمیمی، محترمانه و فقط به فارسی پاسخ دهید.";
    if (Array.isArray(body.productsCatalog) && body.productsCatalog.length > 0) {
      systemInstruction += `\n\nکاتالوگ واقعی فروشگاه:\n${JSON.stringify(body.productsCatalog)}`;
    }
    if (body.userProfile) {
      systemInstruction += `\n\nمشخصات کاربر فعلی:\n${JSON.stringify(body.userProfile)}`;
    }

    const ai = new GoogleGenAI({ apiKey });
    const contents = (body.history ?? []).slice(-8).map((item) => ({
      role: item.role === "bot" || item.role === "model" ? "model" : "user",
      parts: [{ text: item.text }],
    }));
    contents.push({
      role: "user",
      parts: [{ text: body.message.trim() }],
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: { systemInstruction },
    });

    return Response.json({ success: true, reply: response.text });
  } catch (error) {
    console.error("AI chat API failed:", error);
    return Response.json(
      {
        success: false,
        reply: error instanceof Error ? error.message : "خطای داخلی سرور رخ داده است.",
      },
      { status: 500 },
    );
  }
}
