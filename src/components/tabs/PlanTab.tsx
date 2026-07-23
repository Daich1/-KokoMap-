"use client";

import { useState } from "react";
import { Heart, CheckCircle2, MapPin, ChevronUp, ChevronDown, CalendarDays } from "lucide-react";
import { useMapStore } from "@/store/useMapStore";
import { getCategoryClass } from "@/lib/category";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase, type Place } from "@/lib/supabase";
import { toast } from "sonner";

type PlanFilter = "all" | "want_to_go" | "visited" | "itinerary";

interface PlanTabProps {
  onSelectPlace: (place: Place) => void;
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
export function PlanTabContent({ onSelectPlace }: PlanTabProps) {
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

  // ── 日程（itinerary）: plan_day でグループ化 ───────────────
  const maxDay = places.reduce((m, p) => Math.max(m, p.plan_day ?? 0), 0);
  const sortByOrder = (a: Place, b: Place) =>
    (a.plan_order ?? Number.MAX_SAFE_INTEGER) - (b.plan_order ?? Number.MAX_SAFE_INTEGER) ||
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  const dayGroups: { day: number | null; label: string; items: Place[] }[] = [];
  for (let d = 1; d <= maxDay; d++) {
    const items = places.filter((p) => p.plan_day === d).sort(sortByOrder);
    dayGroups.push({ day: d, label: `${d}日目`, items });
  }
  const unassigned = places.filter((p) => !p.plan_day).sort(sortByOrder);
  dayGroups.push({ day: null, label: "未定", items: unassigned });

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

  async function assignDay(place: Place, day: number | null) {
    const nextOrder =
      day == null ? null : places.filter((p) => p.plan_day === day).length;
    await persistPlan(place, day, nextOrder);
  }

  async function moveWithinDay(place: Place, dir: "up" | "down") {
    const list = places.filter((p) => p.plan_day === place.plan_day).sort(sortByOrder);
    const idx = list.findIndex((p) => p.id === place.id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= list.length) return;
    const reordered = [...list];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    // その日を 0..n で振り直し、変わった分だけ更新
    await Promise.all(
      reordered.map((p, i) => (p.plan_order !== i ? persistPlan(p, p.plan_day, i) : null))
    );
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
          // ── 日程ビュー ──────────────────────────────
          places.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
              <CalendarDays className="size-8 opacity-40" />
              <p>まだスポットがありません</p>
            </div>
          ) : (
            <div className="pb-6">
              {!canPlan && (
                <p className="text-[11px] text-muted-foreground px-4 py-2">
                  日程の編集はリーダー・管理者のみ可能です。
                </p>
              )}
              {dayGroups.map((group) => (
                <div key={group.label} className="mb-2">
                  <div className="sticky top-0 z-[1] bg-secondary/60 backdrop-blur px-4 py-1.5 text-xs font-bold text-secondary-foreground flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    {group.label}
                    <span className="text-muted-foreground font-normal">
                      （{group.items.length}）
                    </span>
                  </div>
                  {group.items.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground px-4 py-2">スポットなし</p>
                  ) : (
                    group.items.map((place, i) => (
                      <div key={place.id} className="flex items-center border-b last:border-b-0">
                        <button
                          onClick={() => onSelectPlace(place)}
                          className="flex-1 min-w-0 flex items-center gap-2 py-2.5 px-4 text-left hover:bg-muted/50 transition-colors cursor-pointer"
                        >
                          <span className="shrink-0 size-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold truncate">{place.name}</span>
                            {place.address && (
                              <span className="block text-[11px] text-muted-foreground truncate">{place.address}</span>
                            )}
                          </span>
                        </button>
                        {canPlan && (
                          <div className="shrink-0 flex items-center gap-1 pr-3">
                            {group.day != null && (
                              <div className="flex flex-col">
                                <button
                                  onClick={() => moveWithinDay(place, "up")}
                                  disabled={i === 0}
                                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25 cursor-pointer"
                                >
                                  <ChevronUp className="size-4" />
                                </button>
                                <button
                                  onClick={() => moveWithinDay(place, "down")}
                                  disabled={i === group.items.length - 1}
                                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25 cursor-pointer"
                                >
                                  <ChevronDown className="size-4" />
                                </button>
                              </div>
                            )}
                            <select
                              value={place.plan_day ?? ""}
                              onChange={(e) =>
                                assignDay(place, e.target.value === "" ? null : Number(e.target.value))
                              }
                              className="text-xs border border-border rounded-lg px-1.5 py-1 bg-background outline-none cursor-pointer"
                            >
                              <option value="">未定</option>
                              {Array.from({ length: maxDay + 1 }, (_, k) => k + 1).map((d) => (
                                <option key={d} value={d}>{d}日目</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
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
export function PlanTab({ onSelectPlace }: PlanTabProps) {
  return (
    <div
      className="md:hidden fixed inset-x-0 top-0 z-[42] bg-background flex flex-col overflow-hidden"
      style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="shrink-0 bg-background px-4 pb-0" style={{ paddingTop: "52px" }}>
        <h1 className="text-lg font-bold tracking-tight pt-3 mb-1">プランニング</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <PlanTabContent onSelectPlace={onSelectPlace} />
      </div>
    </div>
  );
}
