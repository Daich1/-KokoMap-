"use client";

import { MapPin, Clock, Wallet, Navigation2, Utensils, Wine, Gamepad2, Landmark, Coffee, ShoppingBag, Camera, BedDouble, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { type Place, type SpotStatus } from "@/lib/supabase";
import { DURATION_LABELS } from "@/lib/constants";
import { BusinessHoursBadge } from "@/components/BusinessHoursBadge";
import { useMapStore } from "@/store/useMapStore";
import { cn } from "@/lib/utils";
import { useState, useCallback } from "react";
import type { EmblaCarouselType } from "embla-carousel";

const CATEGORY_EMOJI: Record<string, string> = {
  "食事": "🍜",
  "飲み": "🍺",
  "娯楽": "🎮",
  "観光": "🏛",
  "カフェ・休憩": "☕",
  "買い物": "🛍",
  "映え・絶景": "📸",
  "宿": "🏨",
  "風呂": "♨️",
};

interface PlaceCardProps {
  place: Place;
  onSelect: (place: Place) => void;
  distanceText?: string;
  /** false = グリッド表示（拡大時）、true = コンパクトリスト（通常サイドバー） */
  compact?: boolean;
}

function UserAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "xs" }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        "rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0",
        size === "xs" ? "size-4 text-[9px]" : "size-5 text-[10px]"
      )}
      title={name}
    >
      {initial}
    </div>
  );
}

