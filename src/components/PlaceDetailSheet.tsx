"use client";

import { useEffect, useState } from "react";
import {
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Wallet,
  Clock,
  FileText,
  Navigation,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase, type Place, type SpotStatus } from "@/lib/supabase";
import { DURATION_LABELS } from "@/lib/constants";
import { BusinessHoursBadge } from "@/components/BusinessHoursBadge";
import { useMapStore } from "@/store/useMapStore";
import { cn } from "@/lib/utils";

interface PlaceDetailSheetProps {
  place: Place | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (place: Place) => void;
  onDeleted: (placeId: string) => void;
}

function UserAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
      {initial}
    </div>
  );
}

// ウィンドウ幅がsmブレークポイント(640px)以上かを返すhook
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 640 : true
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

export function PlaceDetailSheet({
  place,
  open,
  onOpenChange,
  onEdit,
  onDeleted,
}: PlaceDetailSheetProps) {
  const [imgIdx, setImgIdx] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isDesktop = useIsDesktop();

  const { spotStatuses, setSpotStatus, removeSpotStatus, currentUser, myRole } = useMapStore();
  const isPrivileged = myRole === "leader" || myRole === "admin";
  const isOwn = place?.created_by_id === currentUser.id;
  const canEdit = isPrivileged || isOwn;
  const canDelete = isPrivileged || isOwn;
  const currentStatus: SpotStatus | null = place
    ? (spotStatuses[place.id] ?? null)
    : null;

  const images = place?.image_urls ?? [];

  useEffect(() => {
    setImgIdx(0);
  }, [place?.id]);

  // ── 論理削除（soft delete）──────────────────────────
  async function handleDelete() {
    if (!place) return;
    setDeleting(true);
    const { error } = await supabase
      .from("places")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", place.id);
    setDeleting(false);
    if (!error) {
      setDeleteDialogOpen(false);
      onOpenChange(false);
      onDeleted(place.id);
    }
  }

  if (!place) return null;

  const budgetText = (() => {
    const parts: string[] = [];
    if (place.budget_min != null)
      parts.push(`¥${place.budget_min.toLocaleString()}`);
    if (place.budget_max != null)
      parts.push(`¥${place.budget_max.toLocaleString()}`);
    return parts.length > 0 ? parts.join(" 〜 ") : null;
  })();

  const createdDate = new Date(place.created_at).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const content = (
    <>
      {/* 画像ギャラリー */}
      <div className="relative aspect-video bg-muted shrink-0 overflow-hidden">
        {images.length > 0 ? (
          <>
            <img
              src={images[imgIdx]}
              alt={place.name}
              className="w-full h-full object-cover"
            />

            {/* 閉じるボタン */}
            <button
              onClick={() => onOpenChange(false)}
              className="absolute top-2 right-2 z-10 bg-black/40 text-white rounded-full p-2 hover:bg-black/60 transition-colors"
              title="閉じる"
            >
              <span className="sr-only">閉じる</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>

            {images.length > 1 && (
              <>
                <button
                  onClick={() => setImgIdx((i) => Math.max(0, i - 1))}
                  disabled={imgIdx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 disabled:opacity-30 hover:bg-black/60 transition-colors"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  onClick={() =>
                    setImgIdx((i) => Math.min(images.length - 1, i + 1))
                  }
                  disabled={imgIdx === images.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 disabled:opacity-30 hover:bg-black/60 transition-colors"
                >
                  <ChevronRight className="size-4" />
                </button>
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIdx(i)}
                      className={cn(
                        "size-1.5 rounded-full transition-colors",
                        i === imgIdx ? "bg-white" : "bg-white/50"
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            <MapPin className="size-12 text-muted-foreground/20" />
            {/* 閉じるボタン (画像無し時) */}
            <button
              onClick={() => onOpenChange(false)}
              className="absolute top-2 right-2 z-10 bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50 rounded-full p-2 hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
              title="閉じる"
            >
              <span className="sr-only">閉じる</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* コンテンツ */}
      <div className="flex flex-col gap-4 p-5 flex-1">
        {/* タイトル + アクションボタン */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold leading-tight">{place.name}</h2>
          <div className="flex gap-1 shrink-0">
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(place);
                }}
                title="編集"
              >
                <Pencil className="size-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
                title="削除"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {/* ── ステータス 3-State ToggleGroup ── */}
        <ToggleGroup
          type="single"
          value={currentStatus ?? ""}
          onValueChange={(v) => {
            if (!v) {
              removeSpotStatus(place.id);
            } else {
              setSpotStatus(place.id, v as SpotStatus);
            }
          }}
          className="w-full gap-2"
        >
          <ToggleGroupItem
            value="want_to_go"
            className="flex-1 text-sm h-10 rounded-xl border font-medium data-[state=on]:bg-amber-50 data-[state=on]:text-amber-700 data-[state=on]:border-amber-300"
          >
            ⭐ 行きたい
          </ToggleGroupItem>
          <ToggleGroupItem
            value="visited"
            className="flex-1 text-sm h-10 rounded-xl border font-medium data-[state=on]:bg-green-50 data-[state=on]:text-green-700 data-[state=on]:border-green-300"
          >
            ✅ 行った
          </ToggleGroupItem>
        </ToggleGroup>

        {/* 作成者 */}
        {place.created_by_name && (
          <div className="flex items-center gap-2">
            <UserAvatar name={place.created_by_name} />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">登録者</span>
              <span className="text-sm font-medium">{place.created_by_name}</span>
            </div>
          </div>
        )}

        {/* 営業時間バッジ */}
        {(place.business_hours || place.opening_hours_text) && (
          <BusinessHoursBadge
            businessHours={place.business_hours}
            openingHoursText={place.opening_hours_text}
          />
        )}

        {/* 営業時間テキスト */}
        {(() => {
          const displayText =
            place.business_hours?.weekday_text?.length
              ? place.business_hours.weekday_text.join("\n")
              : place.opening_hours_text;
          return displayText ? (
            <div className="flex items-start gap-2.5 text-sm">
              <Clock className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
              <p className="whitespace-pre-wrap leading-relaxed">
                {displayText}
              </p>
            </div>
          ) : null;
        })()}

        {/* カテゴリ */}
        {place.categories && place.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {place.categories.map((cat) => (
              <Badge key={cat} variant="secondary">
                {cat}
              </Badge>
            ))}
          </div>
        )}

        {/* 住所 */}
        {place.address && (
          <div className="flex items-start gap-2.5 text-sm">
            <MapPin className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
            <span>{place.address}</span>
          </div>
        )}

        {/* 予算 */}
        {budgetText && (
          <div className="flex items-center gap-2.5 text-sm">
            <Wallet className="size-4 shrink-0 text-muted-foreground" />
            <span>{budgetText}</span>
          </div>
        )}

        {/* 滞在時間 */}
        {place.duration && (
          <div className="flex items-center gap-2.5 text-sm">
            <Clock className="size-4 shrink-0 text-muted-foreground" />
            <span>{DURATION_LABELS[place.duration] ?? place.duration}</span>
          </div>
        )}

        {/* メモ */}
        {place.note && (
          <div className="flex items-start gap-2.5 text-sm">
            <FileText className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
            <p className="whitespace-pre-wrap leading-relaxed">{place.note}</p>
          </div>
        )}

        {/* Googleマップで経路を見る */}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#4285F4] hover:bg-[#3367D6] text-white text-sm font-medium py-2.5 px-4 transition-colors"
        >
          <Navigation className="size-4" />
          Googleマップで経路を見る
        </a>

        {/* フッター */}
        <div className="mt-auto pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>
            📍 {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
          </span>
          <span>{createdDate}</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Sheet 1つだけ: 画面幅に応じてsideを切り替え */}
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent
          side={isDesktop ? "right" : "bottom"}
          className={cn(
            "flex flex-col p-0 overflow-y-auto overscroll-y-none",
            isDesktop ? "sm:max-w-md" : "h-[85dvh] rounded-t-2xl"
          )}
          style={{ touchAction: "pan-y" }}
          showCloseButton={false}
          onPointerDownCapture={(e) => {
            // スワイプ判定の起点でマップイベント等への伝播を防ぐ
            e.stopPropagation();
          }}
          onPointerMoveCapture={(e) => {
            e.stopPropagation();
          }}
          onTouchMoveCapture={(e) => {
            e.stopPropagation();
          }}
          onWheelCapture={(e) => {
            e.stopPropagation();
          }}
        >
          <SheetTitle className="sr-only">{place.name}</SheetTitle>
          {content}
        </SheetContent>
      </Sheet>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>スポットを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{place.name}」を削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "削除中..." : "削除する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
