import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── 回復用メールアドレスの登録・更新 ──
// ログイン中のユーザーが自分の回復用メールを登録する
export async function POST(req: Request) {
    try {
        const { userId, recoveryEmail } = await req.json();

        if (!userId || !recoveryEmail) {
            return NextResponse.json(
                { error: "ユーザーIDとメールアドレスを入力してください" },
                { status: 400 }
            );
        }

        // メールアドレスの簡易バリデーション
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recoveryEmail.trim())) {
            return NextResponse.json(
                { error: "有効なメールアドレスを入力してください" },
                { status: 400 }
            );
        }

        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
            return NextResponse.json(
                { error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" },
                { status: 500 }
            );
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        // ユーザーを取得して既存のメタデータを保持しつつ recovery_email を追加
        const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (getUserError || !userData.user) {
            return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
        }

        const existingMeta = userData.user.user_metadata ?? {};

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
                ...existingMeta,
                recovery_email: recoveryEmail.trim().toLowerCase(),
            },
        });

        if (updateError) {
            return NextResponse.json({ error: "メールアドレスの登録に失敗しました" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
    }
}
