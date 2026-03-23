"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMapStore } from "@/store/useMapStore";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

interface ProfileSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void;
}

export function ProfileSettings({ open, onOpenChange, onLogout }: ProfileSettingsProps) {
  const { currentUser, setCurrentUser, room } = useMapStore();
  const [name, setName] = useState(currentUser?.name || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentUser?.name || "");
    }
  }, [open, currentUser?.name]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("表示名を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      const updatedUser = { ...currentUser, name: name.trim() };
      setCurrentUser(updatedUser);

      if (room) {
        // 現在のルームのメンバー情報を更新
        const { error } = await supabase
          .from("room_members")
          .update({ user_name: updatedUser.name })
          .eq("room_id", room.id)
          .eq("user_id", updatedUser.id);

        if (error) throw error;
      }
      toast.success("表示名を変更しました");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast.error("表示名の変更に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>プロフィール設定</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">表示名</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="あなたの名前"
              />
              <p className="text-xs text-muted-foreground">
                この名前は同じマップ（ルーム）にいる他の参加者にも表示されます。
              </p>
            </div>
            <Button
              className="w-full font-bold cursor-pointer"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "保存中..." : "保存する"}
            </Button>
          </div>

          <div className="border-t pt-4">
            <Button
              variant="destructive"
              className="w-full gap-2 cursor-pointer font-bold"
              onClick={() => {
                onOpenChange(false);
                onLogout();
              }}
            >
              <LogOut className="size-4" />
              ログアウト
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              端末からログアウトし、現在のマップから退出します。
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
