"use client";

import { useState } from "react";
import { Crown, Shield, Pencil, Eye, Share2, Users, MapPin, Heart, CheckCircle2, ChevronDown } from "lucide-react";
import { useMapStore } from "@/store/useMapStore";
import { getCreatorColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { RoomRole, Place } from "@/lib/supabase";

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

interface GroupTabProps {
  onInvite: () => void;
  onManageMembers: () => void;
  canManageMembers: boolean;
  onSelectPlace: (place: Place) => void;
}

// ── メンバー一覧のコンテンツ本体（モバイル全画面 / PC サイドパネル共通）──
export function GroupTabContent({
  onInvite,
  onManageMembers,
  canManageMembers,
  onSelectPlace,
  headerTopPadding,
}: GroupTabProps & { headerTopPadding?: string }) {
  const { room, roomMembers, places, allMemberStatuses, currentUser } = useMapStore();
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  if (!room) return null;

  const totalSpots = places.length;
  const wantCount = places.filter((p) =>
    Object.values(allMemberStatuses).some((s) => s[p.id] === "want_to_go")
  ).length;
  const visitedCount = places.filter((p) =>
    Object.values(allMemberStatuses).some((s) => s[p.id] === "visited")
  ).length;

  // 全メンバーをロール順に表示（スポット未登録のメンバーも含む）
  const sorted = [...roomMembers].sort((a, b) => {
    const order: Record<RoomRole, number> = { leader: 0, admin: 1, member: 2, viewer: 3 };
    return order[a.role] - order[b.role];
  });

  return (
    <>
      {/* マップヘッダー */}
      <div
        className="shrink-0 bg-primary text-primary-foreground px-5 pb-5"
        style={{ paddingTop: headerTopPadding ?? "1.25rem" }}
      >
        <p className="text-xs font-medium opacity-70 mb-0.5">コード: {room.share_code}</p>
        <h1 className="text-xl font-bold truncate">{room.name ?? "マイマップ"}</h1>

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
            メンバー（{sorted.length}人）
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

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            まだメンバーがいません
          </p>
        ) : (
          <div className="flex flex-col rounded-2xl overflow-hidden border bg-card divide-y">
            {sorted.map((member) => {
              const cfg = ROLE_CONFIG[member.role];
              const isMe = member.user_id === currentUser.id;
              const color = getCreatorColor(member.user_id, roomMembers);
              const isExpanded = expandedMemberId === member.user_id;
              const memberPlaces = places.filter((p) => p.created_by_id === member.user_id);

              return (
                <div key={member.user_id}>
                  <button
                    onClick={() => setExpandedMemberId(isExpanded ? null : member.user_id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left cursor-pointer"
                  >
                    <div
                      className="size-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {member.user_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{member.user_name}</span>
                        {isMe && (
                          <span className="text-[11px] text-muted-foreground shrink-0">（自分）</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-[11px] font-medium rounded-full px-1.5 py-0.5 border",
                            cfg.badgeClass
                          )}
                        >
                          {cfg.icon}
                          {cfg.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {memberPlaces.length}件登録
                        </span>
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform duration-200 shrink-0",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>

                  {isExpanded && (
                    <div className="bg-muted/30 border-t divide-y">
                      {memberPlaces.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-4 py-3">
                          まだスポットを登録していません
                        </p>
                      ) : (
                        memberPlaces.map((place) => (
                          <button
                            key={place.id}
                            onClick={() => onSelectPlace(place)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left cursor-pointer"
                          >
                            <div className="shrink-0 size-9 rounded-xl overflow-hidden bg-background border flex items-center justify-center">
                              {place.image_urls?.[0] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={place.image_urls[0]}
                                  alt={place.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <MapPin className="size-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{place.name}</p>
                              {place.address && (
                                <p className="text-xs text-muted-foreground truncate">{place.address}</p>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── モバイル全画面ラッパー ──────────────────────────────────────────
export function GroupTab(props: GroupTabProps) {
  return (
    <div
      className="md:hidden fixed inset-x-0 top-0 z-[42] bg-background flex flex-col overflow-y-auto"
      style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
    >
      <GroupTabContent {...props} headerTopPadding="calc(52px + 1.25rem)" />
    </div>
  );
}
