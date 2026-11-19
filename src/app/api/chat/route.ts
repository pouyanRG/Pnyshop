import { GoogleGenAI } from "@google/genai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 16;

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "global";
}

async function isAllowed(key: string): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    "consume_api_rate_limit",
    {
      p_rate_key: `chat:${key}`,
      p_window_seconds: 300,
      p_max_requests: 20,
    },
  );
  if (error) return false;
  return data === true;
}

type ChatMessage = { role: string; text: string };

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { success: false, reply: "کلید GEMINI_API_KEY در تنظیمات سرور تعریف نشده است." },
        { status: 500 },
      );
    }

    if (!(await isAllowed(clientKey(request)))) {
      return Response.json(
        {
          success: false,
          reply: "تعداد درخواست‌ها به حد مجاز رسیده است. کمی بعد دوباره تلاش کنید.",
        },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      message?: unknown;
      history?: unknown;
      userProfile?: unknown;
      productsCatalog?: unknown;
    } | null;

    if (!body || typeof body.message !== "string" || !body.message.trim()) {
      return Response.json(
        { success: false, reply: "پیام کاربر یافت نشد." },
        { status: 400 },
      );
    }
    if (body.message.length > MAX_MESSAGE_LENGTH) {
      return Response.json(
        { success: false, reply: "طول پیام بیش از حد مجاز است." },
        { status: 400 },
      );
    }

    const history: ChatMessage[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (item): item is ChatMessage =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as { role?: unknown }).role === "string" &&
              typeof (item as { text?: unknown }).text === "string" &&
              (item as { text: string }).text.length <= MAX_MESSAGE_LENGTH,
          )
          .slice(-8)
      : [];

    if (Array.isArray(body.history) && body.history.length > MAX_HISTORY_ITEMS) {
      return Response.json(
        { success: false, reply: "طول تاریخچهٔ گفتگو بیش از حد مجاز است." },
        { status: 400 },
      );
    }

    let systemInstruction =
      "شما دستیار هوشمند و پشتیبان خریداران فروشگاه Pnyshop هستید. صمیمی، محترمانه و فقط به فارسی پاسخ دهید.";
    if (Array.isArray(body.productsCatalog) && body.productsCatalog.length > 0) {
      systemInstruction += `\n\nکاتالوگ واقعی فروشگاه:\n${JSON.stringify(body.productsCatalog)}`;
    }
    if (body.userProfile) {
      systemInstruction += `\n\nمشخصات کاربر فعلی:\n${JSON.stringify(body.userProfile)}`;
    }

    const ai = new GoogleGenAI({ apiKey });
    const contents = history.map((item) => ({
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
