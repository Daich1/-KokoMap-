"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxLanguage from "@mapbox/mapbox-gl-language";
import Supercluster from "supercluster";
import { LocateFixed, List, Search, Copy, Check, LogOut, SlidersHorizontal, X, Star, CheckCircle2, Utensils, Wine, Gamepad2, Landmark, Coffee, ShoppingBag, Camera, BedDouble, Waves, RefreshCcw, Plus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { AddPlaceSheet } from "@/components/AddPlaceSheet";
import { PlaceDetailSheet } from "@/components/PlaceDetailSheet";
import { PlaceCard } from "@/components/PlaceCard";
import { RoomJoinDialog } from "@/components/RoomJoinDialog";
import { supabase, type Place, type Room, type SpotStatus } from "@/lib/supabase";
import { useMapStore, type MapBounds } from "@/store/useMapStore";
import { reverseGeocode } from "@/lib/geocoding";
import { PRESET_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { calcDistance, formatDistance } from "@/lib/geo";
import { isPlaceOpenNow } from "@/lib/openNow";

// ── カテゴリアイコンマッピング ──────────────────────────────────────
const CATEGORY_ICONS = {
  "食事": Utensils,
  "飲み": Wine,
  "娯楽": Gamepad2,
  "観光": Landmark,
  "カフェ・休憩": Coffee,
  "買い物": ShoppingBag,
  "映え・絶景": Camera,
  "宿": BedDouble,
  "風呂": Waves,
} as const;

// ── ポップアップのステータスボタンスタイル更新（純粋関数）────────────
function applyPopupStatusStyles(
  wantBtn: HTMLButtonElement,
  visitedBtn: HTMLButtonElement,
  status: SpotStatus | null
) {
  const base = "flex-1 text-[11px] rounded-md py-1 border transition-colors truncate";
  const activeWant = `${base} bg-amber-50 text-amber-700 border-amber-300 font-semibold`;
  const activeVisit = `${base} bg-green-50 text-green-700 border-green-300 font-semibold`;
  const inactive = `${base} text-gray-400 border-gray-200 hover:bg-gray-50`;

  wantBtn.className = status === "want_to_go" ? activeWant : inactive;
  visitedBtn.className = status === "visited" ? activeVisit : inactive;
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pickingModeRef = useRef(false);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const previewMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const popupClickRef = useRef<(place: Place) => void>(() => {});
  // ポップアップ内のステータスボタン要素を保持（spotStatuses 変化時に DOM 更新用）
  const popupStatusEls = useRef<
    Map<string, { wantBtn: HTMLButtonElement; visitedBtn: HTMLButtonElement }>
  >(new Map());
  const geoWatchRef = useRef<number | null>(null);

  // ── Zustand ストア ────────────────────────────────────
  const {
    places,
    room,
    currentUser,
    isRoomAdmin,
    spotStatuses,
    userLocation,
    mapBounds,
    setRoom,
    clearRoom,
    setIsRoomAdmin,
    setPlaces,
    addPlace,
    upsertPlace,
    removePlace,
    setCurrentUser,
    setUserLocation,
    loadSpotStatuses,
    setMapBounds,
  } = useMapStore();

  // ── クラスタリング用 refs ──────────────────────────────
  const superclusterRef = useRef<Supercluster | null>(null);
  const clusterMarkers = useRef<mapboxgl.Marker[]>([]);
  const clusteredPlaceIds = useRef<Set<string>>(new Set());
  const filteredPlacesRef = useRef<Place[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [editPlace, setEditPlace] = useState<Place | undefined>(undefined);
  const [pickingMode, setPickingMode] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodedAddress, setGeocodedAddress] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSnap, setDrawerSnap] = useState<number | string | null>(0.45);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [roomDialogOpen, setRoomDialogOpen] = useState(!room);
  const [urlCode, setUrlCode] = useState<string | undefined>(undefined);

  // Zustand が localStorage から hydrate した後にダイアログ状態を同期
  useEffect(() => {
    if (room) setRoomDialogOpen(false);
  }, [room]);

  // URL の ?code= パラメータを検出してダイアログに渡す
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      const normalized = code.trim().toUpperCase().slice(0, 6);
      setUrlCode(normalized);
      setRoomDialogOpen(true);
      // URLをきれいにする（リロード時の再適用を防ぐ）
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  }, []);
  const [codeCopied, setCodeCopied] = useState(false);

  // Filter state
  const [filterText, setFilterText] = useState("");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterBudgetMin, setFilterBudgetMin] = useState("");
  const [filterBudgetMax, setFilterBudgetMax] = useState("");
  const [filterOpenNow, setFilterOpenNow] = useState(false);
  const [filterAreaBounds, setFilterAreaBounds] = useState<import("@/store/useMapStore").MapBounds | null>(null);
  const [showSearchAreaBtn, setShowSearchAreaBtn] = useState(false);
  const [filterStatus, setFilterStatus] = useState<SpotStatus | null>(null);
  const [sortOrder, setSortOrder] = useState<"default" | "distance">("default");

  // ── 初期化: スポットステータスを読み込む ─────────────────
  useEffect(() => {
    loadSpotStatuses(currentUser.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  // ── ジオロケーション（watchPosition）────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;

    geoWatchRef.current = navigator.geolocation.watchPosition(
      ({ coords: c }) => {
        setUserLocation({ lat: c.latitude, lng: c.longitude });
      },
      (err) => console.warn("Geolocation error:", err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );

    return () => {
      if (geoWatchRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── spotStatuses 変化時にポップアップ DOM を更新 ─────────
  useEffect(() => {
    popupStatusEls.current.forEach(({ wantBtn, visitedBtn }, placeId) => {
      const status: SpotStatus | null = spotStatuses[placeId] ?? null;
      applyPopupStatusStyles(wantBtn, visitedBtn, status);
    });
  }, [spotStatuses]);

  // Derived: filtered + sorted places
  const filteredPlaces = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    const budgetMin = filterBudgetMin.trim() ? parseInt(filterBudgetMin, 10) : null;
    const budgetMax = filterBudgetMax.trim() ? parseInt(filterBudgetMax, 10) : null;

    let result = places.filter((place) => {
      if (query) {
        const name = (place.name ?? "").toLowerCase();
        const note = (place.note ?? "").toLowerCase();
        if (!name.includes(query) && !note.includes(query)) return false;
      }
      if (filterCategories.length > 0) {
        const hasMatch = place.categories?.some((cat) =>
          filterCategories.includes(cat)
        );
        if (!hasMatch) return false;
      }
      if (budgetMin !== null && !isNaN(budgetMin)) {
        if (place.budget_max !== null && place.budget_max < budgetMin) return false;
      }
      if (budgetMax !== null && !isNaN(budgetMax)) {
        if (place.budget_min !== null && place.budget_min > budgetMax) return false;
      }
      // 🟢 営業中フィルター
      if (filterOpenNow) {
        const openStatus = isPlaceOpenNow(place.business_hours, place.opening_hours_text);
        if (openStatus !== true) return false;
      }
      // ⭐/✅ ステータスフィルター
      if (filterStatus !== null) {
        if (spotStatuses[place.id] !== filterStatus) return false;
      }
      // 📍 エリア内フィルター（「このエリアで検索」ボタン押下時のみ適用）
      if (filterAreaBounds) {
        if (
          place.lat < filterAreaBounds.south || place.lat > filterAreaBounds.north ||
          place.lng < filterAreaBounds.west  || place.lng > filterAreaBounds.east
        ) return false;
      }
      return true;
    });

    // 近い順ソート
    if (sortOrder === "distance" && userLocation) {
      result = [...result].sort((a, b) => {
        const da = calcDistance(userLocation.lat, userLocation.lng, a.lat, a.lng);
        const db = calcDistance(userLocation.lat, userLocation.lng, b.lat, b.lng);
        return da - db;
      });
    }

    return result;
  }, [places, filterText, filterCategories, filterBudgetMin, filterBudgetMax, filterOpenNow, filterStatus, filterAreaBounds, spotStatuses, sortOrder, userLocation]);

  // 距離テキストのマップ（再レンダリングの最適化）
  const distanceMap = useMemo(() => {
    if (!userLocation) return new Map<string, string>();
    return new Map(
      filteredPlaces.map((p) => [
        p.id,
        formatDistance(calcDistance(userLocation.lat, userLocation.lng, p.lat, p.lng)),
      ])
    );
  }, [filteredPlaces, userLocation]);

  // ── updateClusters: クラスター再計算 + 個別マーカー表示制御 ──
  const updateClusters = useCallback(() => {
    if (!map.current || !superclusterRef.current) {
      // クラスタリング無効時はフィルターのみで表示制御
      const filteredIds = new Set(filteredPlacesRef.current.map((p) => p.id));
      markers.current.forEach((marker, id) => {
        marker.getElement().style.display = filteredIds.has(id) ? "" : "none";
      });
      return;
    }

    // 既存クラスターマーカーを除去
    clusterMarkers.current.forEach((m) => m.remove());
    clusterMarkers.current = [];

    const mapInstance = map.current;
    const bounds = mapInstance.getBounds();
    if (!bounds) return;
    const zoom = Math.floor(mapInstance.getZoom());
    const bbox: [number, number, number, number] = [
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
    ];

    const clusters = superclusterRef.current.getClusters(bbox, zoom);

    // ビューポート内で「個別表示」されているplace IDs
    const unclusteredInViewport = new Set<string>(
      clusters
        .filter((f) => !f.properties.cluster)
        .map((f) => f.properties.placeId as string)
    );

    // クラスターバッジを描画
    clusters.forEach((feature) => {
      if (!feature.properties.cluster) return;
      const [lng, lat] = feature.geometry.coordinates;
      const count = feature.properties.point_count as number;
      const clusterId = feature.properties.cluster_id as number;
      const size = count >= 100 ? 52 : count >= 10 ? 44 : 36;

      const el = document.createElement("div");
      el.style.cssText = [
        `width:${size}px`, `height:${size}px`, "border-radius:50%",
        "background:white", "border:2.5px solid #6366f1",
        "display:flex", "align-items:center", "justify-content:center",
        "font-weight:700", "font-size:13px", "color:#6366f1",
        "cursor:pointer", "box-shadow:0 2px 8px rgba(0,0,0,0.2)",
        "transition:transform 0.15s", "user-select:none",
      ].join(";");
      el.textContent = count >= 100 ? "99+" : `+${count}`;
      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.15)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });
      el.addEventListener("click", () => {
        const expansionZoom = superclusterRef.current!.getClusterExpansionZoom(clusterId);
        mapInstance.flyTo({ center: [lng, lat], zoom: expansionZoom + 0.5, duration: 600 });
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(mapInstance);
      clusterMarkers.current.push(marker);
    });

    // ビューポート内でクラスター化されているplace IDs（個別マーカーを非表示にする）
    const newClusteredIds = new Set<string>();
    places.forEach((p) => {
      const inViewport =
        p.lat >= bounds.getSouth() && p.lat <= bounds.getNorth() &&
        p.lng >= bounds.getWest()  && p.lng <= bounds.getEast();
      if (inViewport && !unclusteredInViewport.has(p.id)) {
        newClusteredIds.add(p.id);
      }
    });
    clusteredPlaceIds.current = newClusteredIds;

    // 個別マーカーの表示/非表示を更新
    const filteredIds = new Set(filteredPlacesRef.current.map((p) => p.id));
    markers.current.forEach((marker, id) => {
      const show = filteredIds.has(id) && !newClusteredIds.has(id);
      marker.getElement().style.display = show ? "" : "none";
    });
  }, [places]);

  const updateClustersRef = useRef(updateClusters);
  useEffect(() => { updateClustersRef.current = updateClusters; }, [updateClusters]);

  // filteredPlaces が変わったら ref を更新してクラスター再描画
  useEffect(() => {
    filteredPlacesRef.current = filteredPlaces;
    updateClustersRef.current();
  }, [filteredPlaces]);

  // places が変わったら supercluster を再構築
  useEffect(() => {
    if (places.length === 0) {
      superclusterRef.current = null;
      clusterMarkers.current.forEach((m) => m.remove());
      clusterMarkers.current = [];
      clusteredPlaceIds.current = new Set();
      return;
    }
    const sc = new Supercluster({ radius: 60, maxZoom: 16 });
    sc.load(
      places.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: { placeId: p.id },
      }))
    );
    superclusterRef.current = sc;
    if (map.current) updateClustersRef.current();
  }, [places]);

  function toggleFilterCategory(cat: string) {
    setFilterCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  // ── マーカー追加（冪等: 既存は削除してから追加）──────
  const addMarker = useCallback((place: Place) => {
    if (!map.current) return;

    // 既存マーカーを除去（idempotent）
    markers.current.get(place.id)?.remove();
    markers.current.delete(place.id);
    popupStatusEls.current.delete(place.id);

    const popupEl = document.createElement("div");
    popupEl.className =
      "w-44 overflow-hidden cursor-pointer transition-opacity hover:opacity-90 active:opacity-75";

    const imageWrap = document.createElement("div");
    imageWrap.className =
      "h-24 w-full overflow-hidden bg-gray-100 flex items-center justify-center";

    if (place.image_urls && place.image_urls.length > 0) {
      const img = document.createElement("img");
      img.src = place.image_urls[0];
      img.alt = place.name;
      img.className = "h-full w-full object-cover";
      imageWrap.appendChild(img);
    } else {
      imageWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
    }

    const info = document.createElement("div");
    info.className = "p-3 flex flex-col gap-1.5";

    const titleEl = document.createElement("p");
    titleEl.className = "font-semibold text-sm truncate";
    titleEl.textContent = place.name;
    info.appendChild(titleEl);

    if (place.categories && place.categories.length > 0) {
      const catsRow = document.createElement("div");
      catsRow.className = "flex gap-1 flex-wrap";
      place.categories.slice(0, 2).forEach((cat) => {
        const badge = document.createElement("span");
        badge.className =
          "inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600";
        badge.textContent = cat;
        catsRow.appendChild(badge);
      });
      info.appendChild(catsRow);
    }

    const budgetParts: string[] = [];
    if (place.budget_min != null)
      budgetParts.push(`¥${place.budget_min.toLocaleString()}`);
    if (place.budget_max != null)
      budgetParts.push(`¥${place.budget_max.toLocaleString()}`);
    if (budgetParts.length > 0) {
      const budgetEl = document.createElement("p");
      budgetEl.className = "text-xs text-gray-400";
      budgetEl.textContent = budgetParts.join(" 〜 ");
      info.appendChild(budgetEl);
    }

    // ── ステータストグルボタン ───────────────────────────
    const statusRow = document.createElement("div");
    statusRow.className = "flex gap-1 mt-0.5";

    const wantBtn = document.createElement("button");
    wantBtn.textContent = "⭐ 行きたい";

    const visitedBtn = document.createElement("button");
    visitedBtn.textContent = "✅ 行った";

    // 初期スタイル（未登録は null = 未選択）
    const initialStatus: SpotStatus | null =
      useMapStore.getState().spotStatuses[place.id] ?? null;
    applyPopupStatusStyles(wantBtn, visitedBtn, initialStatus);

    wantBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      useMapStore.getState().setSpotStatus(place.id, "want_to_go");
      applyPopupStatusStyles(wantBtn, visitedBtn, "want_to_go");
    });

    visitedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      useMapStore.getState().setSpotStatus(place.id, "visited");
      applyPopupStatusStyles(wantBtn, visitedBtn, "visited");
    });

    statusRow.appendChild(wantBtn);
    statusRow.appendChild(visitedBtn);
    info.appendChild(statusRow);

    // ボタン要素を登録（Zustand 更新時に DOM 同期するため）
    popupStatusEls.current.set(place.id, { wantBtn, visitedBtn });

    popupEl.appendChild(imageWrap);
    popupEl.appendChild(info);

    let markerInstance: mapboxgl.Marker | null = null;
    popupEl.addEventListener("click", () => {
      markerInstance?.getPopup()?.remove();
      popupClickRef.current(place);
    });

    const popup = new mapboxgl.Popup({
      offset: 12,
      closeButton: false,
      maxWidth: "none",
      className: "custom-popup",
    }).setDOMContent(popupEl);

    const marker = new mapboxgl.Marker()
      .setLngLat([place.lng, place.lat])
      .setPopup(popup)
      .addTo(map.current);

    markerInstance = marker;
    markers.current.set(place.id, marker);
  }, []);

  const removeMarker = useCallback((placeId: string) => {
    markers.current.get(placeId)?.remove();
    markers.current.delete(placeId);
    popupStatusEls.current.delete(placeId);
  }, []);

  // addMarker/removeMarker を Realtime 内で使うためのref
  const addMarkerRef = useRef(addMarker);
  const removeMarkerRef = useRef(removeMarker);
  useEffect(() => { addMarkerRef.current = addMarker; }, [addMarker]);
  useEffect(() => { removeMarkerRef.current = removeMarker; }, [removeMarker]);

  // ── マップ初期化 ─────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [139.6917, 35.6895],
      zoom: 12,
    });

    map.current.addControl(new MapboxLanguage({ defaultLanguage: "ja" }));

    map.current.on("load", () => {
      setMapLoaded(true);
      const b = map.current!.getBounds();
      if (b) setMapBounds({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    });

    map.current.on("moveend", () => {
      if (!map.current) return;
      const b = map.current.getBounds();
      if (b) setMapBounds({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
      updateClustersRef.current();
      setShowSearchAreaBtn(true);
    });

    map.current.on("click", async (e) => {
      if (!pickingModeRef.current) return;
      const { lat, lng } = e.lngLat;
      pickingModeRef.current = false;
      setCoords({ lat, lng });
      setPickingMode(false);
      setSheetOpen(true);
      const address = await reverseGeocode(lat, lng);
      if (address) setGeocodedAddress(address);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // ── room + mapLoaded → スポットを読み込む ───────────
  useEffect(() => {
    if (!mapLoaded || !room) return;

    // 既存マーカーをすべてクリア
    markers.current.forEach((m) => m.remove());
    markers.current.clear();
    popupStatusEls.current.clear();

    supabase
      .from("places")
      .select("*")
      .eq("room_id", room.id)
      .is("deleted_at", null)
      .then(({ data }) => {
        if (data) {
          const loaded = data as Place[];
          setPlaces(loaded);
          loaded.forEach((p) => addMarkerRef.current(p));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, room?.id, setPlaces]);

  // ── Supabase Realtime 購読 ───────────────────────────
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "places",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          const store = useMapStore.getState();

          if (payload.eventType === "INSERT") {
            const place = payload.new as Place;
            if (place.deleted_at) return;
            store.addPlace(place);
            addMarkerRef.current(place);
          } else if (payload.eventType === "UPDATE") {
            const place = payload.new as Place;
            if (place.deleted_at) {
              store.removePlace(place.id);
              removeMarkerRef.current(place.id);
            } else {
              store.upsertPlace(place);
              addMarkerRef.current(place); // remove + re-add (idempotent)
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id]);

  useEffect(() => {
    if (!map.current) return;
    map.current.getCanvas().style.cursor = pickingMode ? "crosshair" : "";
  }, [pickingMode]);

  // 拡大縮小時にリサイズ
  useEffect(() => {
    const timer = setTimeout(() => map.current?.resize(), 310);
    return () => clearTimeout(timer);
  }, [expanded]);

  // ドラッグ可能なプレビューマーカー
  useEffect(() => {
    if (!map.current) return;

    if (sheetOpen && coords) {
      if (previewMarkerRef.current) {
        previewMarkerRef.current.setLngLat([coords.lng, coords.lat]);
      } else {
        const marker = new mapboxgl.Marker({ color: "#E85D04", draggable: true })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map.current);

        marker.on("dragend", async () => {
          const { lat, lng } = marker.getLngLat();
          setCoords({ lat, lng });
          const address = await reverseGeocode(lat, lng);
          if (address) setGeocodedAddress(address);
        });

        previewMarkerRef.current = marker;
      }
    } else if (!sheetOpen) {
      previewMarkerRef.current?.remove();
      previewMarkerRef.current = null;
    }
  }, [sheetOpen, coords]);

  // ── ハンドラー ───────────────────────────────────────
  function handleLocateMe() {
    // watchPosition で取得済みの座標があれば即座に使う
    if (userLocation) {
      map.current?.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 15,
        duration: 1500,
      });
      return;
    }
    // 未取得の場合は一度だけ取得
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        map.current?.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          duration: 1500,
        });
      },
      (err) => console.warn("Geolocation error:", err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }

  function handleSelectPlace(place: Place) {
    map.current?.flyTo({ center: [place.lng, place.lat], zoom: 15, duration: 1200 });
    setDrawerOpen(false);
    setDetailPlace(place);
    setDetailOpen(true);
  }

  popupClickRef.current = handleSelectPlace;

  function handleEdit(place: Place) {
    setEditPlace(place);
    setCoords({ lat: place.lat, lng: place.lng });
    setSheetOpen(true);
  }

  function handleDeleted(placeId: string) {
    removePlace(placeId);
    removeMarker(placeId);
  }

  function handleCoordsChange(newCoords: { lat: number; lng: number }) {
    setCoords(newCoords);
    map.current?.flyTo({ center: [newCoords.lng, newCoords.lat], zoom: 15, duration: 1000 });
  }

  function handlePickFromMap() {
    setSheetOpen(false);
    pickingModeRef.current = true;
    setPickingMode(true);
  }

  function cancelPicking() {
    pickingModeRef.current = false;
    setPickingMode(false);
    setSheetOpen(true);
  }

  function handleSaved(place: Place) {
    const isUpdate = places.some((p) => p.id === place.id);
    if (isUpdate) {
      upsertPlace(place);
    } else {
      addPlace(place);
    }
    addMarker(place); // idempotent: 古いマーカーを除去して再追加
    setCoords(null);
    setEditPlace(undefined);
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) {
      setEditPlace(undefined);
      setCoords(null);
      setGeocodedAddress(null);
    }
  }

  function handleRoomJoined(joinedRoom: Room, userName: string, isCreator: boolean) {
    setRoom(joinedRoom);
    setCurrentUser({ ...currentUser, name: userName });
    setIsRoomAdmin(isCreator);
    setRoomDialogOpen(false);
  }

  function handleLeaveRoom() {
    clearRoom();
    // マーカーをすべて除去
    markers.current.forEach((m) => m.remove());
    markers.current.clear();
    popupStatusEls.current.clear();
    setRoomDialogOpen(true);
  }

  function copyRoomCode() {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?code=${room.share_code}`;
    navigator.clipboard.writeText(url);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  const countLabel =
    filteredPlaces.length === places.length
      ? `${places.length}件`
      : `${filteredPlaces.length}/${places.length}件`;

  // アクティブフィルター数（バッジ表示用）
  const activeFilterCount = [
    !!filterBudgetMin,
    !!filterBudgetMax,
    filterOpenNow,
    !!filterStatus,
    !!filterAreaBounds,
  ].filter(Boolean).length;

  function clearAllFilters() {
    setFilterCategories([]);
    setFilterBudgetMin("");
    setFilterBudgetMax("");
    setFilterOpenNow(false);
    setFilterStatus(null);
    setFilterAreaBounds(null);
  }

  // フィルター Popover の中身（PC ヘッダー・モバイルドロワー共通）
  const filterPopoverContent = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">フィルター</span>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-3" />
            クリア
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">ステータス</span>
        <div className="flex gap-1.5">
          <Badge
            variant={filterStatus === "want_to_go" ? "default" : "outline"}
            className={cn("cursor-pointer select-none text-xs transition-colors gap-1", filterStatus === "want_to_go" && "bg-amber-500 hover:bg-amber-600 border-amber-500")}
            onClick={() => setFilterStatus((prev) => prev === "want_to_go" ? null : "want_to_go")}
          >
            <Star className="size-3" />行きたい
          </Badge>
          <Badge
            variant={filterStatus === "visited" ? "default" : "outline"}
            className={cn("cursor-pointer select-none text-xs transition-colors gap-1", filterStatus === "visited" && "bg-green-600 hover:bg-green-700 border-green-600")}
            onClick={() => setFilterStatus((prev) => prev === "visited" ? null : "visited")}
          >
            <CheckCircle2 className="size-3" />行った
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">予算</span>
        <div className="flex items-center gap-1.5">
          <Input type="number" min={0} value={filterBudgetMin} onChange={(e) => setFilterBudgetMin(e.target.value)} placeholder="下限" className="h-8 text-xs w-0 flex-1" />
          <span className="text-xs text-muted-foreground shrink-0">円〜</span>
          <Input type="number" min={0} value={filterBudgetMax} onChange={(e) => setFilterBudgetMax(e.target.value)} placeholder="上限" className="h-8 text-xs w-0 flex-1" />
          <span className="text-xs text-muted-foreground shrink-0">円</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Switch checked={filterOpenNow} onCheckedChange={setFilterOpenNow} className="scale-90" />
          <span className="text-xs">🟢 営業中のみ</span>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">並び順</span>
        <div className="flex gap-1.5">
          <Badge variant={sortOrder === "default" ? "default" : "outline"} className="cursor-pointer select-none text-xs transition-colors" onClick={() => setSortOrder("default")}>
            追加順
          </Badge>
          <Badge
            variant={sortOrder === "distance" ? "default" : "outline"}
            className={cn("cursor-pointer select-none text-xs transition-colors", !userLocation && "opacity-40 pointer-events-none")}
            onClick={() => { if (userLocation) setSortOrder("distance"); }}
            title={userLocation ? undefined : "現在地の取得中..."}
          >
            近い順
          </Badge>
        </div>
      </div>
    </div>
  );

  // モバイルドロワー用: 検索 + フィルターボタン
  const filterUI = (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="名前やメモで検索..."
          className="h-8 pl-8 text-xs"
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs shrink-0 cursor-pointer", activeFilterCount > 0 && "border-primary text-primary")}>
            <SlidersHorizontal className="size-3.5" />
            フィルター
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-4" align="end" sideOffset={8}>
          {filterPopoverContent}
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">

      {/* ── PC: トップカテゴリ＋フィルターバー ── */}
      <div className="hidden md:flex shrink-0 bg-background border-b h-[52px]">

        {/* 左: マップ幅エリア（カテゴリ横スクロール + フィルターボタン） */}
        <div className="relative flex-1 overflow-hidden h-full flex items-center">
          <div className="overflow-x-auto scrollbar-hide h-full flex items-center w-full">
            <div className="flex items-center gap-1.5 px-4 h-full min-w-max">
              <button
                onClick={() => setFilterCategories([])}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-all shrink-0 cursor-pointer",
                  filterCategories.length === 0
                    ? "bg-foreground text-background border-foreground hover:opacity-80"
                    : "text-muted-foreground border-transparent hover:border-border hover:text-foreground hover:bg-muted/50"
                )}
              >
                すべて
              </button>
              {PRESET_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS];
                const isActive = filterCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleFilterCategory(cat)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-all shrink-0 cursor-pointer",
                      isActive
                        ? "bg-foreground text-background border-foreground hover:opacity-80"
                        : "text-muted-foreground border-transparent hover:border-border hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="size-4" />
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* グラデーション境界 + フィルターボタン（マップ右端に固定） */}
          <div className="absolute right-0 top-0 h-full flex items-center">
            <div className="w-16 h-full bg-gradient-to-l from-background to-transparent pointer-events-none" />
            <div className="flex items-center pr-3 pl-1 bg-background h-full">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all cursor-pointer hover:scale-105 active:scale-95",
                      activeFilterCount > 0
                        ? "bg-foreground text-background border-foreground hover:opacity-80"
                        : "text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground hover:border-foreground/30"
                    )}
                  >
                    <SlidersHorizontal className="size-4" />
                    フィルター
                    {activeFilterCount > 0 && (
                      <span className="flex size-4 items-center justify-center rounded-full bg-primary-foreground text-[10px] text-primary font-bold">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-4" align="end" sideOffset={8}>
                  {filterPopoverContent}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* 右: サイドバーと同幅スペーサー（マップ右端をヘッダーと揃える） */}
        <div className={cn(
          "shrink-0 border-l transition-[width] duration-300 ease-in-out",
          expanded ? "w-0" : "w-[420px]"
        )} />

      </div>

      {/* ── モバイル: ルーム情報ヘッダーバー ── */}
      {room && (
        <div className="md:hidden shrink-0 flex items-center justify-between px-3 py-2 bg-background border-b gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isRoomAdmin && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0">
                <Shield className="size-2.5" />
                管理者
              </span>
            )}
            {room.name && (
              <span className="text-xs font-medium truncate max-w-[100px]">{room.name}</span>
            )}
            <span className="text-xs text-muted-foreground shrink-0">
              コード: <span className="font-mono font-bold text-foreground tracking-wider">{room.share_code}</span>
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={copyRoomCode}
              title="コードをコピー"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              {codeCopied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
              <span className="text-xs">{codeCopied ? "コピー済" : "コピー"}</span>
            </button>
            <button
              onClick={handleLeaveRoom}
              title="ルームを変更"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── メインコンテンツ（マップ＋リスト） ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── マップ（PC: 左 flex-1、モバイル: 全画面） ── */}
        <div className="relative flex-1 overflow-hidden">
          <div ref={mapContainer} className="w-full h-full" />

          {pickingMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white rounded-full shadow-lg px-5 py-2.5 flex items-center gap-3 text-sm font-medium whitespace-nowrap">
              <span>地図をクリックして場所を指定してください</span>
              <button
                onClick={cancelPicking}
                className="text-xs underline opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
              >
                キャンセル
              </button>
            </div>
          )}

          {/* 「このエリアで検索」フローティングボタン */}
          {showSearchAreaBtn && !pickingMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <button
                onClick={() => {
                  if (mapBounds) setFilterAreaBounds(mapBounds);
                  setShowSearchAreaBtn(false);
                }}
                className="flex items-center gap-2 cursor-pointer bg-white text-gray-800 shadow-md rounded-full font-medium px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50 hover:scale-105 hover:shadow-lg active:scale-95 transition-all whitespace-nowrap"
              >
                <RefreshCcw className="size-3.5" />
                このエリアで検索
              </button>
            </div>
          )}

          {/* PC: リスト切替ボタン */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="hidden md:flex absolute top-4 right-3 z-10 items-center gap-1.5 bg-white rounded-full shadow-md px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:shadow-lg active:scale-95 transition-all border border-gray-100 cursor-pointer"
            title={expanded ? "リストを表示" : "リストを隠す"}
          >
            <List className="size-3.5" />
            {expanded ? "リスト表示" : "リストを隠す"}
          </button>

          {/* 現在地ボタン: モバイルではFABの上に配置 */}
          <button
            onClick={handleLocateMe}
            className="absolute z-10 bg-white rounded-full shadow-lg p-2.5 hover:bg-gray-50 hover:shadow-xl active:scale-95 transition-all cursor-pointer right-3 md:bottom-6"
            style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
            title="現在地へ移動"
          >
            <LocateFixed className="size-5 text-gray-700" />
          </button>

          {/* モバイル: ＋ 追加 FAB */}
          <button
            onClick={() => { setEditPlace(undefined); setSheetOpen(true); }}
            disabled={!room}
            className="md:hidden absolute right-3 z-10 bg-primary text-primary-foreground rounded-full shadow-lg p-3 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
            style={{ bottom: 'calc(1.125rem + env(safe-area-inset-bottom, 0px))' }}
            title="場所を追加"
          >
            <Plus className="size-5" />
          </button>

          {/* モバイル: スポット一覧ボタン */}
          <div
            className="md:hidden absolute left-1/2 -translate-x-1/2 z-10"
            style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <Button
              className="rounded-full shadow-lg pl-4 pr-3 gap-2"
              onClick={() => setDrawerOpen(true)}
            >
              <List className="size-4" />
              スポット一覧
              <span className="flex items-center gap-1 text-xs opacity-90 bg-white/20 rounded-full px-2 py-0.5">
                {countLabel}
                {activeFilterCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-white text-primary text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </span>
            </Button>
          </div>
        </div>

        {/* ── PC: 右リストパネル ── */}
        <div
          className={cn(
            "hidden md:flex flex-col bg-background border-l shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden",
            expanded ? "w-0" : "w-[420px]"
          )}
        >
          <div className="shrink-0 bg-background">
            {/* タイトルバー */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b">
              <h2 className="font-semibold text-sm">
                スポット一覧
                <span className="ml-2 text-muted-foreground font-normal">{countLabel}</span>
              </h2>
              <Button
                size="sm"
                className="rounded-full font-medium gap-1 hover:scale-105 hover:shadow-md transition-all cursor-pointer"
                onClick={() => { setEditPlace(undefined); setSheetOpen(true); }}
                disabled={!room}
              >
                ＋ 追加する
              </Button>
            </div>

            {/* ルーム情報バー */}
            {room && (
              <div className="flex items-center justify-between px-5 py-2 bg-muted/40 border-b">
                <div className="flex flex-col min-w-0 gap-0.5">
                  <div className="flex items-center gap-1.5">
                    {isRoomAdmin && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0">
                        <Shield className="size-2.5" />
                        管理者
                      </span>
                    )}
                    {room.name && (
                      <span className="text-xs font-medium truncate">{room.name}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    コード:{" "}
                    <span className="font-mono font-bold text-foreground">{room.share_code}</span>
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={copyRoomCode}
                    title="コードをコピー"
                    className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {codeCopied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
                  </button>
                  <button
                    onClick={handleLeaveRoom}
                    title="ルームを変更"
                    className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <LogOut className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* 検索バー */}
            <div className="flex items-center px-4 py-2.5 border-b">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="名前やメモで検索..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* スクロール可能なリスト */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredPlaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 text-muted-foreground text-sm gap-2">
                <p>
                  {places.length === 0
                    ? "まだスポットがありません"
                    : "条件に合うスポットがありません"}
                </p>
                {places.length === 0 && (
                  <p className="text-xs">「＋ 追加する」で登録してみましょう</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredPlaces.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    onSelect={handleSelectPlace}
                    distanceText={distanceMap.get(place.id)}
                    compact={true}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── モバイル Drawer ── */}
      <Drawer
        open={drawerOpen}
        onOpenChange={(v) => {
          setDrawerOpen(v);
          if (v) setDrawerSnap(0.45);
        }}
        snapPoints={[0.45, 0.92]}
        activeSnapPoint={drawerSnap}
        setActiveSnapPoint={setDrawerSnap}
        modal={false}
      >
        <DrawerContent className="flex flex-col md:hidden fixed">
          <DrawerHeader className="pb-0 text-left">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-sm">
                スポット一覧
                <span className="ml-2 text-muted-foreground font-normal">
                  {countLabel}
                </span>
              </DrawerTitle>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-muted rounded-full px-2 py-0.5"
                >
                  <X className="size-3" />
                  フィルター({activeFilterCount})クリア
                </button>
              )}
            </div>
          </DrawerHeader>

          {/* モバイル: カテゴリバー（snap スクロール対応） */}
          <div className="overflow-x-auto scrollbar-hide border-b snap-x snap-mandatory">
            <div className="flex gap-1.5 px-3 py-2 min-w-max">
              <button
                onClick={() => setFilterCategories([])}
                className={cn(
                  "flex items-center gap-1.5 px-3 min-h-[44px] rounded-full text-xs font-medium border transition-all shrink-0 cursor-pointer snap-center",
                  filterCategories.length === 0
                    ? "bg-foreground text-background border-foreground hover:opacity-80"
                    : "text-muted-foreground border-transparent hover:border-border hover:text-foreground hover:bg-muted/50"
                )}
              >
                すべて
              </button>
              {PRESET_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS];
                const isActive = filterCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleFilterCategory(cat)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 min-h-[44px] rounded-full text-xs font-medium border transition-all shrink-0 cursor-pointer snap-center",
                      isActive
                        ? "bg-foreground text-background border-foreground hover:opacity-80"
                        : "text-muted-foreground border-transparent hover:border-border hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {filterUI}

          <div
            className="overflow-y-auto flex flex-col gap-3 p-4"
            style={{
              flex: 1,
              overflowY: drawerSnap === 0.45 ? "hidden" : "auto",
            }}
          >
            {filteredPlaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                <p>
                  {places.length === 0
                    ? "まだスポットがありません"
                    : "条件に合うスポットがありません"}
                </p>
              </div>
            ) : (
              filteredPlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  onSelect={handleSelectPlace}
                  distanceText={distanceMap.get(place.id)}
                />
              ))
            )}
          </div>

          <DrawerFooter className="pt-0" style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))' }}>
            <Button
              className="w-full rounded-full font-medium gap-2"
              onClick={() => {
                setEditPlace(undefined);
                setSheetOpen(true);
                setDrawerOpen(false);
              }}
              disabled={!room}
            >
              <Plus className="size-4" />
              スポットを追加する
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* 追加・編集フォーム */}
      <AddPlaceSheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        coords={coords}
        geocodedAddress={geocodedAddress}
        onPickFromMap={handlePickFromMap}
        onCoordsChange={handleCoordsChange}
        onSaved={handleSaved}
        editPlace={editPlace}
      />

      {/* 詳細シート */}
      <PlaceDetailSheet
        place={detailPlace}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        onDeleted={handleDeleted}
      />

      {/* ルーム参加ダイアログ */}
      <RoomJoinDialog
        open={roomDialogOpen}
        currentUserName={currentUser.name}
        initialCode={urlCode}
        onJoined={handleRoomJoined}
      />
    </div>
  );
}