function StatusToggle({
  placeId,
  currentStatus,
  compact,
}: {
  placeId: string;
  currentStatus: SpotStatus | null;
  compact: boolean;
}) {
  const { setSpotStatus, removeSpotStatus } = useMapStore();
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ToggleGroup
        type="single"
        value={currentStatus ?? ""}
        onValueChange={(v) => {
          if (!v) removeSpotStatus(placeId);
          else setSpotStatus(placeId, v as SpotStatus);
        }}
        className={cn("w-full", compact ? "gap-1" : "gap-1.5")}
      >
        <ToggleGroupItem
          value="want_to_go"
          className={cn(
            "flex-1 rounded-lg border transition-colors",
            "data-[state=on]:bg-amber-50 data-[state=on]:text-amber-700 data-[state=on]:border-amber-300",
            compact ? "text-xs h-8" : "text-xs h-9"
          )}
        >
          ⭐ 行きたい
        </ToggleGroupItem>
        <ToggleGroupItem
          value="visited"
          className={cn(
            "flex-1 rounded-lg border transition-colors",
            "data-[state=on]:bg-green-50 data-[state=on]:text-green-700 data-[state=on]:border-green-300",
            compact ? "text-xs h-8" : "text-xs h-9"
          )}
        >
          ✅ 行った
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

function ImageArea({
  images,
  name,
  businessHours,
  openingHoursText,
  compact,
  place,
}: {
  images: string[];
  name: string;
  businessHours: Place["business_hours"];
  openingHoursText: Place["opening_hours_text"];
  compact: boolean;
  place?: Place;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const onApiInit = useCallback((api: EmblaCarouselType | undefined) => {
    if (!api) return;
    api.on("select", () => setCurrentIndex(api.selectedScrollSnap()));
  }, []);

  const hasImage = images.length > 0;
  const hasMultiple = images.length > 1;

  const containerClass = compact
    ? "relative w-full overflow-hidden bg-muted aspect-[4/3]"
    : "relative w-full overflow-hidden bg-muted rounded-t-2xl aspect-[4/3]";

  return (
    <div className={containerClass}>
      {hasImage ? (
        hasMultiple ? (
          <Carousel className="w-full h-full" opts={{ loop: true }} setApi={onApiInit}>
            <CarouselContent className="ml-0 h-full">
              {images.map((url, i) => (
                <CarouselItem key={i} className="pl-0 h-full">
                  <img
                    src={url}
                    alt={`${name} ${i + 1}`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <div onClick={(e) => e.stopPropagation()}>
              <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-white/80 hover:bg-white border-0 shadow-md" />
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-white/80 hover:bg-white border-0 shadow-md" />
            </div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "rounded-full transition-all",
                    i === currentIndex ? "w-3 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/60"
                  )}
                />
              ))}
            </div>
          </Carousel>
        ) : (
          <img
            src={images[0]}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {/* カテゴリの絵文字プレースホルダー */}
          <span className={cn("select-none opacity-30", compact ? "text-3xl" : "text-4xl")}>
            {place?.categories?.[0] ? (CATEGORY_EMOJI[place.categories[0]] ?? "📍") : "📍"}
          </span>
        </div>
      )}

      {(businessHours || openingHoursText) && (
        <div className="absolute top-2 left-2 pointer-events-none">
          <BusinessHoursBadge businessHours={businessHours} openingHoursText={openingHoursText} />
        </div>
      )}

      {/* グリッドモード: 画像下部に薄いグラデーション */}
      {!compact && hasImage && (
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
      )}
    </div>
  );
}

// ── グリッドカード（拡大時）────────────────────────────────────────
function GridCard({ place, onSelect, distanceText }: Omit<PlaceCardProps, "compact">) {
  const { spotStatuses } = useMapStore();
  const currentStatus: SpotStatus | null = spotStatuses[place.id] ?? null;
  const images = place.image_urls ?? [];

  const budgetText =
    place.budget_min != null || place.budget_max != null
      ? [
        place.budget_min != null ? `¥${place.budget_min.toLocaleString()}` : null,
        place.budget_max != null ? `¥${place.budget_max.toLocaleString()}` : null,
      ]
        .filter(Boolean)
        .join(" 〜 ")
      : null;

  const durationLabel = place.duration ? (DURATION_LABELS[place.duration] ?? place.duration) : null;

  return (
    <div
      className="flex flex-col min-w-0 rounded-2xl bg-card shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden group card-accent-left animate-fade-up place-card-stagger touch-press"
      onClick={() => onSelect(place)}
    >
      <ImageArea
        images={images}
        name={place.name}
        businessHours={place.business_hours}
        openingHoursText={place.opening_hours_text}
        compact={false}
        place={place}
      />

      <div className="p-3.5 flex flex-col gap-2.5">
        {/* タイトル + 距離 */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">
            {place.name}
          </h3>
          {distanceText && (
            <span className="shrink-0 flex items-center gap-0.5 text-[11px] text-blue-500 font-medium mt-0.5">
              <Navigation2 className="size-3" />
              {distanceText}
            </span>
          )}
        </div>

        {/* カテゴリ */}
        {place.categories && place.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.categories.slice(0, 3).map((cat) => (
              <Badge key={cat} variant="secondary" className="text-[11px] px-1.5 py-0 h-5 font-normal">
                {cat}
              </Badge>
            ))}
          </div>
        )}

        {/* 予算 + 滞在時間 */}
        {(budgetText || durationLabel) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {budgetText && (
              <span className="flex items-center gap-1">
                <Wallet className="size-3 shrink-0" />
                {budgetText}
              </span>
            )}
            {durationLabel && (
              <span className="flex items-center gap-1">
                <Clock className="size-3 shrink-0" />
                {durationLabel}
              </span>
            )}
          </div>
        )}

        {/* ステータス */}
        <StatusToggle placeId={place.id} currentStatus={currentStatus} compact={false} />

        {/* 作成者 */}
        {place.created_by_name && (
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/50">
            <UserAvatar name={place.created_by_name} size="xs" />
            <span className="text-[11px] text-muted-foreground truncate">{place.created_by_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── コンパクトカード（通常サイドバー）────────────────────────────
function CompactCard({ place, onSelect, distanceText }: Omit<PlaceCardProps, "compact">) {
  const { spotStatuses } = useMapStore();
  const currentStatus: SpotStatus | null = spotStatuses[place.id] ?? null;
  const images = place.image_urls ?? [];

  const budgetText =
    place.budget_min != null || place.budget_max != null
      ? [
        place.budget_min != null ? `¥${place.budget_min.toLocaleString()}` : null,
        place.budget_max != null ? `¥${place.budget_max.toLocaleString()}` : null,
      ]
        .filter(Boolean)
        .join(" 〜 ")
      : null;

  const durationLabel = place.duration ? (DURATION_LABELS[place.duration] ?? place.duration) : null;

  return (
    <div
      className={cn(
        "flex flex-col shrink-0 min-w-0 rounded-xl border bg-card shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden group card-accent-left animate-fade-up place-card-stagger touch-press",
        currentStatus === "want_to_go" && "card-accent-want",
        currentStatus === "visited" && "card-accent-visited"
      )}
      onClick={() => onSelect(place)}
    >
      <ImageArea
        images={images}
        name={place.name}
        businessHours={place.business_hours}
        openingHoursText={place.opening_hours_text}
        compact={true}
        place={place}
      />

      <div className="p-3.5 flex flex-col gap-2 min-w-0">
        <h3 className="font-semibold text-sm leading-tight truncate">{place.name}</h3>

        {distanceText && (
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <Navigation2 className="size-3 shrink-0" />
            <span>{distanceText}</span>
          </div>
        )}

        {(budgetText || durationLabel) && (
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            {budgetText ? (
              <span className="flex items-center gap-1 shrink truncate min-w-0">
                <Wallet className="size-3.5 shrink-0" />
                <span className="truncate">{budgetText}</span>
              </span>
            ) : (
              <span />
            )}
            {durationLabel && (
              <span className="flex items-center gap-1 shrink-0 ml-auto whitespace-nowrap">
                <Clock className="size-3.5 shrink-0" />
                {durationLabel}
              </span>
            )}
          </div>
        )}

        {place.categories && place.categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {place.categories.slice(0, 3).map((cat) => (
              <Badge key={cat} variant="secondary" className="text-xs px-2 py-0.5">
                {cat}
              </Badge>
            ))}
            {place.categories.length > 3 && (
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                +{place.categories.length - 3}
              </Badge>
            )}
          </div>
        )}

        <StatusToggle placeId={place.id} currentStatus={currentStatus} compact={true} />

        {place.created_by_name && (
          <div className="flex items-center gap-1.5 mt-1 pt-2 border-t">
            <UserAvatar name={place.created_by_name} />
            <span className="text-xs text-muted-foreground truncate">{place.created_by_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PlaceCard({ place, onSelect, distanceText, compact = true }: PlaceCardProps) {
  return compact
    ? <CompactCard place={place} onSelect={onSelect} distanceText={distanceText} />
    : <GridCard place={place} onSelect={onSelect} distanceText={distanceText} />;
}
