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
import { CalendarDays, GripVertical, Footprints, Clock } from "lucide-react";
import type { Place } from "@/lib/supabase";
import { calcDistance, formatDistance } from "@/lib/geo";
import { DURATION_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ── 滞在時間の目安（duration フィールド → 分）────────────────────────
const DURATION_MINUTES: Record<string, number> = {
  "1h": 60,
  "2-3h": 150,
  "half-day": 240,
  "full-day": 480,
};

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

// ── スポット間の徒歩時間（/api/directions・モジュールキャッシュ）───────
type LegResult = { durationSeconds: number; distanceMeters: number } | "error";
const legCache = new Map<string, LegResult>();

function legKey(a: Place, b: Place): string {
  return `${a.lat},${a.lng}|${b.lat},${b.lng}`;
}

function useLegTimes(groups: { day: number | null; items: Place[] }[]) {
  const [legs, setLegs] = useState<Record<string, LegResult>>({});

  // 各日の連続ペアを列挙（未定グループは対象外）
  const pairs = useMemo(() => {
    const out: [Place, Place][] = [];
    for (const g of groups) {
      if (g.day == null) continue;
      for (let i = 0; i < g.items.length - 1; i++) {
        out.push([g.items[i], g.items[i + 1]]);
      }
    }
    return out;
  }, [groups]);

  const pairsKey = pairs.map(([a, b]) => legKey(a, b)).join(";");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const next: Record<string, LegResult> = {};
      let changed = false;
      for (const [a, b] of pairs) {
        const key = legKey(a, b);
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
              originLat: a.lat, originLng: a.lng,
              destLat: b.lat, destLng: b.lng,
              mode: "WALK",
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

// ── 移動時間の行（スポット間に挟む）─────────────────────────────────
function LegRow({ from, to, leg }: { from: Place; to: Place; leg: LegResult | undefined }) {
  let label: string;
  if (leg && leg !== "error") {
    const min = Math.max(1, Math.round(leg.durationSeconds / 60));
    label = `徒歩 約${formatMinutes(min)}（${formatDistance(leg.distanceMeters)}）`;
  } else if (leg === "error") {
    // 経路取得失敗時は直線距離にフォールバック
    label = `直線距離 ${formatDistance(calcDistance(from.lat, from.lng, to.lat, to.lng))}`;
  } else {
    label = "移動時間を取得中...";
  }
  return (
    <div className="flex items-center gap-1.5 pl-10 pr-4 py-1 text-[11px] text-muted-foreground bg-muted/20">
      <Footprints className="size-3 shrink-0 opacity-60" />
      {label}
    </div>
  );
}

// ── D&D 可能なスポット行 ────────────────────────────────────────────
function SortableItem({
  place,
  index,
  canPlan,
  maxDay,
  onSelect,
  onAssignDay,
}: {
  place: Place;
  index: number;
  canPlan: boolean;
  maxDay: number;
  onSelect: () => void;
  onAssignDay: (day: number | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
    disabled: !canPlan,
  });

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
      <button
        onClick={onSelect}
        className={cn(
          "flex-1 min-w-0 flex items-center gap-2 py-2.5 text-left hover:bg-muted/50 transition-colors cursor-pointer",
          canPlan ? "pr-2" : "px-4"
        )}
      >
        <span className="shrink-0 size-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold truncate">{place.name}</span>
          {place.address && (
            <span className="block text-[11px] text-muted-foreground truncate">{place.address}</span>
          )}
        </span>
        {place.duration && (
          <span className="ml-auto shrink-0 flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            {DURATION_LABELS[place.duration] ?? place.duration}
          </span>
        )}
      </button>
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

// ── 日グループ（droppable コンテナ）─────────────────────────────────
function DayGroup({
  group,
  children,
  summary,
}: {
  group: { day: number | null; label: string; items: Place[] };
  children: React.ReactNode;
  summary: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.day ?? "none"}` });

  return (
    <div ref={setNodeRef} className={cn("mb-2", isOver && "bg-primary/5")}>
      <div className="sticky top-0 z-[1] bg-secondary/60 backdrop-blur px-4 py-1.5 text-xs font-bold text-secondary-foreground flex items-center gap-1.5">
        <CalendarDays className="size-3.5" />
        {group.label}
        <span className="text-muted-foreground font-normal">
          （{group.items.length}）
        </span>
        {summary && (
          <span className="ml-auto text-[11px] text-muted-foreground font-normal">{summary}</span>
        )}
      </div>
      {children}
    </div>
  );
}

interface ItineraryViewProps {
  places: Place[];
  canPlan: boolean;
  onSelectPlace: (place: Place) => void;
  persistPlan: (place: Place, day: number | null, order: number | null) => Promise<void>;
}

// ── 日程ビュー本体（D&D 並べ替え + 移動時間表示）────────────────────
export function ItineraryView({ places, canPlan, onSelectPlace, persistPlan }: ItineraryViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  const maxDay = places.reduce((m, p) => Math.max(m, p.plan_day ?? 0), 0);
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

  const legs = useLegTimes(dayGroups);

  // 日ごとのサマリー: 移動合計 + 滞在目安
  function daySummary(group: { day: number | null; items: Place[] }): string | null {
    if (group.day == null || group.items.length === 0) return null;
    let travelMin = 0;
    let hasTravel = false;
    for (let i = 0; i < group.items.length - 1; i++) {
      const leg = legs[legKey(group.items[i], group.items[i + 1])];
      if (leg && leg !== "error") {
        travelMin += leg.durationSeconds / 60;
        hasTravel = true;
      }
    }
    const stayMin = group.items.reduce(
      (sum, p) => sum + (p.duration ? DURATION_MINUTES[p.duration] ?? 0 : 0),
      0
    );
    const parts: string[] = [];
    if (hasTravel) parts.push(`移動 ${formatMinutes(Math.round(travelMin))}`);
    if (stayMin > 0) parts.push(`滞在 ${formatMinutes(stayMin)}`);
    return parts.length > 0 ? parts.join(" / ") : null;
  }

  async function assignDay(place: Place, day: number | null) {
    const nextOrder = day == null ? null : places.filter((p) => p.plan_day === day).length;
    await persistPlan(place, day, nextOrder);
  }

  function findGroupOf(placeId: string): { day: number | null; items: Place[] } | undefined {
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

    // ドロップ先: 日グループ直下（group:X）or アイテム上
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

    // 未定グループへは「割り当て解除」として扱う
    if (destDay == null) {
      if (place.plan_day != null) await persistPlan(place, null, null);
      return;
    }

    const sameDay = sourceGroup.day === destDay;
    const destGroup = dayGroups.find((g) => g.day === destDay);
    if (!destGroup) return;

    // 対象日の新しい並びを構築
    const items = destGroup.items.filter((p) => p.id !== place.id);
    const insertAt = Math.min(Math.max(destIndex, 0), items.length);
    items.splice(insertAt, 0, place);

    // 変わった分だけ永続化（対象日）
    const updates: Promise<void>[] = [];
    items.forEach((p, i) => {
      if (p.plan_day !== destDay || p.plan_order !== i) {
        updates.push(persistPlan(p, destDay, i));
      }
    });

    // 日をまたいだ場合は元の日も振り直し
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
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="pb-6">
        {!canPlan && (
          <p className="text-[11px] text-muted-foreground px-4 py-2">
            日程の編集はリーダー・管理者のみ可能です。
          </p>
        )}
        {canPlan && (
          <p className="text-[11px] text-muted-foreground px-4 py-2">
            <GripVertical className="size-3 inline -mt-0.5" /> をドラッグして並べ替え・日の移動ができます。
          </p>
        )}
        {dayGroups.map((group) => (
          <DayGroup key={group.label} group={group} summary={daySummary(group)}>
            {group.items.length === 0 ? (
              <p className="text-[11px] text-muted-foreground px-4 py-2">
                スポットなし{canPlan ? "（ここにドロップで割り当て）" : ""}
              </p>
            ) : (
              <SortableContext items={group.items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {group.items.map((place, i) => (
                  <div key={place.id}>
                    {i > 0 && group.day != null && (
                      <LegRow
                        from={group.items[i - 1]}
                        to={place}
                        leg={legs[legKey(group.items[i - 1], place)]}
                      />
                    )}
                    <SortableItem
                      place={place}
                      index={i}
                      canPlan={canPlan}
                      maxDay={maxDay}
                      onSelect={() => onSelectPlace(place)}
                      onAssignDay={(day) => assignDay(place, day)}
                    />
                  </div>
                ))}
              </SortableContext>
            )}
          </DayGroup>
        ))}
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
  );
}
