import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabase();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const loginUrl = new URL(
        "/login",
        process.env.NEXT_PUBLIC_APP_URL ??
          "https://human-provenance-standard.onrender.com"
      );

      loginUrl.searchParams.set("error", error.message);

      return NextResponse.redirect(loginUrl);
    }
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://human-provenance-standard.onrender.com";

  return NextResponse.redirect(
    new URL("/account", appUrl)
  );
}
