import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

function configuredAdminEmails() {
  return (process.env.HPS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireHpsAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, status: 401, error: "Authentication required." };
  }

  const email = user.email?.trim().toLowerCase();
  const adminEmails = configuredAdminEmails();

  if (!email || !adminEmails.includes(email)) {
    return { ok: false as const, status: 403, error: "HPS administrator access required." };
  }

  return { ok: true as const, user };
}
