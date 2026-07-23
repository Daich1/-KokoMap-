"use client";

import { useState, useEffect } from "react";
import { Loader2, MapPin, Plus, LogIn, Copy, Check, Shield, ArrowLeft } from "lucide-react";
import { supabase, type Room } from "@/lib/supabase";

interface WelcomeScreenProps {
  initialCode?: string;
  userName: string;
  onComplete: (name: string, room: Room, isCreator: boolean) => void | Promise<void>;
}

type Step = "select" | "create" | "join";

function generateShareCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function WelcomeScreen({ initialCode, userName, onComplete }: WelcomeScreenProps) {
  const [step, setStep] = useState<Step>(initialCode ? "join" : "select");
  const [roomName, setRoomName] = useState("");
  const [shareCode, setShareCode] = useState(initialCode ?? "");
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialCode) {
      setStep("join");
      setShareCode(initialCode);
    }
  }, [initialCode]);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    const code = useCustomCode
      ? customCode.trim().toUpperCase()
      : generateShareCode();

    if (useCustomCode) {
      if (code.length < 4 || code.length > 8) { setError("コードは4〜8文字で入力してください"); return; }
      if (!/^[A-Z0-9]+$/.test(code)) { setError("コードは英数字のみ使用できます"); return; }
    }

    setIsLoading(true);
    setError("");
    try {
      const { data, error: dbError } = await supabase
        .from("rooms")
        .insert({ share_code: code, name: roomName.trim() || null })
        .select()
        .single();
      if (dbError) {
        if (dbError.code === "23505") setError("このコードは既に使われています");
        else throw dbError;
        setIsLoading(false);
        return;
      }
      setCreatedCode(code);
      setIsLoading(false);
      setTimeout(() => onComplete(userName, data as Room, true), 1500);
    } catch {
      setError("マップの作成に失敗しました");
      setIsLoading(false);
    }
  }

  async function handleJoin() {
    if (shareCode.trim().length < 4) { setError("招待コードを入力してください"); return; }
    setIsLoading(true);
    setError("");
    try {
      // RLS 有効化後も参加前にルームを見つけられるよう RPC を使う
      const { data, error: dbError } = await supabase
        .rpc("get_room_by_code", { p_code: shareCode.trim() })
        .maybeSingle<Room>();
      if (dbError || !data) { setError("マップが見つかりません"); setIsLoading(false); return; }
      if (!data.is_open) { setError("このマップは参加を受け付けていません"); setIsLoading(false); return; }
      // 参加失敗（RLS 拒否等）時にローディングのまま固まらないよう await して解除
      await onComplete(userName, data as Room, false);
      setIsLoading(false);
    } catch {
      setError("接続に失敗しました");
      setIsLoading(false);
    }
  }

  function copyInviteUrl(code: string) {
    const url = `${window.location.origin}${window.location.pathname}?code=${code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden auth-bg">
      <div className="topo-overlay" />

      {/* ── マップ選択 ── */}
      {step === "select" && (
        <>
          <div className="flex flex-col items-center justify-center flex-1 gap-4">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-[0_6px_24px_rgba(0,0,0,0.22)]">
              <MapPin className="size-7 text-primary" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <h1 className="text-white font-extrabold text-2xl tracking-tight">Koko<span className="text-[var(--coral-300)]">Map</span></h1>
              <p className="text-white/65 text-sm mt-1.5">仲間とスポットをリアルタイム共有</p>
            </div>
            <p className="text-sm text-white/80">
              こんにちは、<span className="font-semibold text-white">{userName}</span> さん
            </p>
          </div>

          <div className="bg-background rounded-[24px] rounded-b-none px-7 pt-7 pb-10 shadow-2xl">
            <div className="max-w-xs mx-auto flex flex-col gap-3">
              {error && <p className="text-xs text-destructive text-center bg-destructive/5 rounded-lg px-3 py-2">{error}</p>}
              <button
                onClick={() => { setError(""); setStep("create"); }}
                className="bg-primary text-primary-foreground rounded-[14px] py-[15px] font-bold w-full hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Plus className="size-5" />
                マップを作る
              </button>
              <button
                onClick={() => { setError(""); setStep("join"); }}
                className="border-2 border-primary text-primary rounded-[14px] py-[14px] font-bold w-full hover:bg-secondary transition-all flex items-center justify-center gap-2"
              >
                <LogIn className="size-5" />
                招待コードで参加
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── マップ作成 ── */}
      {step === "create" && (
        <>
          <div className="flex-1" />
          <div className="bg-background rounded-[24px] rounded-b-none px-7 pt-7 pb-10 shadow-2xl w-full">
          <div className="max-w-xs mx-auto">
            <button
              onClick={() => { setStep("select"); setError(""); setCreatedCode(null); }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="size-4" />
              戻る
            </button>

            {!createdCode ? (
              <div className="flex flex-col gap-5">
                <div className="text-center">
                  <h2 className="text-xl font-bold">マップを作成</h2>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">マップ名（任意）</label>
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="例: 大阪旅行 2026"
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    className="w-full border rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">招待コード</label>
                    <button
                      type="button"
                      onClick={() => { setUseCustomCode((v) => !v); setCustomCode(""); setError(""); }}
                      className="text-xs text-primary underline"
                    >
                      {useCustomCode ? "ランダムに戻す" : "カスタム設定"}
                    </button>
                  </div>
                  {useCustomCode ? (
                    <>
                      <input
                        value={customCode}
                        onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                        placeholder="例: TRAVEL26"
                        maxLength={8}
                        className="w-full border rounded-xl px-4 py-3 text-xl font-mono font-bold tracking-widest text-center outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                      />
                      <p className="text-xs text-muted-foreground">英数字 4〜8文字</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground px-1">作成時にランダムなコードが自動生成されます</p>
                  )}
                </div>

                {error && <p className="text-xs text-destructive text-center bg-destructive/5 rounded-lg px-3 py-2">{error}</p>}

                <button
                  onClick={handleCreate}
                  disabled={isLoading}
                  className="bg-primary text-primary-foreground rounded-[14px] py-[15px] font-bold w-full hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="size-5 animate-spin" /> : <><Shield className="size-5" /> 作成する</>}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 pt-4">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                  <Check className="size-8 text-primary" />
                </div>
                <div className="text-center">
                  <h2 className="text-xl font-bold">マップを作成しました！</h2>
                  <p className="text-sm text-muted-foreground mt-1">招待コードを友達に共有してください</p>
                </div>
                <div className="w-full bg-secondary rounded-2xl p-5 flex flex-col items-center gap-3">
                  <p className="text-xs text-muted-foreground">招待コード</p>
                  <p className="text-3xl font-black font-mono tracking-widest text-primary">{createdCode}</p>
                  <button
                    onClick={() => copyInviteUrl(createdCode)}
                    className="flex items-center justify-center gap-1.5 w-full border border-primary text-primary rounded-xl py-2.5 text-sm font-medium hover:bg-secondary transition"
                  >
                    {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
                    {copied ? "コピー済" : "URLをコピー"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground animate-pulse">マップを読み込んでいます...</p>
              </div>
            )}
          </div>
          </div>
        </>
      )}

      {/* ── 招待コードで参加 ── */}
      {step === "join" && (
        <>
          <div className="flex-1" />
          <div className="bg-background rounded-[24px] rounded-b-none px-7 pt-7 pb-10 shadow-2xl w-full">
          <div className="max-w-xs mx-auto">
            <button
              onClick={() => { setStep("select"); setError(""); setShareCode(initialCode ?? ""); }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="size-4" />
              戻る
            </button>

            <div className="flex flex-col gap-5">
              <div className="text-center">
                <h2 className="text-xl font-bold">招待コードで参加</h2>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-center">招待コード</label>
                <input
                  value={shareCode}
                  onChange={(e) => setShareCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                  placeholder="例: KKMAP"
                  maxLength={8}
                  autoFocus={!initialCode}
                  className="w-full border rounded-xl px-4 py-4 text-2xl font-black font-mono tracking-widest text-center outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
              </div>

              {error && <p className="text-xs text-destructive text-center bg-destructive/5 rounded-lg px-3 py-2">{error}</p>}

              <button
                onClick={handleJoin}
                disabled={isLoading || shareCode.trim().length < 4}
                className="bg-primary text-primary-foreground rounded-[14px] py-[15px] font-bold w-full hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="size-5 animate-spin" /> : <><LogIn className="size-5" /> 参加する</>}
              </button>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
