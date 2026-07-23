"use client";

import { Copy, Check, Lock, Unlock, Share2, Users, Crown, Shield, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoomSwitcher } from "@/components/RoomSwitcher";
import { ROLE_LABELS } from "@/lib/constants";
import type { Room, RoomRole } from "@/lib/supabase";

interface RoomHeaderActionsProps {
  variant: "mobile" | "desktop";
  room: Room;
  myRole: RoomRole | null;
  canManageRoom: boolean;
  canManageMembers: boolean;
  codeCopied: boolean;
  onToggleOpen: () => void;
  onOpenMemberManage: () => void;
  onCopyCode: () => void;
  onShare: () => void;
  onAddRoom: () => void;
}

// ── ロールバッジ + マップ切替 + 操作ボタン群（PC/モバイル共通ヘッダー行）──
export function RoomHeaderActions({
  variant,
  room,
  myRole,
  canManageRoom,
  canManageMembers,
  codeCopied,
  onToggleOpen,
  onOpenMemberManage,
  onCopyCode,
  onShare,
  onAddRoom,
}: RoomHeaderActionsProps) {
  const isMobile = variant === "mobile";
  const iconSize = isMobile ? "size-4" : "size-3.5";
  const btnPad = isMobile ? "p-2 rounded-md" : "p-1.5 rounded";

  const roleBadge = myRole && (
    <span className={`flex items-center gap-0.5 text-[11px] font-bold rounded-full px-1.5 py-0.5 shrink-0 border
      ${myRole === "leader" ? "text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-950/40 dark:border-yellow-800" :
        myRole === "admin" ? "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-800" :
          myRole === "viewer" ? "text-gray-500 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/40 dark:border-gray-700" :
            "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950/40 dark:border-green-800"}`}>
      {myRole === "leader" ? <Crown className="size-2.5" /> :
        myRole === "admin" ? <Shield className="size-2.5" /> :
          myRole === "viewer" ? <Eye className="size-2.5" /> :
            <Users className="size-2.5" />}
      {ROLE_LABELS[myRole]}
    </span>
  );

  return (
    <>
      <div className={cn("flex items-center min-w-0", isMobile ? "gap-2 flex-1" : "gap-1.5")}>
        {roleBadge}
        <RoomSwitcher
          onAddRoom={onAddRoom}
          className={cn("text-xs min-w-0", isMobile && "max-w-[160px]")}
        />
      </div>
      <div className={cn("flex items-center shrink-0", isMobile ? "gap-0" : "gap-1.5")}>
        {canManageRoom && (
          <button
            onClick={onToggleOpen}
            title={room.is_open ? "参加を締め切る" : "参加を再開する"}
            className={cn(
              btnPad,
              "transition-colors cursor-pointer",
              room.is_open
                ? "text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40"
                : "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
            )}
          >
            {room.is_open ? <Unlock className={iconSize} /> : <Lock className={iconSize} />}
          </button>
        )}
        {canManageMembers && (
          <button
            onClick={onOpenMemberManage}
            title="メンバー管理"
            className={cn(btnPad, "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer")}
          >
            <Users className={iconSize} />
          </button>
        )}
        <button
          onClick={onCopyCode}
          title="コードをコピー"
          className={cn(btnPad, "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer")}
        >
          {codeCopied ? <Check className={cn(iconSize, "text-green-600")} /> : <Copy className={iconSize} />}
        </button>
        <button
          onClick={onShare}
          title="シェア"
          className={cn(btnPad, "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer")}
        >
          <Share2 className={iconSize} />
        </button>
      </div>
    </>
  );
}
