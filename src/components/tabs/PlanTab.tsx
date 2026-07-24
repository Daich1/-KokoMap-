"use client";

import { useMemo, useState } from "react";
import { Heart, CheckCircle2, MapPin, CalendarDays, Trophy } from "lucide-react";
import { useMapStore } from "@/store/useMapStore";
import { getCategoryClass } from "@/lib/category";
import { getCreatorColor } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase, type Place, type RoomMember } from "@/lib/supabase";
import { toast } from "sonner";
import { ItineraryView } from "@/components/tabs/ItineraryView";

type PlanMode = "itinerary" | "candidates" | "visited";

interface PlanTabProps {
  onSelectPlace: (place: Place) => void;
  onViewDayOnMap?: (day: number) => void;
}

// ── 行きたいメンバーのアバター列 ──────────────────────────────
function MemberAvatars({
  userIds,
  roomMembers,
  max = 4,
}: {
  userIds: string[];
  roomMembers: RoomMember[];
  max?: number;
}) {
  const shown = userIds.slice(0, max);
  const extra = userIds.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((uid) => {
        const member = roomMembers.find((m) => m.user_id === uid);
        const name = member?.user_name ?? "?";
        return (
          <span
            key={uid}
            className="size-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-background"
            style={{ backgroundColor: getCreatorColor(uid, roomMembers) }}
            title={name}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        );
      })}
      {extra > 0 && (
        <span className="size-5 rounded-full flex items-center justify-center text-[9px] font-bold text-muted-foreground bg-muted ring-2 ring-background">
          +{extra}
        </span>
      )}
    </div>
  );
}

// ── 通常のスポット行（行った一覧など）──────────────────────────
function PlaceRow({
  place,
  wantCount,
  visitedCount,
  onClick,
}: {
  place: Place;
  wantCount: number;
  visitedCount: number;
  onClick: () => void;
}) {
  const category = place.categories?.[0];
  const hasImage = place.image_urls && place.image_urls.length > 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-3 px-4 hover:bg-muted/50 active:bg-muted transition-colors text-left cursor-pointer border-b last:border-b-0"
    >
      <div className="shrink-0 size-12 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={place.image_urls![0]} alt={place.name} className="w-full h-full object-cover" />
        ) : (
          <MapPin className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {category && (
            <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0 h-4 shrink-0", getCategoryClass(category))}>
              {category}
            </Badge>
          )}
        </div>
        <p className="text-sm font-semibold truncate">{place.name}</p>
        {place.address && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{place.address}</p>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        {wantCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-amber-600 font-semibold">
            <Heart className="size-3 fill-amber-500 stroke-amber-500" />
            {wantCount}
          </span>
        )}
        {visitedCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-emerald-600 font-semibold">
            <CheckCircle2 className="size-3" />
            {visitedCount}
          </span>
        )}
      </div>
    </button>
  );
}

