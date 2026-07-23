"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays, GripVertical, Footprints, Clock, Car, Train,
  Bike, Plus, Calendar,
} from "lucide-react";
import type { Place } from "@/lib/supabase";
import { calcDistance } from "@/lib/geo";
import { DURATION_LABELS, TRANSPORT_MODES, type TransportMode } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useMapStore } from "@/store/useMapStore";

// ── 定数 ───────────────────────────────────────────────────────
const DURATION_MINUTES: Record<string, number> = {
  "1h": 60, "2-3h": 150, "half-day": 240, "full-day": 480,
};

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const MODE_ICON: Record<TransportMode, typeof Footprints> = {
  WALK: Footprints, BICYCLE: Bike, DRIVE: Car, TRANSIT: Train,
};
const MODE_LABEL: Record<TransportMode, string> = {
  WALK: "徒歩", BICYCLE: "自転車", DRIVE: "車", TRANSIT: "電車",
};

// ── ユーティリティ ────────────────────────────────────────────
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

function formatDistanceShort(meters: number): string {
  return meters < 1000
    ? `${Math.max(10, Math.round(meters / 10) * 10)}m`
    : `${(meters / 1000).toFixed(1)}km`;
}

function formatDayDate(startDate: string, dayNum: number): string {
  const date = new Date(startDate + "T00:00:00");
  date.setDate(date.getDate() + dayNum - 1);
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dow = DAY_NAMES[date.getDay()];
  return `${m}/${d}(${dow})`;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const mm = Math.round(min % 60);
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ── 移動時間キャッシュ & フック ──────────────────────────────
type LegResult = { durationSeconds: number; distanceMeters: number } | "error";
const legCache = new Map<string, LegResult>();

function legKey(a: Place, b: Place, mode: TransportMode): string {
  return `${mode}:${a.lat},${a.lng}|${b.lat},${b.lng}`;
}

function useLegTimes(
  groups: { day: number | null; items: Place[] }[],
  defaultMode: TransportMode,
  legModeOverrides: Record<string, TransportMode>,
) {
  const [legs, setLegs] = useState<Record<string, LegResult>>({});

  const pairs = useMemo(() => {
    const out: { from: Place; to: Place; mode: TransportMode; key: string }[] = [];
    for (const g of groups) {
      if (g.day == null) continue;
      for (let i = 0; i < g.items.length - 1; i++) {
        const overKey = `${g.items[i].id}|${g.items[i + 1].id}`;
        const mode = legModeOverrides[overKey] ?? defaultMode;
        out.push({
          from: g.items[i],
          to: g.items[i + 1],
          mode,
          key: legKey(g.items[i], g.items[i + 1], mode),
        });
      }
    }
    return out;
  }, [groups, defaultMode, legModeOverrides]);

  const pairsKey = pairs.map((p) => p.key).join(";");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, LegResult> = {};
      let changed = false;
      for (const { from, to, mode, key } of pairs) {
        const cached = legCache.get(key);
        if (cached) {
          next[key] = cached;
          continue;
        }
        try {
          const res = await fetch("/api/directions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              originLat: from.lat, originLng: from.lng,
              destLat: to.lat, destLng: to.lng,
              mode,
            }),
          });
          const data = res.ok ? await res.json() : null;
          const result: LegResult = data
            ? { durationSeconds: data.durationSeconds ?? 0, distanceMeters: data.distanceMeters ?? 0 }
            : "error";
          legCache.set(key, result);
          next[key] = result;
          changed = true;
        } catch {
          legCache.set(key, "error");
          next[key] = "error";
          changed = true;
        }
        if (cancelled) return;
      }
      if (!cancelled && (changed || Object.keys(next).length > 0)) {
        setLegs((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey]);

  return legs;
}

