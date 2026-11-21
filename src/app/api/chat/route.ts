import { GoogleGenAI } from "@google/genai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  if (error) {
    console.error("Could not enforce AI chat rate limit:", error);
    return false;
  }
  return data === true;
}

type ChatMessage = { role: string; text: string };

function getProviderStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  return typeof error.status === "number" ? error.status : undefined;
}

async function getCatalogContext(): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: products, error } = await supabase
      .from("products")
      .select("id,name,price,discount,stock,category")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      console.error("Could not load AI chat catalog:", error);
      return "کاتالوگ فروشگاه فعلاً در دسترس نیست؛ قیمت، موجودی یا ویژگی محصولات را حدس نزنید.";
    }

    const catalog = (products ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      price: Math.round(product.price * (1 - product.discount / 100)),
      stock: product.stock,
      category: product.category,
    }));
    return `کاتالوگ فعلی محصولات فعال فروشگاه:\n${JSON.stringify(catalog)}`;
  } catch (error) {
    console.error("Could not prepare AI chat catalog:", error);
    return "کاتالوگ فروشگاه فعلاً در دسترس نیست؛ قیمت، موجودی یا ویژگی محصولات را حدس نزنید.";
  }
}

async function getOrderContext(message: string): Promise<string> {
  if (!/سفارش|مرسوله|پیگیری/.test(message)) return "";

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Could not verify AI chat user:", authError);
      return "اطلاعات سفارش برای این درخواست قابل تأیید نیست. از کاربر بخواهید وارد حساب کاربری خود شود و وضعیت را از بخش پروفایل بررسی کند.";
    }
    if (!user) {
      return "کاربر وارد حساب نشده است؛ هیچ اطلاعات سفارش در اختیار شما نیست. برای پیگیری سفارش، از او بخواهید وارد حساب کاربری شود و بخش پروفایل را بررسی کند.";
    }

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id,status,total_amount,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (ordersError) {
      console.error("Could not load AI chat orders:", ordersError);
      return "اطلاعات سفارش فعلاً در دسترس نیست. وضعیت سفارش را حدس نزنید و کاربر را به صفحه پروفایل راهنمایی کنید.";
    }
    if (!orders?.length) {
      return "برای این حساب سفارش ثبت‌شده‌ای پیدا نشد. سفارش یا وضعیت فرضی نسازید.";
    }

    return `سفارش‌های اخیر تأییدشده برای کاربر واردشده (شناسه، وضعیت، مبلغ به تومان، زمان ثبت):\n${JSON.stringify(orders)}`;
  } catch (error) {
    console.error("Could not prepare AI chat order context:", error);
    return "اطلاعات سفارش فعلاً قابل دریافت نیست. وضعیت سفارش را حدس نزنید و کاربر را به صفحه پروفایل راهنمایی کنید.";
  }
}

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
      "شما دستیار هوشمند و پشتیبان خریداران فروشگاه Pnyshop هستید. صمیمی، محترمانه و فقط به فارسی پاسخ دهید. موجودی، قیمت، ویژگی محصول، وضعیت سفارش، قوانین ارسال یا بازگشت کالا را حدس نزنید؛ فقط بر اساس اطلاعات ارائه‌شده پاسخ دهید و اگر اطلاعات کافی نیست، صریح بگویید و راهنمایی کنید از پروفایل یا پشتیبانی فروشگاه بررسی کنند.";
    systemInstruction += `\n\n${await getCatalogContext()}`;
    systemInstruction += `\n\n${await getOrderContext(body.message.trim())}`;

    const ai = new GoogleGenAI({ apiKey });
    const contents = history.map((item) => ({
      role: item.role === "assistant" || item.role === "bot" || item.role === "model"
        ? "model"
        : "user",
      parts: [{ text: item.text }],
    }));
    contents.push({
      role: "user",
      parts: [{ text: body.message.trim() }],
    });

    let response;
    try {
      const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
      const models = Array.from(new Set([configuredModel, "gemini-3.5-flash-lite"]));
      for (const [index, model] of models.entries()) {
        try {
          response = await ai.models.generateContent({
            model,
            contents,
            config: { systemInstruction },
          });
          break;
        } catch (error) {
          const status = getProviderStatus(error);
          if (index === models.length - 1 || (status !== 403 && status !== 404)) {
            throw error;
          }
          console.error(`Gemini model ${model} is unavailable; trying the stable fallback.`);
        }
      }
    } catch (error) {
      console.error("Gemini chat generation failed:", error);
      const status = getProviderStatus(error);
      const reply = status === 403 || status === 404
        ? "دسترسی به مدل Gemini تنظیم‌شده برقرار نیست. کلید Gemini API و مقدار GEMINI_MODEL را بررسی کنید."
        : status === 429
          ? "سهمیه درخواست‌های Gemini به پایان رسیده است. کمی بعد دوباره تلاش کنید."
          : "دستیار هوشمند موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.";
      return Response.json(
        { success: false, reply },
        { status: 502 },
      );
    }

    if (!response) {
      return Response.json(
        { success: false, reply: "پاسخی از دستیار دریافت نشد. لطفاً دوباره تلاش کنید." },
        { status: 502 },
      );
    }

    const reply = response.text?.trim();
    if (!reply) {
      return Response.json(
        { success: false, reply: "پاسخی از دستیار دریافت نشد. لطفاً دوباره تلاش کنید." },
        { status: 502 },
      );
    }
    return Response.json({ success: true, reply });
  } catch (error) {
    console.error("AI chat API failed:", error);
    return Response.json(
      {
        success: false,
        reply: "در پردازش درخواست مشکلی رخ داد. لطفاً کمی بعد دوباره تلاش کنید.",
      },
      { status: 500 },
    );
  }
}
