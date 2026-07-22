import { createHash } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// listUsers はページネーション必須（デフォルト50件のみ）。
// 全ページを走査して email 一致のユーザーを探す。
export async function findUserByEmail(
  supabaseAdmin: SupabaseClient,
  email: string
): Promise<User | null> {
  const perPage = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const match = data.users.find((u) => u.email === email);
    if (match) return match;
    if (data.users.length < perPage) return null; // 最終ページ
  }
  return null;
}

// リセットコードは平文で保存せず sha256 ハッシュで保持する
export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}
