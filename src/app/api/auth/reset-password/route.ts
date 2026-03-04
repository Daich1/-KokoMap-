import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── リセットコード検証 + パスワード更新 ──
export async function POST(req: Request) {
    try {
        const { username, code, newPassword } = await req.json();

        if (!username || !code || !newPassword) {
            return NextResponse.json(
                { error: "全ての項目を入力してください" },
                { status: 400 }
            );
        }

        if (newPassword.length < 6) {
            return NextResponse.json(
                { error: "パスワードは6文字以上で入力してください" },
                { status: 400 }
            );
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

        // コードの検証
        const storedCode = user.user_metadata?.reset_code;
        const expiresAt = user.user_metadata?.reset_code_expires;

        if (!storedCode || !expiresAt) {
            return NextResponse.json({ error: "リセットコードが発行されていません" }, { status: 403 });
        }

        if (new Date(expiresAt) < new Date()) {
            return NextResponse.json({ error: "リセットコードの有効期限が切れています。再度コードを送信してください。" }, { status: 403 });
        }

        if (storedCode !== code.trim()) {
            return NextResponse.json({ error: "リセットコードが正しくありません" }, { status: 403 });
        }

        // パスワードを更新 & コードをクリア
        const meta = { ...user.user_metadata };
        delete meta.reset_code;
        delete meta.reset_code_expires;

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            password: newPassword,
            user_metadata: meta,
        });

        if (updateError) {
            return NextResponse.json({ error: "パスワードの更新に失敗しました" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
    }
}
