import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfilePage } from "./profile-page";

export const metadata: Metadata = {
  title: "پروفایل کاربری | SHOP",
  description: "مدیریت اطلاعات حساب و مشاهده سفارش‌های Pnyshop",
};

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const { error: ensureProfileError } = await supabase.rpc(
    "ensure_current_user_profile",
  );
  if (ensureProfileError) {
    console.error("Could not ensure the signed-in user's profile:", ensureProfileError);
  }

  const [profileResult, ordersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id,name,mobile,melli,address,postal_code,wallet,points,created_at,wishlist",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id,status,total_amount,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (profileResult.error) {
    console.error("Could not load the signed-in user's profile:", profileResult.error);
  }
  if (ordersResult.error) {
    console.error("Could not load the signed-in user's orders:", ordersResult.error);
  }

  return (
    <ProfilePage
      email={user.email ?? ""}
      profile={profileResult.data}
      orders={ordersResult.data ?? []}
      profileUnavailable={Boolean(profileResult.error || !profileResult.data)}
      ordersUnavailable={Boolean(ordersResult.error)}
    />
  );
}
