import { createAdminSupabase } from "@/lib/supabase/admin";

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export async function createHpsNotifications(input: {
  userIds: string[];
  notificationType: string;
  title: string;
  message: string;
  href?: string | null;
}) {
  const admin = createAdminSupabase();
  const userIds = unique(input.userIds);
  if (!userIds.length) return;

  const { error } = await admin.from("hps_notifications").insert(
    userIds.map((userId) => ({
      user_id: userId,
      notification_type: input.notificationType,
      title: input.title,
      message: input.message,
      href: input.href || null,
    }))
  );
  if (error) throw error;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.HPS_FROM_EMAIL;
  if (!apiKey || !from) return;

  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://human-provenance-standard.onrender.com";

  await Promise.allSettled(
    userIds.map(async (userId) => {
      const { data } = await admin.auth.admin.getUserById(userId);
      const email = data?.user?.email;
      if (!email) return;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: input.title,
          text: `${input.message}\n\nOpen HPS: ${base}${input.href || ""}`,
        }),
      });
    })
  );
}

export async function disputeRecordHolderUserIds(record: {
  owner_user_id?: string | null;
  issuer_org_id?: string | null;
}) {
  const admin = createAdminSupabase();
  const ids: string[] = [];
  if (record.owner_user_id) ids.push(record.owner_user_id);

  if (record.issuer_org_id) {
    const { data } = await admin
      .from("hps_org_members")
      .select("user_id,role,status")
      .eq("org_id", record.issuer_org_id)
      .eq("status", "active")
      .in("role", ["admin", "issuer"]);

    for (const row of data || []) if (row.user_id) ids.push(row.user_id);
  }

  return unique(ids);
}