// ── 候補ランキングの1行（行きたい順 + 日程割当）──────────────────
function CandidateRow({
  place,
  rank,
  voters,
  roomMembers,
  canPlan,
  maxDay,
  onSelect,
  onAssignDay,
}: {
  place: Place;
  rank: number;
  voters: string[];
  roomMembers: RoomMember[];
  canPlan: boolean;
  maxDay: number;
  onSelect: () => void;
  onAssignDay: (day: number | null) => void;
}) {
  const category = place.categories?.[0];
  const hasImage = place.image_urls && place.image_urls.length > 0;
  const rankColor =
    rank === 1 ? "bg-amber-400 text-white"
    : rank === 2 ? "bg-slate-300 text-slate-700"
    : rank === 3 ? "bg-orange-300 text-orange-900"
    : "bg-muted text-muted-foreground";

  return (
    <div className="flex items-center gap-2.5 py-2.5 px-3 border-b last:border-b-0 hover:bg-muted/40 transition-colors">
      <span className={cn("shrink-0 size-6 rounded-full text-xs font-bold flex items-center justify-center", rankColor)}>
        {rank}
      </span>

      <button onClick={onSelect} className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer">
        <div className="shrink-0 size-11 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={place.image_urls![0]} alt={place.name} className="w-full h-full object-cover" />
          ) : (
            <MapPin className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {category && (
              <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0 h-4 shrink-0", getCategoryClass(category))}>
                {category}
              </Badge>
            )}
            {place.plan_day != null && (
              <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded px-1 py-0 shrink-0">
                {place.plan_day}日目
              </span>
            )}
          </div>
          <p className="text-sm font-semibold truncate mt-0.5">{place.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-0.5 text-xs text-amber-600 font-semibold shrink-0">
              <Heart className="size-3 fill-amber-500 stroke-amber-500" />
              {voters.length}
            </span>
            <MemberAvatars userIds={voters} roomMembers={roomMembers} />
          </div>
        </div>
      </button>

      {canPlan && (
        <select
          value={place.plan_day ?? ""}
          onChange={(e) => onAssignDay(e.target.value === "" ? null : Number(e.target.value))}
          className="shrink-0 text-xs border border-border rounded-lg px-1.5 py-1 bg-background outline-none cursor-pointer"
          title="日程に割り当て"
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">未割当</option>
          {Array.from({ length: Math.max(maxDay, 1) }, (_, k) => k + 1).map((d) => (
            <option key={d} value={d}>{d}日目</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ── プランニングのコンテンツ本体（モバイル全画面 / PC サイドパネル共通）──
export function PlanTabContent({ onSelectPlace, onViewDayOnMap }: PlanTabProps) {
  const [mode, setMode] = useState<PlanMode>("itinerary");
  const { places, allMemberStatuses, myRole, upsertPlace, roomMembers, tripDays } = useMapStore();

  const canPlan = myRole === "leader" || myRole === "admin";

  const MODE_TABS: { id: PlanMode; label: string }[] = [
    { id: "itinerary", label: "日程" },
    { id: "candidates", label: "候補" },
    { id: "visited", label: "行った" },
  ];

  const maxDay = useMemo(
    () => Math.max(places.reduce((m, p) => Math.max(m, p.plan_day ?? 0), 0), tripDays ?? 0),
    [places, tripDays],
  );

  // 行きたい投票者 userId の一覧
  const votersOf = (placeId: string) =>
    Object.entries(allMemberStatuses)
      .filter(([, s]) => s[placeId] === "want_to_go")
      .map(([uid]) => uid);
  const visitedCount = (placeId: string) =>
    Object.values(allMemberStatuses).filter((s) => s[placeId] === "visited").length;

  // 候補ランキング: 行きたい票の多い順
  const candidates = useMemo(() => {
    return places
      .map((p) => ({ place: p, voters: votersOf(p.id) }))
      .filter((c) => c.voters.length > 0)
      .sort(
        (a, b) =>
          b.voters.length - a.voters.length ||
          new Date(a.place.created_at).getTime() - new Date(b.place.created_at).getTime(),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, allMemberStatuses]);

  const visitedPlaces = useMemo(
    () => places.filter((p) => visitedCount(p.id) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places, allMemberStatuses],
  );

  // ── 日程の永続化 ───────────────────────────────────────
  async function persistPlan(place: Place, plan_day: number | null, plan_order: number | null) {
    const { error } = await supabase
      .from("places")
      .update({ plan_day, plan_order })
      .eq("id", place.id);
    if (error) {
      console.error("plan update failed:", error);
      toast.error("プランの更新に失敗しました");
      return;
    }
    upsertPlace({ ...place, plan_day, plan_order });
  }

  async function persistPlanTime(place: Place, plan_time: string | null) {
    const { error } = await supabase
      .from("places")
      .update({ plan_time })
      .eq("id", place.id);
    if (error) {
      console.error("plan_time update failed:", error);
      toast.error("時刻の更新に失敗しました");
      return;
    }
    upsertPlace({ ...place, plan_time });
  }

  // 候補から日程へ割り当て（その日の末尾に追加）
  async function assignCandidateDay(place: Place, day: number | null) {
    const order = day == null ? null : places.filter((p) => p.plan_day === day).length;
    await persistPlan(place, day, order);
    if (day != null) toast.success(`「${place.name}」を${day}日目に追加しました`);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b bg-background px-4 pt-1">
        <div className="flex gap-1">
          {MODE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={cn(
                "px-3.5 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors cursor-pointer",
                mode === tab.id
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {mode === "itinerary" ? (
          places.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
              <CalendarDays className="size-8 opacity-40" />
              <p>まだスポットがありません</p>
            </div>
          ) : (
            <ItineraryView
              places={places}
              canPlan={canPlan}
              onSelectPlace={onSelectPlace}
              persistPlan={persistPlan}
              persistPlanTime={persistPlanTime}
              onViewDayOnMap={onViewDayOnMap}
            />
          )
        ) : mode === "candidates" ? (
          candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2 px-6 text-center">
              <Trophy className="size-8 opacity-40" />
              <p>まだ「行きたい⭐」がありません</p>
              <p className="text-xs">スポットに「行きたい」を付けると、みんなの人気順でここに並びます</p>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground px-4 py-2">
                みんなの「行きたい⭐」が多い順
                {canPlan ? "。右の選択で日程に割り当てできます。" : "。"}
              </p>
              <div className="pb-4">
                {candidates.map((c, i) => (
                  <CandidateRow
                    key={c.place.id}
                    place={c.place}
                    rank={i + 1}
                    voters={c.voters}
                    roomMembers={roomMembers}
                    canPlan={canPlan}
                    maxDay={maxDay}
                    onSelect={() => onSelectPlace(c.place)}
                    onAssignDay={(day) => assignCandidateDay(c.place, day)}
                  />
                ))}
              </div>
            </>
          )
        ) : // visited
        visitedPlaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
            <p>「行った✅」のスポットがありません</p>
          </div>
        ) : (
          <div className="pb-4">
            {visitedPlaces.map((place) => (
              <PlaceRow
                key={place.id}
                place={place}
                wantCount={votersOf(place.id).length}
                visitedCount={visitedCount(place.id)}
                onClick={() => onSelectPlace(place)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── モバイル全画面ラッパー ──────────────────────────────────────────
export function PlanTab({ onSelectPlace, onViewDayOnMap }: PlanTabProps) {
  return (
    <div
      className="md:hidden fixed inset-x-0 top-0 z-[42] bg-background flex flex-col overflow-hidden"
      style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="shrink-0 bg-background px-4 pb-0" style={{ paddingTop: "52px" }}>
        <h1 className="text-lg font-bold tracking-tight pt-3 mb-1">プランニング</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <PlanTabContent onSelectPlace={onSelectPlace} onViewDayOnMap={onViewDayOnMap} />
      </div>
    </div>
  );
}
