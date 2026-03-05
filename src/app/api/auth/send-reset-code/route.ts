import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── リセットコードを回復用メールに送信 ──
export async function POST(req: Request) {
    try {
        const { username } = await req.json();

        if (!username?.trim()) {
            return NextResponse.json({ error: "ユーザー名を入力してください" }, { status: 400 });
        }

        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
            return NextResponse.json({ error: "サーバー設定エラー" }, { status: 500 });
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const authEmail = `${username.trim().toLowerCase()}@kokomap.app`;
        const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) {
            return NextResponse.json({ error: "ユーザー検索に失敗しました" }, { status: 500 });
        }

        const user = users.users.find((u) => u.email === authEmail);
        if (!user) {
            return NextResponse.json({ error: "このユーザー名は登録されていません" }, { status: 404 });
        }

        const recoveryEmail = user.user_metadata?.recovery_email;
        if (!recoveryEmail) {
            return NextResponse.json(
                { error: "このアカウントにはメールアドレスが登録されていません。ログイン後に登録してください。" },
                { status: 403 }
            );
        }

        // 6桁のリセットコードを生成
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10分後

        // user_metadata にコードと有効期限を保存
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
                ...user.user_metadata,
                reset_code: code,
                reset_code_expires: expiresAt,
            },
        });

        if (updateError) {
            return NextResponse.json({ error: "コード生成に失敗しました" }, { status: 500 });
        }

        // Resend API でメール送信
        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) {
            return NextResponse.json({ error: "メール送信設定エラー: RESEND_API_KEY が未設定です" }, { status: 500 });
        }

        const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
                from: "KokoMap <onboarding@resend.dev>",
                to: [recoveryEmail],
                subject: "【KokoMap】パスワードリセットコード",
                html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
            <h2 style="text-align: center; color: #333;">🗺️ KokoMap</h2>
            <p>パスワードリセットのリクエストを受け付けました。</p>
            <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; text-align: center; margin: 16px 0;">
              <p style="font-size: 12px; color: #666; margin: 0 0 8px;">リセットコード</p>
              <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 0; color: #111;">${code}</p>
            </div>
            <p style="font-size: 13px; color: #666;">このコードは10分間有効です。心当たりがない場合はこのメールを無視してください。</p>
          </div>
        `,
            }),
        });

        if (!emailRes.ok) {
            const errorText = await emailRes.text();
            console.error("Resend API Error:", errorText);
            return NextResponse.json({ error: "メール送信に失敗しました" }, { status: 500 });
        }

        // メールアドレスの一部をマスクして返す
        const [local, domain] = recoveryEmail.split("@");
        const masked = local.slice(0, 2) + "***@" + domain;

        return NextResponse.json({ success: true, maskedEmail: masked });
    } catch {
        return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
    }
}
