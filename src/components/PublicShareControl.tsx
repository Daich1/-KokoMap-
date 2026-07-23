"use client";

import { useState } from "react";
import { Globe, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useMapStore } from "@/store/useMapStore";
import { Switch } from "@/components/ui/switch";

// ── 閲覧専用の公開リンク管理（リーダーのみ表示）──────────────────────
// sql/08_public_share.sql 適用済みの環境で動作。未適用時はトグルでエラー表示。
export function PublicShareControl() {
  const { room, myRole } = useMapStore();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!room || myRole !== "leader") return null;

  const token = room.public_token ?? null;
  const publicUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/view/${token}`
    : null;

  async function toggle(enabled: boolean) {
    if (!room) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("set_room_public", {
      p_room_id: room.id,
      p_enabled: enabled,
    });
    setBusy(false);
    if (error) {
      console.error("set_room_public failed:", error);
      toast.error("公開設定の変更に失敗しました（DBの更新が必要な可能性があります）");
      return;
    }
    useMapStore.getState().setRoom({ ...room, public_token: (data as string | null) ?? null });
    toast.success(enabled ? "公開リンクを有効にしました" : "公開リンクを無効にしました");
  }

  function copyUrl() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border bg-card p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="size-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">閲覧専用の公開リンク</p>
            <p className="text-[11px] text-muted-foreground">
              リンクを知っている人はログインなしでマップを見られます
            </p>
          </div>
        </div>
        <Switch checked={!!token} disabled={busy} onCheckedChange={toggle} />
      </div>

      {publicUrl && (
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 text-xs text-muted-foreground truncate rounded-lg border bg-muted/40 px-2.5 py-2">
            {publicUrl}
          </p>
          <button
            onClick={copyUrl}
            className="shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border hover:bg-muted transition-colors cursor-pointer"
          >
            {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
            コピー
          </button>
        </div>
      )}
    </div>
  );
}
