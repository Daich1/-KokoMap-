"use client";

import { useState } from "react";
import { Heart, CheckCircle2, MapPin, CalendarDays } from "lucide-react";
import { useMapStore } from "@/store/useMapStore";
import { getCategoryClass } from "@/lib/category";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase, type Place } from "@/lib/supabase";
import { toast } from "sonner";
import { ItineraryView } from "@/components/tabs/ItineraryView";

type PlanFilter = "all" | "want_to_go" | "visited" | "itinerary";

interface PlanTabProps {
  onSelectPlace: (place: Place) => void;
  onViewDayOnMap?: (day: number) => void;
}

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

// ── プランニングのコンテンツ本体（モバイル全画面 / PC サイドパネル共通）──
export function PlanTabContent({ onSelectPlace, onViewDayOnMap }: PlanTabProps) {
  const [activeFilter, setActiveFilter] = useState<PlanFilter>("all");
  const { places, allMemberStatuses, spotStatuses, myRole, upsertPlace } = useMapStore();

  const canPlan = myRole === "leader" || myRole === "admin";

  const FILTER_TABS: { id: PlanFilter; label: string }[] = [
    { id: "all", label: "すべて" },
    { id: "want_to_go", label: "行きたい" },
    { id: "visited", label: "行った" },
    { id: "itinerary", label: "日程" },
  ];

  const filtered = places.filter((p) => {
    if (activeFilter === "all" || activeFilter === "itinerary") return true;
    return spotStatuses[p.id] === activeFilter;
  });

  const wantCount = (placeId: string) =>
    Object.values(allMemberStatuses).filter((s) => s[placeId] === "want_to_go").length;
  const visitedCount = (placeId: string) =>
    Object.values(allMemberStatuses).filter((s) => s[placeId] === "visited").length;

  // ── 日程（itinerary）の永続化 ───────────────────────────
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b bg-background px-4 pt-1">
        <div className="flex gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                "px-3.5 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors cursor-pointer",
                activeFilter === tab.id
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
        {activeFilter === "itinerary" ? (
          // ── 日程ビュー（D&D 並べ替え + 移動時間）──────────
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
            <p>
              {places.length === 0
                ? "まだスポットがありません"
                : activeFilter === "want_to_go"
                  ? "「行きたい」のスポットがありません"
                  : "「行った」のスポットがありません"}
            </p>
          </div>
        ) : (
          <div className="divide-y-0 pb-4">
            {filtered.map((place) => (
              <PlaceRow
                key={place.id}
                place={place}
                wantCount={wantCount(place.id)}
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
