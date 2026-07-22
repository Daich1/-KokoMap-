"use client";

import { useEffect, useRef, useState } from "react";
import {
  Car,
  Footprints,
  Bike,
  Train,
  X,
  LocateFixed,
  Loader2,
  MapPin,
  Star,
  Search,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { decodePolyline } from "@/lib/polyline";
import { forwardGeocode } from "@/lib/geocoding";
import type { Place } from "@/lib/supabase";

interface LatLng {
  lat: number;
  lng: number;
}

interface PlacePrediction {
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
  description: string;
}

interface PlaceDetails {
  lat: number | null;
  lng: number | null;
}

export type TravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";

const MODES: { id: TravelMode; label: string; icon: typeof Car }[] = [
  { id: "DRIVE", label: "車", icon: Car },
  { id: "WALK", label: "徒歩", icon: Footprints },
  { id: "BICYCLE", label: "自転車", icon: Bike },
  { id: "TRANSIT", label: "電車", icon: Train },
];

export interface RouteResult {
  origin: LatLng;
  destination: LatLng;
  coordinates: [number, number][];
}

interface DirectionsPanelProps {
  onClose: () => void;
  userLocation: LatLng | null;
  onRouteChange: (route: RouteResult | null) => void;
  places: Place[];
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// ── 出発地/目的地の入力フィールド（統合ドロップダウン） ──────────
interface LocationFieldProps {
  dotColor: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onPick: (coords: LatLng, label: string) => void;
  userLocation: LatLng | null;
  places: Place[];
}

function LocationField({
  dotColor,
  placeholder,
  value,
  onChangeText,
  onPick,
  userLocation,
  places,
}: LocationFieldProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "spots">("main");
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const suppressRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // ドロップダウン外クリックで閉じる（内側のボタン/入力への焦点移動では閉じない）
  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setView("main");
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  // オートコンプリート
  useEffect(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      setSuggestions([]);
      return;
    }
    const query = value.trim();
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(query)}`
        );
        setSuggestions(await res.json());
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  function pick(coords: LatLng, label: string) {
    suppressRef.current = true;
    setSuggestions([]);
    setOpen(false);
    setView("main");
    onPick(coords, label);
  }

  async function selectSuggestion(prediction: PlacePrediction) {
    try {
      const res = await fetch(
        `/api/places/details?place_id=${encodeURIComponent(prediction.place_id)}`
      );
      const details: PlaceDetails | null = await res.json();
      if (details && details.lat !== null && details.lng !== null) {
        pick(
          { lat: details.lat, lng: details.lng },
          prediction.structured_formatting.main_text
        );
      }
    } catch {
      // サイレント失敗
    }
  }

  async function geocodeAddress() {
    const query = value.trim();
    if (!query) return;
    setGeocoding(true);
    try {
      const coords = await forwardGeocode(query);
      if (coords) pick(coords, query);
    } finally {
      setGeocoding(false);
    }
  }

  const [spotQuery, setSpotQuery] = useState("");
  const filteredSpots =
    view === "spots"
      ? places.filter((p) =>
          spotQuery.trim()
            ? p.name.toLowerCase().includes(spotQuery.trim().toLowerCase())
            : true
        )
      : [];

  return (
    <div className="relative" ref={rootRef}>
      <div className="flex items-center gap-2 border rounded-[12px] px-3 py-2 bg-background">
        <span className={cn("size-2 rounded-full shrink-0", dotColor)} />
        <input
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
          onFocus={() => {
            setOpen(true);
            setView("main");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions.length === 0) geocodeAddress();
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 text-sm outline-none bg-transparent"
        />
      </div>

      {open && (
        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-background border rounded-[12px] shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {view === "spots" ? (
            <>
              <div className="flex items-center gap-2 px-2 py-1.5 border-b">
                <button
                  onClick={() => setView("main")}
                  className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer shrink-0"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <input
                  autoFocus
                  value={spotQuery}
                  onChange={(e) => setSpotQuery(e.target.value)}
                  placeholder="登録スポットを検索"
                  className="flex-1 min-w-0 text-sm outline-none bg-transparent"
                />
              </div>
              {filteredSpots.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                  スポットがありません
                </div>
              ) : (
                filteredSpots.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => pick({ lat: p.lat, lng: p.lng }, p.name)}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Star className="size-3.5 shrink-0 mt-0.5 text-accent" />
                    <span className="min-w-0">
                      <span className="block truncate">{p.name}</span>
                      {p.address && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.address}
                        </span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </>
          ) : (
            <>
              {userLocation && (
                <button
                  onClick={() => pick(userLocation, "現在地")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer text-primary"
                >
                  <LocateFixed className="size-3.5 shrink-0" />
                  現在地
                </button>
              )}
              <button
                onClick={() => {
                  setView("spots");
                  setSpotQuery("");
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Star className="size-3.5 shrink-0 text-accent" />
                  登録スポットから選ぶ
                </span>
                <ChevronLeft className="size-4 rotate-180 text-muted-foreground" />
              </button>

              {value.trim().length > 0 && (
                <button
                  onClick={() => geocodeAddress()}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer border-t"
                >
                  {geocoding ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 truncate">
                    「{value.trim()}」を住所で検索
                  </span>
                </button>
              )}

              {suggestions.length > 0 && (
                <div className="border-t">
                  {suggestions.map((s) => (
                    <button
                      key={s.place_id}
                      onClick={() => selectSuggestion(s)}
                      className="w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer"
                    >
                      <MapPin className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate">
                          {s.structured_formatting.main_text}
                        </span>
                        {s.structured_formatting.secondary_text && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {s.structured_formatting.secondary_text}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function DirectionsPanel({
  onClose,
  userLocation,
  onRouteChange,
  places,
}: DirectionsPanelProps) {
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [originCoords, setOriginCoords] = useState<LatLng | null>(null);
  const [destCoords, setDestCoords] = useState<LatLng | null>(null);
  const [mode, setMode] = useState<TravelMode>("DRIVE");

  const [result, setResult] = useState<{
    durationSeconds: number;
    distanceMeters: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const reqIdRef = useRef(0);

  // ── 経路計算（検索ボタン押下で実行・車/徒歩/自転車） ──────────
  async function runSearch() {
    if (!originCoords || !destCoords) return;

    const reqId = ++reqIdRef.current;
    setLoading(true);
    setNotFound(false);

    try {
      const res = await fetch("/api/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originLat: originCoords.lat,
          originLng: originCoords.lng,
          destLat: destCoords.lat,
          destLng: destCoords.lng,
          mode,
        }),
      });
      const data: {
        durationSeconds: number;
        distanceMeters: number;
        polyline: string | null;
      } | null = res.ok ? await res.json() : null;

      if (reqId !== reqIdRef.current) return; // 古いリクエストは破棄

      if (!data) {
        setResult(null);
        setNotFound(true);
        onRouteChange(null);
        return;
      }
      setResult({
        durationSeconds: data.durationSeconds,
        distanceMeters: data.distanceMeters,
      });
      const coordinates = data.polyline ? decodePolyline(data.polyline) : [];
      onRouteChange({ origin: originCoords, destination: destCoords, coordinates });
    } catch {
      if (reqId === reqIdRef.current) {
        setResult(null);
        setNotFound(true);
        onRouteChange(null);
      }
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }

  // ── 電車：Googleマップの乗換案内を開く（日本の公共交通は外部連携） ──
  function openTransitInGoogleMaps() {
    if (!originCoords || !destCoords) return;
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${originCoords.lat},${originCoords.lng}` +
      `&destination=${destCoords.lat},${destCoords.lng}` +
      `&travelmode=transit`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    return () => onRouteChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bothSelected = !!originCoords && !!destCoords;
  const canSearch = bothSelected && !loading;

  return (
    <div className="map-glass-btn absolute z-30 top-3 left-3 right-3 md:left-4 md:right-auto md:w-[360px] p-3 flex flex-col gap-2.5 max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">経路を検索</span>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* 出発地 */}
      <LocationField
        dotColor="bg-green-500"
        placeholder="出発地"
        value={originText}
        onChangeText={(t) => {
          setOriginText(t);
          setOriginCoords(null);
        }}
        onPick={(coords, label) => {
          setOriginText(label);
          setOriginCoords(coords);
        }}
        userLocation={userLocation}
        places={places}
      />

      {/* 目的地 */}
      <LocationField
        dotColor="bg-red-500"
        placeholder="目的地"
        value={destText}
        onChangeText={(t) => {
          setDestText(t);
          setDestCoords(null);
        }}
        onPick={(coords, label) => {
          setDestText(label);
          setDestCoords(coords);
        }}
        userLocation={userLocation}
        places={places}
      />

      {/* 移動手段タブ */}
      <div className="flex items-center gap-1.5">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-[10px] text-xs font-medium border transition-all cursor-pointer",
              mode === id
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-transparent hover:border-border hover:bg-muted/50"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* アクションボタン：電車はGoogleマップ乗換案内へ、それ以外はアプリ内検索 */}
      {mode === "TRANSIT" ? (
        <>
          <button
            onClick={openTransitInGoogleMaps}
            disabled={!bothSelected}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 rounded-[12px] text-sm font-semibold transition-all cursor-pointer",
              bothSelected
                ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.99]"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Train className="size-4" />
            乗換案内を開く
            <ExternalLink className="size-3.5" />
          </button>
          <p className="text-[11px] text-muted-foreground text-center leading-snug">
            日本の電車経路はGoogleマップで表示されます
          </p>
        </>
      ) : (
        <button
          onClick={runSearch}
          disabled={!canSearch}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 rounded-[12px] text-sm font-semibold transition-all cursor-pointer",
            canSearch
              ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.99]"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          経路を検索
        </button>
      )}

      {/* 結果（車/徒歩/自転車） */}
      {mode !== "TRANSIT" && (result || notFound) && !loading && (
        <div className="border-t pt-2.5">
          {notFound ? (
            <span className="block text-sm text-muted-foreground text-center py-1">
              ルートが見つかりませんでした
            </span>
          ) : result ? (
            <div className="text-center text-sm">
              <span className="font-semibold">
                {formatDuration(result.durationSeconds)}
              </span>
              <span className="text-muted-foreground font-normal">
                {" ・ "}
                {formatDistance(result.distanceMeters)}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