// ── 到着時刻の自動推定 ───────────────────────────────────────
function estimateArrivalTimes(
  items: Place[],
  legs: Record<string, LegResult>,
  defaultMode: TransportMode,
  legModeOverrides: Record<string, TransportMode>,
): Record<string, string> {
  const estimates: Record<string, string> = {};
  let currentMin: number | null = null;

  for (let i = 0; i < items.length; i++) {
    const place = items[i];
    if (place.plan_time) {
      currentMin = timeToMinutes(place.plan_time);
    } else if (currentMin !== null) {
      estimates[place.id] = minutesToTime(currentMin);
    }

    if (currentMin !== null) {
      currentMin += place.duration ? (DURATION_MINUTES[place.duration] ?? 60) : 60;
      if (i < items.length - 1) {
        const overKey = `${place.id}|${items[i + 1].id}`;
        const mode = legModeOverrides[overKey] ?? defaultMode;
        const leg = legs[legKey(place, items[i + 1], mode)];
        if (leg && leg !== "error") {
          currentMin += Math.round(leg.durationSeconds / 60);
        } else {
          const dist = calcDistance(place.lat, place.lng, items[i + 1].lat, items[i + 1].lng);
          currentMin += Math.ceil(dist / 80);
        }
      }
    }
  }
  return estimates;
}

