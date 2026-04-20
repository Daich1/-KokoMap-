"use client";

import { MapPin, Clock, Wallet, Navigation2, Heart, CheckCircle2 } from "lucide-react";
import { getCategoryClass } from "@/lib/category";
import { Badge } from "@/components/ui/badge";
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
import Image from "next/image";

/** next/image の remotePatterns で許可済みのホスト */
const ALLOWED_HOSTS = new Set([
  "yxrvesnqmetogkmupkls.supabase.co",
  "maps.googleapis.com",
  "avatars.githubusercontent.com",
  "streetviewpixels-pa.googleapis.com",
]);

/**
 * next/image で最適化できないURLかを判定
 * - /api/... のような相対パス（レガシープロキシ）
 * - remotePatterns ホワイトリスト外の外部ドメイン
 */
function needsNativeImg(url: string): boolean {
  if (url.startsWith("/")) return true;
  try {
    const { hostname } = new URL(url);
    // **.googleusercontent.com はワイルドカードで許可済み
    if (hostname.endsWith(".googleusercontent.com") || hostname === "maps.googleapis.com") return false;
    return !ALLOWED_HOSTS.has(hostname);
  } catch {
    return true;
  }
}

/** 画像URLを適切なコンポーネントで表示するラッパー */
function PlaceImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted">
        <span className="text-3xl opacity-20 select-none">🖼</span>
      </div>
    );
  }

  if (needsNativeImg(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={`absolute inset-0 w-full h-full object-cover ${className ?? ""}`} onError={() => setHasError(true)} />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      className={className}
      onError={() => setHasError(true)}
    />
  );
}

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
}: {
  placeId: string;
  currentStatus: SpotStatus | null;
  compact: boolean;
}) {
  const { setSpotStatus, removeSpotStatus } = useMapStore();
  const toggle = (val: SpotStatus) => {
    if (currentStatus === val) removeSpotStatus(placeId);
    else setSpotStatus(placeId, val);
  };
  return (
    <div className="status-toggle-track flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button
        data-active={currentStatus === "want_to_go" ? "true" : "false"}
        data-want="true"
        className="status-toggle-option flex-1 flex items-center justify-center gap-1.5 py-[9px] rounded-[11px] text-xs font-medium data-[active=false]:text-muted-foreground"
        onClick={() => toggle("want_to_go")}
      >
        ⭐ 行きたい
      </button>
      <button
        data-active={currentStatus === "visited" ? "true" : "false"}
        data-been="true"
        className="status-toggle-option flex-1 flex items-center justify-center gap-1.5 py-[9px] rounded-[11px] text-xs font-medium data-[active=false]:text-muted-foreground"
        onClick={() => toggle("visited")}
      >
        ✅ 行った
      </button>
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
        hasMultiple && !compact ? (
          <Carousel className="w-full h-full" opts={{ loop: true }} setApi={onApiInit}>
            <CarouselContent className="ml-0 h-full">
              {images.map((url, i) => (
                <CarouselItem key={i} className="pl-0 h-full relative">
                  <PlaceImage
                    src={url}
                    alt={`${name} ${i + 1}`}
                    className="object-cover"
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <div onClick={(e) => e.stopPropagation()}>
              <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-background/85 hover:bg-background border-0 shadow-md" />
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-background/85 hover:bg-background border-0 shadow-md" />
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
        <PlaceImage
            src={images[0]}
            alt={name}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-secondary to-[var(--teal-200)] flex items-center justify-center">
          <MapPin className="text-primary/50" size={28} />
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
  const { spotStatuses, allMemberStatuses } = useMapStore();
  const currentStatus: SpotStatus | null = spotStatuses[place.id] ?? null;
  const wantCount = Object.values(allMemberStatuses).filter((s) => s[place.id] === "want_to_go").length;
  const visitedCount = Object.values(allMemberStatuses).filter((s) => s[place.id] === "visited").length;
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
            <span className="shrink-0 flex items-center gap-0.5 text-[11px] text-primary font-medium mt-0.5">
              <Navigation2 className="size-3" />
              {distanceText}
            </span>
          )}
        </div>

        {/* カテゴリ */}
        {place.categories && place.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.categories.slice(0, 3).map((cat) => (
              <Badge key={cat} variant="outline" className={cn("text-[11px] px-1.5 py-0 h-5 font-medium flex items-center gap-1 border", getCategoryClass(cat))}>
                <span className="badge-dot" />{cat}
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

        {/* みんなのリアクション */}
        {(wantCount > 0 || visitedCount > 0) && (
          <div className="flex items-center gap-3 text-xs">
            {wantCount > 0 && (
              <span className="flex items-center gap-0.5 text-amber-600 font-semibold">
                <Heart className="size-3 fill-amber-500 stroke-amber-500" />
                {wantCount}
              </span>
            )}
            {visitedCount > 0 && (
              <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
                <CheckCircle2 className="size-3" />
                {visitedCount}
              </span>
            )}
          </div>
        )}

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
  const { spotStatuses, allMemberStatuses } = useMapStore();
  const currentStatus: SpotStatus | null = spotStatuses[place.id] ?? null;
  const wantCount = Object.values(allMemberStatuses).filter((s) => s[place.id] === "want_to_go").length;
  const visitedCount = Object.values(allMemberStatuses).filter((s) => s[place.id] === "visited").length;
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
          <div className="flex items-center gap-1 text-xs text-primary">
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
              <Badge key={cat} variant="outline" className={cn("text-xs px-2 py-0.5 font-medium flex items-center gap-1 border", getCategoryClass(cat))}>
                <span className="badge-dot" />{cat}
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

        {(wantCount > 0 || visitedCount > 0) && (
          <div className="flex items-center gap-3 text-xs">
            {wantCount > 0 && (
              <span className="flex items-center gap-0.5 text-amber-600 font-semibold">
                <Heart className="size-3 fill-amber-500 stroke-amber-500" />
                {wantCount}
              </span>
            )}
            {visitedCount > 0 && (
              <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
                <CheckCircle2 className="size-3" />
                {visitedCount}
              </span>
            )}
          </div>
        )}

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
