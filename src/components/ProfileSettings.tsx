"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMapStore } from "@/store/useMapStore";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { LogOut, Mail, Settings, UserCircle, MapPinOff, Loader2, Check, Palette, DoorOpen, Trash2, Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { pushSupported, isPushEnabled, enablePush, disablePush } from "@/lib/push";
import { cn } from "@/lib/utils";

interface ProfileSettingsContentProps {
  onLogout: () => void;
  onLeaveRoom: () => void;
  onLeaveMap?: () => void;
  onDeleteMap?: () => void;
  canDeleteMap?: boolean;
  onClose?: () => void;
  userId?: string;
  currentEmail?: string;
}

export function ProfileSettingsContent({
  onLogout,
  onLeaveRoom,
  onLeaveMap,
  onDeleteMap,
  canDeleteMap,
  onClose,
  userId,
  currentEmail,
}: ProfileSettingsContentProps) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 通知
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const canPush = pushSupported();

  useEffect(() => {
    if (canPush) isPushEnabled().then(setPushOn);
  }, [canPush]);

  async function togglePush() {
    if (!userId) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        toast.success("通知をオフにしました");
      } else {
        const ok = await enablePush(userId);
        setPushOn(ok);
        toast[ok ? "success" : "error"](
          ok ? "通知をオンにしました" : "通知を有効にできませんでした（ブラウザの許可を確認してください）"
        );
      }
    } finally {
      setPushBusy(false);
    }
  }
  const { currentUser, setCurrentUser, room } = useMapStore();

  const [name, setName] = useState(currentUser?.name || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [email, setEmail] = useState(currentEmail ?? "");
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);

  // currentUser.name が変わったら同期
  useEffect(() => {
    setName(currentUser?.name || "");
  }, [currentUser?.name]);

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      toast.error("表示名を入力してください");
      return;
    }
    setIsSavingProfile(true);
    try {
      const updatedUser = { ...currentUser, name: name.trim() };
      setCurrentUser(updatedUser);

      if (room) {
        const { error } = await supabase
          .from("room_members")
          .update({ user_name: updatedUser.name })
          .eq("room_id", room.id)
          .eq("user_id", updatedUser.id);
        if (error) throw error;
      }
      toast.success("表示名を変更しました");
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast.error("表示名の変更に失敗しました");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveEmail = async () => {
    setEmailError("");
    setEmailSuccess(false);

    if (!email.trim()) {
      setEmailError("メールアドレスを入力してください");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setEmailError("有効なメールアドレスを入力してください");
      return;
    }
    if (!userId) return;

    setIsEmailLoading(true);
    try {
      const res = await fetch("/api/auth/register-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, recoveryEmail: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmailError(json.error || "登録に失敗しました");
      } else {
        setEmailSuccess(true);
      }
    } catch {
      setEmailError("接続に失敗しました");
    }
    setIsEmailLoading(false);
  };

  return (
    <div className="flex flex-col gap-8 p-5 pt-4">

      {/* ── プロフィール設定 ── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <UserCircle className="size-4" />
          <h3>プロフィール設定</h3>
        </div>
        <div className="bg-muted/40 rounded-xl p-4 flex flex-col gap-3 border border-border">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">表示名</label>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="あなたの名前"
                className="flex-1 bg-background"
              />
              <Button
                onClick={handleSaveProfile}
                disabled={isSavingProfile || name === (currentUser?.name || "")}
                className="shrink-0 font-bold"
              >
                {isSavingProfile ? <Loader2 className="size-4 animate-spin" /> : "更新"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              この名前は同じマップ（ルーム）にいる他の参加者にも表示されます。
            </p>
          </div>
        </div>
      </section>

      {/* ── メールアドレス設定 ── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Mail className="size-4" />
          <h3>メールアドレス設定（パスワード復旧用）</h3>
        </div>
        <div className="bg-muted/40 rounded-xl p-4 flex flex-col gap-3 border border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            パスワードを忘れた時のリセットに使います。任意ですが登録をおすすめします。
          </p>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); setEmailSuccess(false); }}
                placeholder="example@gmail.com"
                autoCapitalize="none"
                autoCorrect="off"
                className="flex-1 bg-background"
              />
              <Button
                onClick={handleSaveEmail}
                disabled={isEmailLoading || !email.trim() || email === currentEmail}
                className="shrink-0 font-bold"
              >
                {isEmailLoading ? <Loader2 className="size-4 animate-spin" /> : (currentEmail ? "更新" : "登録")}
              </Button>
            </div>

            {emailError && (
              <p className="text-[11px] text-destructive bg-destructive/5 rounded-md px-2 py-1.5">{emailError}</p>
            )}
            {emailSuccess && (
              <p className="text-[11px] text-green-700 bg-green-50 rounded-md px-2 py-1.5 flex items-center gap-1">
                <Check className="size-3" />
                メールアドレスを登録しました
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── テーマ設定 ── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Palette className="size-4" />
          <h3>テーマ</h3>
        </div>
        <ThemeToggle />
      </section>

      {/* ── 通知設定 ── */}
      {canPush && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Bell className="size-4" />
            <h3>通知</h3>
          </div>
          <button
            onClick={togglePush}
            disabled={pushBusy}
            className="flex items-center justify-between gap-2 bg-muted/40 border border-border rounded-xl p-3 text-left disabled:opacity-60 cursor-pointer"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">メンバーの新着スポットを通知</span>
              <span className="block text-[11px] text-muted-foreground">
                アプリを閉じていてもプッシュ通知を受け取ります
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 w-11 h-6 rounded-full transition-colors relative",
                pushOn ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              {pushBusy ? (
                <Loader2 className="size-4 animate-spin absolute top-1 left-3.5" />
              ) : (
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-white transition-all",
                    pushOn ? "left-[22px]" : "left-0.5"
                  )}
                />
              )}
            </span>
          </button>
        </section>
      )}

      {/* ── ルーム＆アカウント操作 ── */}
      <section className="flex flex-col gap-2 mt-2 pt-6 border-t">
        {room && (
          <Button
            variant="outline"
            className="w-full justify-between items-center text-foreground hover:text-foreground border-border h-12 rounded-xl"
            onClick={() => {
              onLeaveRoom();
              onClose?.();
            }}
          >
            <span className="flex items-center gap-2 font-semibold">
              <MapPinOff className="size-4 text-muted-foreground" />
              別のマップを開く
            </span>
          </Button>
        )}

        {/* このマップから抜ける */}
        {room && onLeaveMap && (
          confirmLeave ? (
            <div className="flex flex-col gap-2 bg-muted/40 border border-border rounded-xl p-3">
              <p className="text-xs text-foreground">このマップから抜けますか？（再度参加するには招待コードが必要です）</p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold"
                  onClick={() => { setConfirmLeave(false); onLeaveMap(); onClose?.(); }}
                >
                  抜ける
                </Button>
                <Button variant="outline" className="flex-1 h-10 rounded-lg border-border" onClick={() => setConfirmLeave(false)}>
                  キャンセル
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start items-center text-amber-600 hover:text-amber-700 border-border h-12 rounded-xl"
              onClick={() => setConfirmLeave(true)}
            >
              <span className="flex items-center gap-2 font-semibold">
                <DoorOpen className="size-4" />
                このマップから抜ける
              </span>
            </Button>
          )
        )}

        {/* このマップを削除（リーダーのみ） */}
        {room && canDeleteMap && onDeleteMap && (
          confirmDelete ? (
            <div className="flex flex-col gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-3">
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                このマップと全スポット・メンバー情報を完全に削除します。取り消せません。本当に削除しますか？
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 h-10 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
                  onClick={() => { setConfirmDelete(false); onDeleteMap(); onClose?.(); }}
                >
                  完全に削除
                </Button>
                <Button variant="outline" className="flex-1 h-10 rounded-lg border-border" onClick={() => setConfirmDelete(false)}>
                  キャンセル
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start items-center text-red-600 hover:text-red-700 border-border h-12 rounded-xl"
              onClick={() => setConfirmDelete(true)}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Trash2 className="size-4" />
                このマップを削除
              </span>
            </Button>
          )
        )}

        <Button
          variant="destructive"
          className="w-full justify-between items-center bg-red-50 text-red-600 hover:bg-red-100 border-none h-12 rounded-xl"
          onClick={() => {
            onLogout();
            onClose?.();
          }}
        >
          <span className="flex items-center gap-2 font-bold">
            <LogOut className="size-4" />
            ログアウト
          </span>
        </Button>
        <p className="text-[10px] text-muted-foreground text-center mt-1">
          端末からログアウトし、現在のマップから一時的に出ます。
        </p>
      </section>
    </div>
  );
}

interface ProfileSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void;
  onLeaveRoom: () => void;
  onLeaveMap?: () => void;
  onDeleteMap?: () => void;
  canDeleteMap?: boolean;
  userId?: string;
  currentEmail?: string;
}

export function ProfileSettings({ open, onOpenChange, onLogout, onLeaveRoom, onLeaveMap, onDeleteMap, canDeleteMap, userId, currentEmail }: ProfileSettingsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto w-[95%] rounded-2xl p-0">
        <div className="sticky top-0 bg-background z-10 p-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Settings className="size-5" />
            設定
          </DialogTitle>
        </div>
        <ProfileSettingsContent
          onLogout={onLogout}
          onLeaveRoom={onLeaveRoom}
          onLeaveMap={onLeaveMap}
          onDeleteMap={onDeleteMap}
          canDeleteMap={canDeleteMap}
          onClose={() => onOpenChange(false)}
          userId={userId}
          currentEmail={currentEmail}
        />
      </DialogContent>
    </Dialog>
  );
}