// ── 旅行設定バー ──────────────────────────────────────────────
function TripSettingsBar() {
  const {
    tripStartDate, tripDays, defaultTransportMode,
    setTripStartDate, setTripDays, setDefaultTransportMode,
  } = useMapStore();

  return (
    <div className="border-b bg-muted/30 px-4 py-2.5 space-y-2">
      {/* 日付 & 日数 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Calendar className="size-3.5 text-muted-foreground shrink-0" />
          <input
            type="date"
            value={tripStartDate || ""}
            onChange={(e) => setTripStartDate(e.target.value || null)}
            className="text-sm bg-background border rounded-lg px-2 py-1 outline-none cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">日数</span>
          <div className="flex items-center border rounded-lg overflow-hidden bg-background">
            <button
              onClick={() => setTripDays(Math.max(1, (tripDays || 1) - 1))}
              className="px-2 py-1 hover:bg-muted transition-colors cursor-pointer"
            >
              <span className="text-xs font-bold leading-none">−</span>
            </button>
            <span className="px-2 text-sm font-semibold min-w-[28px] text-center tabular-nums">
              {tripDays || "—"}
            </span>
            <button
              onClick={() => setTripDays((tripDays || 1) + 1)}
              className="px-2 py-1 hover:bg-muted transition-colors cursor-pointer"
            >
              <Plus className="size-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 移動手段 */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1 shrink-0">移動手段</span>
        {TRANSPORT_MODES.map((mode) => {
          const Icon = MODE_ICON[mode.id];
          const active = defaultTransportMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setDefaultTransportMode(mode.id)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background border text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3" />
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 移動区間の行 ──────────────────────────────────────────────
function LegRow({
  from, to, leg, mode, onCycleMode,
}: {
  from: Place; to: Place;
  leg: LegResult | undefined;
  mode: TransportMode;
  onCycleMode: () => void;
}) {
  const Icon = MODE_ICON[mode];
  const modeLabel = MODE_LABEL[mode];

  let info: string;
  if (leg && leg !== "error") {
    const min = Math.max(1, Math.round(leg.durationSeconds / 60));
    info = `${modeLabel} 約${formatMinutes(min)}（${formatDistanceShort(leg.distanceMeters)}）`;
  } else if (leg === "error") {
    const dist = calcDistance(from.lat, from.lng, to.lat, to.lng);
    info = `直線 ${formatDistanceShort(dist)}`;
  } else {
    info = "取得中…";
  }

  return (
    <div className="flex items-center gap-1.5 pl-6 pr-4 py-1 text-[11px] text-muted-foreground bg-muted/15">
      <button
        onClick={onCycleMode}
        className="shrink-0 size-5 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors cursor-pointer"
        title="この区間の移動手段を変更"
      >
        <Icon className="size-2.5" />
      </button>
      <span className="border-l border-dashed border-muted-foreground/30 h-3 mx-0.5" />
      <span>{info}</span>
    </div>
  );
}

// ── D&D スポット行 ────────────────────────────────────────────
function SortableItem({
  place, index, canPlan, maxDay,
  estimatedTime,
  onSelect, onAssignDay, onSetTime,
}: {
  place: Place;
  index: number;
  canPlan: boolean;
  maxDay: number;
  estimatedTime: string | null;
  onSelect: () => void;
  onAssignDay: (day: number | null) => void;
  onSetTime: (time: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
    disabled: !canPlan,
  });

  const displayTime = place.plan_time || estimatedTime;
  const isEstimated = !place.plan_time && !!estimatedTime;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center border-b last:border-b-0 bg-background",
        isDragging && "opacity-40"
      )}
    >
      {canPlan && (
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 pl-2 pr-1 py-3 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          title="ドラッグして並べ替え"
        >
          <GripVertical className="size-4" />
        </button>
      )}

      {/* 時刻 */}
      <div className="shrink-0 w-[52px] text-center">
        {canPlan ? (
          <input
            type="time"
            value={place.plan_time || ""}
            onChange={(e) => onSetTime(e.target.value || null)}
            className={cn(
              "w-full text-[11px] text-center bg-transparent outline-none cursor-pointer",
              "border-b border-dashed",
              place.plan_time
                ? "text-primary font-semibold border-primary/30"
                : "text-muted-foreground border-muted-foreground/30"
            )}
          />
        ) : displayTime ? (
          <span
            className={cn(
              "text-[11px] font-mono",
              isEstimated ? "text-muted-foreground/60 italic" : "text-primary font-semibold"
            )}
          >
            {isEstimated ? `≈${displayTime}` : displayTime}
          </span>
        ) : null}
      </div>

      {/* メイン情報 */}
      <button
        onClick={onSelect}
        className={cn(
          "flex-1 min-w-0 flex items-center gap-2 py-2.5 text-left hover:bg-muted/50 transition-colors cursor-pointer",
          canPlan ? "pr-2" : "px-2"
        )}
      >
        <span className="shrink-0 size-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold truncate">{place.name}</span>
          {place.address && (
            <span className="block text-[11px] text-muted-foreground truncate">{place.address}</span>
          )}
        </span>
        {place.duration && (
          <span className="shrink-0 flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            {DURATION_LABELS[place.duration] ?? place.duration}
          </span>
        )}
      </button>

      {/* 日選択 */}
      {canPlan && (
        <div className="shrink-0 pr-3">
          <select
            value={place.plan_day ?? ""}
            onChange={(e) => onAssignDay(e.target.value === "" ? null : Number(e.target.value))}
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
  );
}

// ── 日グループ（droppable）─────────────────────────────────────
function DayGroup({
  group, children, summary, dateLabel,
}: {
  group: { day: number | null; label: string; items: Place[] };
  children: React.ReactNode;
  summary: string | null;
  dateLabel: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.day ?? "none"}` });

  return (
    <div ref={setNodeRef} className={cn("mb-2", isOver && "bg-primary/5")}>
      <div className="sticky top-0 z-[1] bg-secondary/60 backdrop-blur px-4 py-1.5 text-xs font-bold text-secondary-foreground flex items-center gap-1.5">
        <CalendarDays className="size-3.5" />
        <span>{group.label}</span>
        {dateLabel && (
          <span className="text-muted-foreground font-normal">{dateLabel}</span>
        )}
        <span className="text-muted-foreground font-normal">
          （{group.items.length}件）
        </span>
        {summary && (
          <span className="ml-auto text-[11px] text-muted-foreground font-normal truncate max-w-[45%]">
            {summary}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── メイン ────────────────────────────────────────────────────
interface ItineraryViewProps {
  places: Place[];
  canPlan: boolean;
  onSelectPlace: (place: Place) => void;
  persistPlan: (place: Place, day: number | null, order: number | null) => Promise<void>;
  persistPlanTime: (place: Place, time: string | null) => Promise<void>;
}

export function ItineraryView({
  places, canPlan, onSelectPlace, persistPlan, persistPlanTime,
}: ItineraryViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [legModeOverrides, setLegModeOverrides] = useState<Record<string, TransportMode>>({});
  const { tripStartDate, tripDays, defaultTransportMode, setTripDays } = useMapStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const maxDay = Math.max(
    places.reduce((m, p) => Math.max(m, p.plan_day ?? 0), 0),
    tripDays ?? 0,
  );

  const sortByOrder = (a: Place, b: Place) =>
    (a.plan_order ?? Number.MAX_SAFE_INTEGER) - (b.plan_order ?? Number.MAX_SAFE_INTEGER) ||
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  const dayGroups = useMemo(() => {
    const groups: { day: number | null; label: string; items: Place[] }[] = [];
    for (let d = 1; d <= maxDay; d++) {
      groups.push({
        day: d,
        label: `${d}日目`,
        items: places.filter((p) => p.plan_day === d).sort(sortByOrder),
      });
    }
    groups.push({
      day: null,
      label: "未定",
      items: places.filter((p) => !p.plan_day).sort(sortByOrder),
    });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, maxDay]);

  const legs = useLegTimes(dayGroups, defaultTransportMode, legModeOverrides);

  // 日ごとサマリー
  function daySummary(group: { day: number | null; items: Place[] }): string | null {
    if (group.day == null || group.items.length === 0) return null;
    let travelMin = 0;
    let hasTravel = false;
    for (let i = 0; i < group.items.length - 1; i++) {
      const overKey = `${group.items[i].id}|${group.items[i + 1].id}`;
      const mode = legModeOverrides[overKey] ?? defaultTransportMode;
      const leg = legs[legKey(group.items[i], group.items[i + 1], mode)];
      if (leg && leg !== "error") {
        travelMin += leg.durationSeconds / 60;
        hasTravel = true;
      }
    }
    const stayMin = group.items.reduce(
      (sum, p) => sum + (p.duration ? DURATION_MINUTES[p.duration] ?? 0 : 0),
      0,
    );
    const parts: string[] = [];
    if (hasTravel) parts.push(`移動${formatMinutes(Math.round(travelMin))}`);
    if (stayMin > 0) parts.push(`滞在${formatMinutes(stayMin)}`);
    return parts.length > 0 ? parts.join(" / ") : null;
  }

  // 到着時刻の推定
  function getEstimates(group: { day: number | null; items: Place[] }): Record<string, string> {
    if (group.day == null) return {};
    return estimateArrivalTimes(group.items, legs, defaultTransportMode, legModeOverrides);
  }

  // 区間の移動手段をサイクル
  function cycleLegMode(fromId: string, toId: string) {
    const key = `${fromId}|${toId}`;
    const modes: TransportMode[] = ["WALK", "BICYCLE", "DRIVE", "TRANSIT"];
    const current = legModeOverrides[key] ?? defaultTransportMode;
    const idx = modes.indexOf(current);
    const next = modes[(idx + 1) % modes.length];
    setLegModeOverrides((prev) => ({ ...prev, [key]: next }));
  }

  async function assignDay(place: Place, day: number | null) {
    const nextOrder = day == null ? null : places.filter((p) => p.plan_day === day).length;
    await persistPlan(place, day, nextOrder);
  }

  function findGroupOf(placeId: string) {
    return dayGroups.find((g) => g.items.some((p) => p.id === placeId));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const place = places.find((p) => p.id === active.id);
    if (!place) return;
    const sourceGroup = findGroupOf(place.id);
    if (!sourceGroup) return;

    let destDay: number | null;
    let destIndex: number;
    const overId = String(over.id);
    if (overId.startsWith("group:")) {
      const raw = overId.slice("group:".length);
      destDay = raw === "none" ? null : Number(raw);
      const destGroup = dayGroups.find((g) => g.day === destDay);
      destIndex = destGroup ? destGroup.items.length : 0;
    } else {
      const overGroup = findGroupOf(overId);
      if (!overGroup) return;
      destDay = overGroup.day;
      destIndex = overGroup.items.findIndex((p) => p.id === overId);
    }

    if (destDay == null) {
      if (place.plan_day != null) await persistPlan(place, null, null);
      return;
    }

    const sameDay = sourceGroup.day === destDay;
    const destGroup = dayGroups.find((g) => g.day === destDay);
    if (!destGroup) return;

    const items = destGroup.items.filter((p) => p.id !== place.id);
    const insertAt = Math.min(Math.max(destIndex, 0), items.length);
    items.splice(insertAt, 0, place);

    const updates: Promise<void>[] = [];
    items.forEach((p, i) => {
      if (p.plan_day !== destDay || p.plan_order !== i) {
        updates.push(persistPlan(p, destDay, i));
      }
    });

    if (!sameDay && sourceGroup.day != null) {
      sourceGroup.items
        .filter((p) => p.id !== place.id)
        .forEach((p, i) => {
          if (p.plan_order !== i) updates.push(persistPlan(p, sourceGroup.day, i));
        });
    }

    await Promise.all(updates);
  }

  const activePlace = activeId ? places.find((p) => p.id === activeId) : null;

  return (
    <div className="flex flex-col h-full">
      <TripSettingsBar />

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex-1 overflow-y-auto pb-6">
          {!canPlan && (
            <p className="text-[11px] text-muted-foreground px-4 py-2">
              日程の編集はリーダー・管理者のみ可能です。
            </p>
          )}
          {canPlan && (
            <p className="text-[11px] text-muted-foreground px-4 py-2">
              <GripVertical className="size-3 inline -mt-0.5" /> で並べ替え、区間アイコンをタップで移動手段を切替
            </p>
          )}

          {dayGroups.map((group) => {
            const estimates = getEstimates(group);
            return (
              <DayGroup
                key={group.label}
                group={group}
                summary={daySummary(group)}
                dateLabel={
                  group.day != null && tripStartDate
                    ? formatDayDate(tripStartDate, group.day)
                    : null
                }
              >
                {group.items.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-4 py-2">
                    スポットなし{canPlan ? "（ドロップで追加）" : ""}
                  </p>
                ) : (
                  <SortableContext
                    items={group.items.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {group.items.map((place, i) => {
                      const overKey = i > 0
                        ? `${group.items[i - 1].id}|${place.id}`
                        : "";
                      const legMode = overKey
                        ? (legModeOverrides[overKey] ?? defaultTransportMode)
                        : defaultTransportMode;
                      return (
                        <div key={place.id}>
                          {i > 0 && group.day != null && (
                            <LegRow
                              from={group.items[i - 1]}
                              to={place}
                              leg={legs[legKey(group.items[i - 1], place, legMode)]}
                              mode={legMode}
                              onCycleMode={() =>
                                cycleLegMode(group.items[i - 1].id, place.id)
                              }
                            />
                          )}
                          <SortableItem
                            place={place}
                            index={i}
                            canPlan={canPlan}
                            maxDay={maxDay}
                            estimatedTime={estimates[place.id] || null}
                            onSelect={() => onSelectPlace(place)}
                            onAssignDay={(day) => assignDay(place, day)}
                            onSetTime={(time) => persistPlanTime(place, time)}
                          />
                        </div>
                      );
                    })}
                  </SortableContext>
                )}
              </DayGroup>
            );
          })}

          {/* 日を追加ボタン */}
          {canPlan && (
            <button
              onClick={() => setTripDays(maxDay + 1)}
              className="flex items-center gap-1.5 mx-4 mt-2 px-3 py-2 text-xs text-muted-foreground border border-dashed rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <Plus className="size-3.5" />
              日を追加
            </button>
          )}
        </div>

        <DragOverlay>
          {activePlace && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-background border rounded-lg shadow-lg">
              <GripVertical className="size-4 text-muted-foreground/50" />
              <span className="text-sm font-semibold truncate">{activePlace.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
