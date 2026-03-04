"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface ShareRoomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomName?: string | null;
  shareCode: string;
  shareUrl: string;
  placeName?: string | null;
}

export function ShareRoomSheet({
  open,
  onOpenChange,
  roomName,
  shareCode,
  shareUrl,
  placeName,
}: ShareRoomSheetProps) {
  const [copied, setCopied] = useState(false);

  function copyUrl() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareNative() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: roomName ?? "KokoMap",
          text: placeName
            ? `「${placeName}」を共有します`
            : `「${roomName ?? shareCode}」に参加しませんか？`,
          url: shareUrl,
        });
      } catch {
        // キャンセルは無視
      }
    } else {
      copyUrl();
    }
  }

  const sheetTitle = placeName
    ? `「${placeName}」を共有`
    : roomName
    ? `${roomName} を共有`
    : `ルーム ${shareCode} を共有`;

  const canNativeShare =
    typeof navigator !== "undefined" && "share" in navigator;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader className="mb-5">
          <SheetTitle className="text-base">{sheetTitle}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center gap-5">
          {/* QR コード */}
          <div className="bg-white p-3 rounded-xl shadow-sm border">
            <QRCodeSVG value={shareUrl} size={180} />
          </div>

          {/* URL 表示 */}
          <p className="text-xs text-muted-foreground text-center break-all max-w-sm px-2">
            {shareUrl}
          </p>

          {/* ボタン群 */}
          <div className="flex flex-col gap-2 w-full max-w-xs pb-4">
            {canNativeShare && (
              <Button onClick={shareNative} className="w-full gap-2">
                <Share2 className="size-4" />
                メッセージで送る
              </Button>
            )}
            <Button variant="outline" onClick={copyUrl} className="w-full gap-2">
              {copied ? (
                <Check className="size-4 text-green-600" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "コピーしました" : "URLをコピー"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
