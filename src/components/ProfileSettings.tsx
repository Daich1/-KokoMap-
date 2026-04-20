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
import { LogOut, Mail, Settings, UserCircle, MapPinOff, Loader2, Check } from "lucide-react";

interface ProfileSettingsContentProps {
  onLogout: () => void;
  onLeaveRoom: () => void;
  onClose?: () => void;
  userId?: string;
  currentEmail?: string;
}

export function ProfileSettingsContent({
  onLogout,
  onLeaveRoom,
  onClose,
  userId,
  currentEmail,
}: ProfileSettingsContentProps) {
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
        <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <UserCircle className="size-4" />
          <h3>プロフィール設定</h3>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3 border border-gray-100">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-600">表示名</label>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="あなたの名前"
                className="flex-1 bg-white"
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
        <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <Mail className="size-4" />
          <h3>メールアドレス設定（パスワード復旧用）</h3>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3 border border-gray-100">
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
                className="flex-1 bg-white"
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

      {/* ── ルーム＆アカウント操作 ── */}
      <section className="flex flex-col gap-2 mt-2 pt-6 border-t">
        {room && (
          <Button
            variant="outline"
            className="w-full justify-between items-center text-gray-700 hover:text-gray-900 border-gray-200 h-12 rounded-xl"
            onClick={() => {
              onLeaveRoom();
              onClose?.();
            }}
          >
            <span className="flex items-center gap-2 font-semibold">
              <MapPinOff className="size-4 text-gray-500" />
              別のマップを開く
            </span>
          </Button>
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
        <p className="text-[10px] text-gray-400 text-center mt-1">
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
  userId?: string;
  currentEmail?: string;
}

export function ProfileSettings({ open, onOpenChange, onLogout, onLeaveRoom, userId, currentEmail }: ProfileSettingsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto w-[95%] rounded-2xl p-0">
        <div className="sticky top-0 bg-white z-10 p-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Settings className="size-5" />
            設定
          </DialogTitle>
        </div>
        <ProfileSettingsContent
          onLogout={onLogout}
          onLeaveRoom={onLeaveRoom}
          onClose={() => onOpenChange(false)}
          userId={userId}
          currentEmail={currentEmail}
        />
      </DialogContent>
    </Dialog>
  );
}
