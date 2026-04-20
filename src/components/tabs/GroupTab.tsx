"use client";

import { Crown, Shield, Pencil, Eye, Share2, Users, MapPin, Heart, CheckCircle2 } from "lucide-react";
import { useMapStore } from "@/store/useMapStore";
import { cn } from "@/lib/utils";
import type { RoomRole } from "@/lib/supabase";

const ROLE_CONFIG: Record<RoomRole, { label: string; icon: React.ReactNode; badgeClass: string }> = {
  leader: {
    label: "オーナー",
    icon: <Crown className="size-3" />,
    badgeClass: "text-yellow-700 bg-yellow-50 border-yellow-200",
  },
  admin: {
    label: "管理者",
    icon: <Shield className="size-3" />,
    badgeClass: "text-blue-700 bg-blue-50 border-blue-200",
  },
  member: {
    label: "メンバー",
    icon: <Pencil className="size-3" />,
    badgeClass: "text-green-700 bg-green-50 border-green-200",
  },
  viewer: {
    label: "閲覧者",
    icon: <Eye className="size-3" />,
    badgeClass: "text-gray-500 bg-gray-50 border-gray-200",
  },
};

function UserAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0",
        size === "md" ? "size-10 text-sm" : "size-8 text-xs"
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

interface GroupTabProps {
  onInvite: () => void;
  onManageMembers: () => void;
  canManageMembers: boolean;
}

export function GroupTab({ onInvite, onManageMembers, canManageMembers }: GroupTabProps) {
  const { room, roomMembers, places, allMemberStatuses, currentUser } = useMapStore();

  if (!room) return null;

  const totalSpots = places.length;
  const wantCount = places.filter((p) =>
    Object.values(allMemberStatuses).some((s) => s[p.id] === "want_to_go")
  ).length;
  const visitedCount = places.filter((p) =>
    Object.values(allMemberStatuses).some((s) => s[p.id] === "visited")
  ).length;

  const sorted = [...roomMembers].sort((a, b) => {
    const order: Record<RoomRole, number> = { leader: 0, admin: 1, member: 2, viewer: 3 };
    return order[a.role] - order[b.role];
  });

  return (
    <div
      className="md:hidden fixed inset-x-0 top-0 z-[42] bg-background flex flex-col overflow-y-auto"
      style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* グループヘッダー */}
      <div
        className="shrink-0 bg-primary text-primary-foreground px-5 pb-5"
        style={{ paddingTop: "calc(52px + 1.25rem)" }}
      >
        <p className="text-xs font-medium opacity-70 mb-0.5">コード: {room.share_code}</p>
        <h1 className="text-xl font-bold truncate">{room.name ?? "マイグループ"}</h1>

        {/* 統計 */}
        <div className="flex gap-6 mt-4">
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold">{totalSpots}</span>
            <span className="text-[11px] opacity-70 flex items-center gap-1">
              <MapPin className="size-3" />スポット
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold">{wantCount}</span>
            <span className="text-[11px] opacity-70 flex items-center gap-1">
              <Heart className="size-3" />行きたい
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold">{visitedCount}</span>
            <span className="text-[11px] opacity-70 flex items-center gap-1">
              <CheckCircle2 className="size-3" />行った
            </span>
          </div>
        </div>
      </div>

      {/* メンバーセクション */}
      <div className="flex-1 px-4 py-4 pb-8 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-1.5">
            <Users className="size-4" />
            メンバー（{roomMembers.length}人）
          </h2>
          <div className="flex gap-2">
            {canManageMembers && (
              <button
                onClick={onManageMembers}
                className="text-xs text-primary font-semibold px-3 py-1.5 rounded-full border border-primary/30 hover:bg-primary/5 transition-colors cursor-pointer"
              >
                管理
              </button>
            )}
            <button
              onClick={onInvite}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-accent text-accent-foreground shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
            >
              <Share2 className="size-3" />
              招待する
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-0 rounded-2xl overflow-hidden border bg-card divide-y">
          {sorted.map((member) => {
            const cfg = ROLE_CONFIG[member.role];
            const isMe = member.user_id === currentUser.id;
            return (
              <div key={member.user_id} className="flex items-center gap-3 px-4 py-3">
                <UserAvatar name={member.user_name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{member.user_name}</span>
                    {isMe && (
                      <span className="text-[10px] text-muted-foreground shrink-0">（自分）</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[10px] font-medium rounded-full px-1.5 py-0.5 border mt-0.5",
                      cfg.badgeClass
                    )}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
          })}
          {roomMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              まだメンバーがいません
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
