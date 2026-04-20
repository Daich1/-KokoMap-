"use client";

import { useState } from "react";
import { Heart, CheckCircle2, MapPin } from "lucide-react";
import { useMapStore } from "@/store/useMapStore";
import { getCategoryClass } from "@/lib/category";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Place } from "@/lib/supabase";

type PlanFilter = "all" | "want_to_go" | "visited";

interface PlanTabProps {
  onSelectPlace: (place: Place) => void;
}

function PlaceRow({
  place,
  wantCount,
  visitedCount,
  myStatus,
  onClick,
}: {
  place: Place;
  wantCount: number;
  visitedCount: number;
  myStatus: string | null;
  onClick: () => void;
}) {
  const category = place.categories?.[0];
  const hasImage = place.image_urls && place.image_urls.length > 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-3 px-4 hover:bg-muted/50 active:bg-muted transition-colors text-left cursor-pointer border-b last:border-b-0"
    >
      {/* サムネイル */}
      <div className="shrink-0 size-12 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={place.image_urls![0]}
            alt={place.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <MapPin className="size-5 text-muted-foreground" />
        )}
      </div>

      {/* テキスト情報 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {category && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0", getCategoryClass(category))}>
              {category}
            </Badge>
          )}
        </div>
        <p className="text-sm font-semibold truncate">{place.name}</p>
        {place.address && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{place.address}</p>
        )}
      </div>

      {/* カウント */}
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

export function PlanTab({ onSelectPlace }: PlanTabProps) {
  const [activeFilter, setActiveFilter] = useState<PlanFilter>("all");
  const { places, allMemberStatuses, spotStatuses } = useMapStore();

  const FILTER_TABS: { id: PlanFilter; label: string }[] = [
    { id: "all", label: "すべて" },
    { id: "want_to_go", label: "行きたい" },
    { id: "visited", label: "行った" },
  ];

  const filtered = places.filter((p) => {
    if (activeFilter === "all") return true;
    return spotStatuses[p.id] === activeFilter;
  });

  const wantCount = (placeId: string) =>
    Object.values(allMemberStatuses).filter((s) => s[placeId] === "want_to_go").length;

  const visitedCount = (placeId: string) =>
    Object.values(allMemberStatuses).filter((s) => s[placeId] === "visited").length;

  return (
    <div
      className="md:hidden fixed inset-x-0 top-0 z-[42] bg-background flex flex-col overflow-hidden"
      style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* ヘッダー（モバイルルームヘッダー52pxの下に来るようにpadding） */}
      <div className="shrink-0 border-b bg-background" style={{ paddingTop: "52px" }}>
        <div className="px-4 pt-3 pb-0">
          <h1 className="text-lg font-bold tracking-tight mb-3">プランニング</h1>
          {/* フィルタータブ */}
          <div className="flex gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors cursor-pointer",
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
      </div>

      {/* スポットリスト */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
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
                myStatus={spotStatuses[place.id] ?? null}
                onClick={() => onSelectPlace(place)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
