"use client";

import { useState, useEffect } from "react";
import { Loader2, Map, Plus, LogIn, Copy, Check } from "lucide-react";
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
  onJoined: (room: Room, userName: string) => void;
}

function generateShareCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function RoomJoinDialog({
  open,
  currentUserName,
  initialCode,
  onJoined,
}: RoomJoinDialogProps) {
  const [mode, setMode] = useState<"select" | "create" | "join">(
    initialCode ? "join" : "select"
  );
  const [userName, setUserName] = useState(currentUserName);

  // Zustand hydration 後に保存済みの名前を反映（ユーザーが入力済みの場合は上書きしない）
  useEffect(() => {
    if (currentUserName) setUserName((prev) => prev || currentUserName);
  }, [currentUserName]);

  // URL から渡されたコードを反映
  useEffect(() => {
    if (initialCode) {
      setShareCode(initialCode);
      setMode("join");
    }
  }, [initialCode]);
  const [shareCode, setShareCode] = useState(initialCode ?? "");
  const [roomName, setRoomName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!userName.trim()) {
      setError("名前を入力してください");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const code = generateShareCode();
      const { data, error: dbError } = await supabase
        .from("rooms")
        .insert({ share_code: code, name: roomName.trim() || null })
        .select()
        .single();
      if (dbError) throw dbError;
      setCreatedCode(code);
      setIsLoading(false);
      // 少し見せてから遷移
      setTimeout(() => onJoined(data as Room, userName.trim()), 1500);
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
    if (shareCode.trim().length < 6) {
      setError("共有コードを入力してください");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const { data, error: dbError } = await supabase
        .from("rooms")
        .select()
        .eq("share_code", shareCode.trim().toUpperCase())
        .single();
      if (dbError || !data) {
        setError("ルームが見つかりません。コードを確認してください");
        setIsLoading(false);
        return;
      }
      onJoined(data as Room, userName.trim());
    } catch {
      setError("接続に失敗しました");
      setIsLoading(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function goBack() {
    setMode("select");
    setError("");
    setCreatedCode(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        /* 強制表示: 閉じさせない */
      }}
    >
      <DialogContent
        className="sm:max-w-sm [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
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
          {/* 名前入力 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">あなたの名前</label>
            <Input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="例: Taro"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && mode === "join") handleJoin();
              }}
            />
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
                新しいルームを作成
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
                  onClick={handleCreate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "作成する"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* 作成完了 → コード表示 */}
          {createdCode && (
            <div className="flex flex-col gap-3 items-center py-2">
              <p className="text-sm text-muted-foreground">
                ルームを作成しました！このコードを共有してください
              </p>
              <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-3 w-full justify-center">
                <span className="font-mono text-2xl font-bold tracking-widest">
                  {createdCode}
                </span>
                <button
                  onClick={() => copyCode(createdCode)}
                  className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
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
                    setShareCode(e.target.value.toUpperCase().slice(0, 6))
                  }
                  placeholder="例: AB1C2D"
                  maxLength={6}
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
