"use client";

import { useState } from "react";
import { Loader2, MapPin, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

interface AuthScreenProps {
  onAuth: (user: User) => void;
}

type Mode = "login" | "signup";

// ユーザー名を内部メールアドレスに変換
function toEmail(username: string) {
  return `${username.trim().toLowerCase()}@kokomap.app`;
}

export function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const usernameOk = /^[a-zA-Z0-9_\u3000-\u9fff\u3040-\u30ff]{1,20}$/.test(username.trim());
  const passwordOk = password.length >= 6;

  async function handleSubmit() {
    setError("");
    if (!username.trim()) { setError("ユーザー名を入力してください"); return; }
    if (!passwordOk) { setError("パスワードは6文字以上で入力してください"); return; }
    if (mode === "signup" && password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setIsLoading(true);
    const email = toEmail(username);

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() } },
        });

        if (signUpError) {
          if (signUpError.message.includes("already registered") || signUpError.message.includes("already been registered")) {
            setError("このユーザー名はすでに使われています");
          } else {
            setError(signUpError.message);
          }
          setIsLoading(false);
          return;
        }

        if (data.user) {
          onAuth(data.user);
        } else {
          // メール確認が必要な場合（Supabase設定による）
          setError("Supabase ダッシュボードで「メール確認を無効化」してください（Authentication → Settings）");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

        if (signInError) {
          if (signInError.message.includes("Invalid login")) {
            setError("ユーザー名またはパスワードが違います");
          } else {
            setError(signInError.message);
          }
          setIsLoading(false);
          return;
        }

        if (data.user) onAuth(data.user);
      }
    } catch {
      setError("接続に失敗しました。もう一度お試しください");
    }
    setIsLoading(false);
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-6">
      {/* ロゴ */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center shadow-inner">
          <MapPin className="size-10 text-primary" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">KokoMap</h1>
          <p className="text-sm text-muted-foreground mt-0.5">グループでスポットをリアルタイム共有</p>
        </div>
      </div>

      {/* タブ */}
      <div className="flex w-full max-w-xs bg-gray-100 rounded-xl p-1 mb-5">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-semibold transition-all",
              mode === m ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            {m === "login" ? "ログイン" : "新規登録"}
          </button>
        ))}
      </div>

      {/* フォーム */}
      <div className="w-full max-w-xs flex flex-col gap-3">
        {/* ユーザー名 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">ユーザー名</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例: taro"
            maxLength={20}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full border rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
          />
          {mode === "signup" && (
            <p className="text-xs text-muted-foreground">英数字・日本語・アンダースコア、20文字以内</p>
          )}
        </div>

        {/* パスワード */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">パスワード</label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6文字以上"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full border rounded-xl px-4 py-3 pr-11 text-base outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {/* パスワード確認（新規登録のみ） */}
        {mode === "signup" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">パスワード（確認）</label>
            <input
              type={showPass ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="もう一度入力"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full border rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
            />
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive text-center bg-destructive/5 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={isLoading || !username.trim() || !passwordOk}
          className="w-full rounded-2xl py-3.5 text-base font-bold text-white bg-primary hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
        >
          {isLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : mode === "login" ? "ログイン" : "アカウントを作成"}
        </button>

        {mode === "login" && (
          <p className="text-xs text-center text-muted-foreground">
            アカウントをお持ちでない方は「新規登録」タブから
          </p>
        )}
      </div>
    </div>
  );
}
