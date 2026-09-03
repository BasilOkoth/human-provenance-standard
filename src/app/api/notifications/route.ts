import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await createServerSupabase();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("hps_notifications")
    .select("id,notification_type,title,message,href,read_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });

  return NextResponse.json({
    notifications: data || [],
    unread: (data || []).filter((item) => !item.read_at).length,
  });
}

export async function POST(request: NextRequest) {
  const auth = await createServerSupabase();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const admin = createAdminSupabase();

  if (body.action === "mark_all_read") {
    await admin.from("hps_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "mark_read" && body.notificationId) {
    await admin.from("hps_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", body.notificationId)
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
