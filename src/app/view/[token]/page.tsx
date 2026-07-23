"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxLanguage from "@mapbox/mapbox-gl-language";
import { MapPin, Eye, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { getCategoryClass } from "@/lib/category";
import { cn } from "@/lib/utils";

// get_public_places RPC が返す読み取り専用スポット
type PublicPlace = {
  id: string;
  name: string;
  address: string | null;
  note: string | null;
  categories: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  duration: string | null;
  image_urls: string[] | null;
  lat: number;
  lng: number;
  created_by_name: string | null;
  opening_hours_text: string | null;
  plan_day: number | null;
  plan_order: number | null;
  created_at: string;
};

type ViewState = "loading" | "ok" | "invalid";

// ── ログイン不要の閲覧専用マップページ（/view/[token]）──────────────
export default function PublicViewPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [state, setState] = useState<ViewState>("loading");
  const [roomName, setRoomName] = useState<string | null>(null);
  const [places, setPlaces] = useState<PublicPlace[]>([]);

  // ── データ取得 ──────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: rooms, error } = await supabase.rpc("get_public_room", { p_token: token });
      if (error || !rooms || rooms.length === 0) {
        // RPC 未適用 / トークン無効 いずれもリンク無効として表示
        setState("invalid");
        return;
      }
      setRoomName((rooms[0] as { name: string | null }).name);

      const { data: spots } = await supabase.rpc("get_public_places", { p_token: token });
      setPlaces((spots as PublicPlace[] | null) ?? []);
      setState("ok");
    })();
  }, [token]);

  // ── マップ初期化 ────────────────────────────────────
  useEffect(() => {
    if (state !== "ok" || map.current || !mapContainer.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [139.6917, 35.6895],
      zoom: 12,
    });
    map.current.addControl(new MapboxLanguage({ defaultLanguage: "ja" }));
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [state]);

  // ── マーカー描画 + 全体表示 ─────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || state !== "ok") return;

    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = [];

    if (places.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    for (const p of places) {
      const popupHtml = `<div style="font-weight:700;font-size:13px;padding:2px 4px;">${
        p.name.replace(/</g, "&lt;")
      }</div>`;
      const marker = new mapboxgl.Marker({ color: "#008f81" })
        .setLngLat([p.lng, p.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(popupHtml))
        .addTo(m);
      markersRef.current.push(marker);
      bounds.extend([p.lng, p.lat]);
    }
    m.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
  }, [places, state]);

  function focusPlace(p: PublicPlace) {
    map.current?.flyTo({ center: [p.lng, p.lat], zoom: 15, duration: 800 });
  }

  if (state === "loading") {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="h-dvh flex items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <MapPin className="size-10 text-muted-foreground/40" />
          <h1 className="text-lg font-bold">このリンクは無効です</h1>
          <p className="text-sm text-muted-foreground">
            公開が停止されたか、URLが間違っている可能性があります。
          </p>
          <Link href="/" className="mt-2 text-sm font-semibold text-primary underline underline-offset-4">
            KokoMap を開く
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* ヘッダー */}
      <header className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b bg-background">
        <div className="min-w-0">
          <h1 className="text-base font-bold truncate">{roomName ?? "共有マップ"}</h1>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Eye className="size-3" />
            閲覧専用の共有ページです
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <ExternalLink className="size-3" />
          KokoMap を使う
        </Link>
      </header>

      {/* マップ + リスト */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <div className="relative flex-1 min-h-0">
          <div ref={mapContainer} className="w-full h-full" />
        </div>

        <div className="shrink-0 h-[42%] md:h-auto md:w-[380px] border-t md:border-t-0 md:border-l overflow-y-auto">
          <div className="px-4 py-2.5 border-b text-sm font-bold sticky top-0 bg-background z-[1]">
            スポット一覧
            <span className="ml-2 text-muted-foreground font-normal text-xs">{places.length}件</span>
          </div>
          {places.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">スポットがありません</p>
          ) : (
            places.map((p) => (
              <button
                key={p.id}
                onClick={() => focusPlace(p)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-b-0 text-left hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="shrink-0 size-12 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                  {p.image_urls?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_urls[0]} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <MapPin className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    {p.categories?.slice(0, 2).map((cat) => (
                      <Badge
                        key={cat}
                        variant="outline"
                        className={cn("text-[11px] px-1.5 py-0 h-4 shrink-0", getCategoryClass(cat))}
                      >
                        {cat}
                      </Badge>
                    ))}
                    {(p.budget_min != null || p.budget_max != null) && (
                      <span className="text-[11px] text-muted-foreground">
                        {[p.budget_min, p.budget_max]
                          .filter((v) => v != null)
                          .map((v) => `¥${v!.toLocaleString()}`)
                          .join(" 〜 ")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  {p.address && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{p.address}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
