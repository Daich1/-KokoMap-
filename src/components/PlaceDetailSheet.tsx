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
import { supabase, type Place, type SpotStatus } from "@/lib/supabase";
import { getCategoryClass } from "@/lib/category";
import { DURATION_LABELS } from "@/lib/constants";
import { BusinessHoursBadge } from "@/components/BusinessHoursBadge";
import { LinkifiedText } from "@/components/LinkifiedText";
import { useMapStore } from "@/store/useMapStore";
import { cn } from "@/lib/utils";
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
  priority,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted">
        <span className="text-4xl opacity-20 select-none">🖼</span>
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
      sizes="(max-width: 768px) 100vw, 50vw"
      className={className}
      priority={priority}
      onError={() => setHasError(true)}
    />
  );
}

interface PlaceDetailSheetProps {
  place: Place | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (place: Place) => void;
  onDeleted: (placeId: string) => void;
  onCreatorFilter?: (creatorId: string) => void;
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
  onCreatorFilter,
}: PlaceDetailSheetProps) {
  const [imgIdx, setImgIdx] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isDesktop = useIsDesktop();

  const { spotStatuses, setSpotStatus, removeSpotStatus, currentUser, myRole, allMemberStatuses, roomMembers } = useMapStore();
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
            <PlaceImage
              src={images[imgIdx]}
              alt={place.name}
              className="object-cover"
              priority
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
          <div className="w-full h-full bg-gradient-to-br from-[var(--teal-200)] to-[var(--teal-400)] flex items-center justify-center relative">
            <MapPin className="size-12 text-white/60" />
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
          <h2 className="text-xl font-bold leading-tight break-all">{place.name}</h2>
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

        {/* ── ステータストグル ── */}
        <div className="status-toggle-track flex gap-0.5">
          <button
            data-active={currentStatus === "want_to_go" ? "true" : "false"}
            data-want="true"
            className="status-toggle-option flex-1 flex items-center justify-center gap-1.5 py-[10px] rounded-[11px] text-sm font-medium data-[active=false]:text-muted-foreground"
            onClick={() => currentStatus === "want_to_go" ? removeSpotStatus(place.id) : setSpotStatus(place.id, "want_to_go")}
          >
            ⭐ 行きたい
          </button>
          <button
            data-active={currentStatus === "visited" ? "true" : "false"}
            data-been="true"
            className="status-toggle-option flex-1 flex items-center justify-center gap-1.5 py-[10px] rounded-[11px] text-sm font-medium data-[active=false]:text-muted-foreground"
            onClick={() => currentStatus === "visited" ? removeSpotStatus(place.id) : setSpotStatus(place.id, "visited")}
          >
            ✅ 行った
          </button>
        </div>

        {/* メンバーのリアクション */}
        {(() => {
          const reactions = roomMembers
            .map((m) => ({ member: m, status: allMemberStatuses[m.user_id]?.[place.id] ?? null }))
            .filter((r) => r.status !== null);
          if (reactions.length === 0) return null;
          return (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">みんなのリアクション</span>
              <div className="flex flex-col gap-2">
                {reactions.map(({ member, status }) => (
                  <div key={member.user_id} className="flex items-center gap-2">
                    <UserAvatar name={member.user_name} />
                    <span className="text-sm flex-1 truncate">{member.user_name}</span>
                    <span className="text-xs shrink-0">
                      {status === "want_to_go" ? "⭐ 行きたい" : "✅ 行った"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 作成者 */}
        {place.created_by_name && (
          <div
            className={cn(
              "flex items-center gap-2 w-max",
              onCreatorFilter && "cursor-pointer hover:bg-muted/50 p-1.5 -m-1.5 rounded-lg transition-colors"
            )}
            onClick={() => {
              if (onCreatorFilter && place.created_by_id) {
                onCreatorFilter(place.created_by_id);
              }
            }}
          >
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
              <div className="whitespace-pre-wrap leading-relaxed break-words">
                <LinkifiedText text={displayText} />
              </div>
            </div>
          ) : null;
        })()}

        {/* カテゴリ */}
        {place.categories && place.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {place.categories.map((cat) => (
              <Badge key={cat} variant="outline" className={cn("font-medium flex items-center gap-1 border", getCategoryClass(cat))}>
                <span className="badge-dot" />{cat}
              </Badge>
            ))}
          </div>
        )}

        {/* 住所 */}
        {place.address && (
          <div className="flex items-start gap-2.5 text-sm">
            <MapPin className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
            <span className="break-all">{place.address}</span>
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
            <div className="whitespace-pre-wrap leading-relaxed break-all">
              <LinkifiedText text={place.note} />
            </div>
          </div>
        )}

        {/* Googleマップで経路を見る */}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground rounded-[14px] py-[13px] font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
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
            isDesktop ? "sm:max-w-md" : "rounded-t-2xl"
          )}
          style={{ touchAction: "pan-y", height: isDesktop ? undefined : "calc(85dvh - 60px)" }}
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
