import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// ルームメンバーへ Web Push 通知を送る
// body: { roomId, title, body, url?, excludeUserId? }
export async function POST(req: NextRequest) {
  const { roomId, title, body, url, excludeUserId } = await req.json();
  if (!roomId || !title) {
    return NextResponse.json({ error: "roomId and title required" }, { status: 400 });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!publicKey || !privateKey || !serviceRoleKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ルームメンバーの user_id を取得
  const { data: members } = await admin
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId);
  let userIds = (members ?? []).map((m) => m.user_id as string);
  if (excludeUserId) userIds = userIds.filter((id) => id !== excludeUserId);
  if (userIds.length === 0) return NextResponse.json({ sent: 0 });

  // 該当ユーザーの購読を取得
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, subscription")
    .in("user_id", userIds);

  const payload = JSON.stringify({ title, body: body ?? "", url: url ?? "/" });

  let sent = 0;
  const stale: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (row) => {
      try {
        await webpush.sendNotification(
          row.subscription as webpush.PushSubscription,
          payload
        );
        sent++;
      } catch (e: unknown) {
        // 410/404 は期限切れ購読 → 後で削除
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) stale.push(row.endpoint as string);
      }
    })
  );

  if (stale.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", stale);
  }

  return NextResponse.json({ sent });
}
