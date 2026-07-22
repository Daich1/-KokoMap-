"use client";

import { useState, useEffect } from "react";
import { Loader2, Map, Plus, LogIn, Copy, Check, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase, type Room } from "@/lib/supabase";

interface RoomJoinDialogProps {
  open: boolean;
  currentUserName: string;
  initialCode?: string;
  onJoined: (room: Room, userName: string, isCreator: boolean) => void | Promise<void>;
  onClose?: () => void;
}

function generateShareCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function RoomJoinDialog({
  open,
  currentUserName,
  initialCode,
  onJoined,
  onClose,
}: RoomJoinDialogProps) {
  const [mode, setMode] = useState<"select" | "create" | "join">(
    initialCode ? "join" : "select"
  );
  const [userName, setUserName] = useState(currentUserName);
  const [shareCode, setShareCode] = useState(initialCode ?? "");

  // Zustand hydration 後に保存済みの名前を反映（ユーザーが入力済みの場合は上書きしない）
  useEffect(() => {
    if (currentUserName) setUserName((prev) => prev || currentUserName);
  }, [currentUserName]);

  // URL から渡されたコードを反映（非同期で initialCode が届いたとき）
  useEffect(() => {
    if (initialCode) {
      setShareCode(initialCode);
      setMode("join");
    }
  }, [initialCode]);
  const [roomName, setRoomName] = useState("");
  // カスタムコード入力モード
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!userName.trim()) {
      setError("名前を入力してください");
      return;
    }

    const code = useCustomCode
      ? customCode.trim().toUpperCase()
      : generateShareCode();

    if (useCustomCode) {
      if (code.length < 4 || code.length > 8) {
        setError("コードは4〜8文字で入力してください");
        return;
      }
      if (!/^[A-Z0-9]+$/.test(code)) {
        setError("コードは英数字のみ使用できます");
        return;
      }
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
        // コード重複エラー
        if (dbError.code === "23505") {
          setError("このコードは既に使われています。別のコードを入力してください");
        } else {
          throw dbError;
        }
        setIsLoading(false);
        return;
      }
      setCreatedCode(code);
      setIsLoading(false);
      // 少し見せてから遷移
      setTimeout(() => onJoined(data as Room, userName.trim(), true), 1500);
    } catch {
      setError("ルームの作成に失敗しました");
      setIsLoading(false);
    }
  }

  async function handleJoin() {
    if (!userName.trim()) {
      setError("名前を入力してください");
      return;
    }
    if (shareCode.trim().length < 4) {
      setError("共有コードを入力してください");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      // RLS 有効化後も参加前にルームを見つけられるよう RPC を使う
      const { data, error: dbError } = await supabase
        .rpc("get_room_by_code", { p_code: shareCode.trim() })
        .maybeSingle<Room>();
      if (dbError || !data) {
        setError("ルームが見つかりません。コードを確認してください");
        setIsLoading(false);
        return;
      }
      if (!data.is_open) {
        setError("このルームは現在参加を受け付けていません");
        setIsLoading(false);
        return;
      }
      // 参加失敗（RLS 拒否等）時にローディングのまま固まらないよう await して解除
      await onJoined(data as Room, userName.trim(), false);
      setIsLoading(false);
    } catch {
      setError("接続に失敗しました");
      setIsLoading(false);
    }
  }

  function copyCode(code: string) {
    const url = `${window.location.origin}${window.location.pathname}?code=${code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function goBack() {
    setMode("select");
    setError("");
    setCreatedCode(null);
    setUseCustomCode(false);
    setCustomCode("");
    setRoomName("");
    setShareCode("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose?.(); }}
    >
      <DialogContent
        className={onClose ? "sm:max-w-sm" : "sm:max-w-sm [&>button]:hidden"}
        onInteractOutside={(e) => { if (!onClose) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!onClose) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Map className="size-5" />
            マップルームに参加
          </DialogTitle>
          <DialogDescription>
            共有コードを知っているメンバーと、同じマップをリアルタイムで共同編集できます。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-1">
          {/* 現在のユーザー名を表示 */}
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
            <div className="size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium">{userName}</span>
            <span className="text-xs text-muted-foreground ml-auto">として参加</span>
          </div>

          {/* モード選択 */}
          {mode === "select" && (
            <div className="flex flex-col gap-2">
              <Button
                className="gap-2 h-11"
                onClick={() => {
                  setMode("create");
                  setError("");
                }}
                disabled={!userName.trim()}
              >
                <Plus className="size-4" />
                新しいルームを作成（管理者）
              </Button>
              <Button
                variant="outline"
                className="gap-2 h-11"
                onClick={() => {
                  setMode("join");
                  setError("");
                }}
                disabled={!userName.trim()}
              >
                <LogIn className="size-4" />
                コードで参加する
              </Button>
            </div>
          )}

          {/* ルーム作成 */}
          {mode === "create" && !createdCode && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  ルーム名（任意）
                </label>
                <Input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="例: 大阪旅行 2026"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>

              {/* カスタムコード切り替え */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-muted-foreground">
                    共有コード
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomCode((v) => !v);
                      setCustomCode("");
                      setError("");
                    }}
                    className="text-xs text-primary underline cursor-pointer"
                  >
                    {useCustomCode ? "ランダムに戻す" : "カスタムコードを設定"}
                  </button>
                </div>
                {useCustomCode ? (
                  <div className="flex flex-col gap-1">
                    <Input
                      value={customCode}
                      onChange={(e) =>
                        setCustomCode(
                          e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
                        )
                      }
                      placeholder="例: KKMAP"
                      maxLength={8}
                      className="font-mono tracking-[0.3em] text-center text-lg h-12"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreate();
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      英数字 4〜8文字（大文字に自動変換）
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground px-1">
                    作成時にランダムなコードが自動生成されます
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={goBack}
                  disabled={isLoading}
                >
                  戻る
                </Button>
                <Button
                  className="flex-1 gap-1.5"
                  onClick={handleCreate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <Shield className="size-3.5" />
                      作成する
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* 作成完了 → コード表示 */}
          {createdCode && (
            <div className="flex flex-col gap-3 items-center py-2">
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 w-full">
                <Shield className="size-4 shrink-0" />
                <span>管理者としてルームを作成しました</span>
              </div>
              <p className="text-sm text-muted-foreground">
                このコード（またはURL）を共有してください
              </p>
              <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-3 w-full justify-center">
                <span className="font-mono text-2xl font-bold tracking-widest">
                  {createdCode}
                </span>
                <button
                  onClick={() => copyCode(createdCode)}
                  className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
                  title="URLをコピー"
                >
                  {copied ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground animate-pulse">
                マップを読み込んでいます...
              </p>
            </div>
          )}

          {/* コードで参加 */}
          {mode === "join" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">共有コード</label>
                <Input
                  value={shareCode}
                  onChange={(e) =>
                    setShareCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))
                  }
                  placeholder="例: KKMAP"
                  maxLength={8}
                  className="font-mono tracking-[0.3em] text-center text-lg h-12"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoin();
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={goBack}
                  disabled={isLoading}
                >
                  戻る
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleJoin}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "参加する"
                  )}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
