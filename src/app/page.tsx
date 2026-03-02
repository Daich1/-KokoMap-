"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxLanguage from "@mapbox/mapbox-gl-language";
import { LocateFixed, List, Search, Copy, Check, LogOut, SlidersHorizontal, X, Star, CheckCircle2, Utensils, Wine, Gamepad2, Landmark, Coffee, ShoppingBag, Camera, BedDouble, Waves, Plus, Shield, Lock, Unlock, Share2, Users, Crown, Eye, ChevronUp } from "lucide-react";
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
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { AuthScreen } from "@/components/AuthScreen";
import { MemberManageSheet } from "@/components/MemberManageSheet";
import { supabase, type Place, type Room, type SpotStatus, type RoomMember } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { useMapStore } from "@/store/useMapStore";
import { toast } from "sonner";
import { reverseGeocode } from "@/lib/geocoding";
import { PRESET_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { calcDistance, formatDistance } from "@/lib/geo";
import { isPlaceOpenNow } from "@/lib/openNow";

const ROLE_LABELS: Record<string, string> = {
  leader: "リーダー",
  admin:  "管理者",
  member: "メンバー",
  viewer: "閲覧者",
};

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
    myRole,
    roomMembers,
    spotStatuses,
    userLocation,
    setRoom,
    clearRoom,
    setMyRole,
    setRoomMembers,
    upsertRoomMember,
    removeRoomMember,
    setPlaces,
    addPlace,
    upsertPlace,
    removePlace,
    setCurrentUser,
    setUserLocation,
    loadSpotStatuses,
  } = useMapStore();

  // 権限ヘルパー
  const canAdd = myRole !== "viewer" && myRole !== null;
  const canManageRoom = myRole === "leader";
  const canManageMembers = myRole === "leader";

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
  const [memberManageOpen, setMemberManageOpen] = useState(false);
  const [urlCode, setUrlCode] = useState<string | undefined>(undefined);

  // ── Supabase Auth セッション管理 ──────────────────────────────
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      if (user) {
        const userName = user.user_metadata?.username ?? user.email?.split("@")[0] ?? "";
        setCurrentUser({ id: user.id, name: userName });
      }
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      if (user) {
        const userName = user.user_metadata?.username ?? user.email?.split("@")[0] ?? "";
        setCurrentUser({ id: user.id, name: userName });
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL の ?code= パラメータを検出してダイアログに渡す（room hydration より先に実行）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      const normalized = code.trim().toUpperCase().slice(0, 8);
      setUrlCode(normalized);
      setRoomDialogOpen(true);
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  }, []);

  // Zustand が localStorage から hydrate した後にダイアログ状態を同期
  // urlCode がある場合はダイアログを閉じない
  useEffect(() => {
    if (room && !urlCode) setRoomDialogOpen(false);
  }, [room, urlCode]);
  const [codeCopied, setCodeCopied] = useState(false);

  // Filter state
  const [filterText, setFilterText] = useState("");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterBudgetMin, setFilterBudgetMin] = useState("");
  const [filterBudgetMax, setFilterBudgetMax] = useState("");
  const [filterOpenNow, setFilterOpenNow] = useState(false);
  const [filterStatus, setFilterStatus] = useState<SpotStatus | null>(null);
  const [sortOrder, setSortOrder] = useState<"default" | "distance">("default");

  // ── 初期化: スポットステータスを読み込む ─────────────────
  useEffect(() => {
    loadSpotStatuses(currentUser.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  // ── 初期化: ルームのメンバー一覧とロールを取得 ──────────
  useEffect(() => {
    if (!room) return;
    supabase
      .from("room_members")
      .select("*")
      .eq("room_id", room.id)
      .then(({ data }) => {
        if (!data) return;
        setRoomMembers(data as RoomMember[]);
        const me = data.find((m: RoomMember) => m.user_id === currentUser.id);
        if (me) setMyRole(me.role);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

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
  }, [places, filterText, filterCategories, filterBudgetMin, filterBudgetMax, filterOpenNow, filterStatus, spotStatuses, sortOrder, userLocation]);

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

  // filteredPlaces が変わったらマーカー表示/非表示を更新
  useEffect(() => {
    const filteredIds = new Set(filteredPlaces.map((p) => p.id));
    markers.current.forEach((marker, id) => {
      marker.getElement().style.display = filteredIds.has(id) ? "" : "none";
    });
  }, [filteredPlaces]);

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
      const store = useMapStore.getState();
      const cur = store.spotStatuses[place.id] ?? null;
      if (cur === "want_to_go") {
        store.removeSpotStatus(place.id);
        applyPopupStatusStyles(wantBtn, visitedBtn, null);
      } else {
        store.setSpotStatus(place.id, "want_to_go");
        applyPopupStatusStyles(wantBtn, visitedBtn, "want_to_go");
      }
    });

    visitedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const store = useMapStore.getState();
      const cur = store.spotStatuses[place.id] ?? null;
      if (cur === "visited") {
        store.removeSpotStatus(place.id);
        applyPopupStatusStyles(wantBtn, visitedBtn, null);
      } else {
        store.setSpotStatus(place.id, "visited");
        applyPopupStatusStyles(wantBtn, visitedBtn, "visited");
      }
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
    const myId = currentUser.id;

    // ── places チャンネル ──
    const placesChannel = supabase
      .channel(`room-places-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "places", filter: `room_id=eq.${room.id}` },
        (payload) => {
          const store = useMapStore.getState();
          if (payload.eventType === "INSERT") {
            const place = payload.new as Place;
            if (place.deleted_at) return;
            store.addPlace(place);
            addMarkerRef.current(place);
            // 他のユーザーが追加したスポットを通知
            if (place.created_by_id !== myId) {
              toast.info(`📍 ${place.created_by_name ?? "誰か"}さんが「${place.name}」を追加しました`);
            }
          } else if (payload.eventType === "UPDATE") {
            const place = payload.new as Place;
            if (place.deleted_at) {
              store.removePlace(place.id);
              removeMarkerRef.current(place.id);
            } else {
              store.upsertPlace(place);
              addMarkerRef.current(place);
            }
          }
        }
      )
      .subscribe();

    // ── room_members チャンネル ──
    const membersChannel = supabase
      .channel(`room-members-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${room.id}` },
        (payload) => {
          const store = useMapStore.getState();
          if (payload.eventType === "INSERT") {
            const member = payload.new as RoomMember;
            store.upsertRoomMember(member);
            // リーダーに参加通知
            if (store.myRole === "leader" && member.user_id !== myId) {
              toast.success(`👋 ${member.user_name}さんが参加しました`);
            }
          } else if (payload.eventType === "UPDATE") {
            const member = payload.new as RoomMember;
            store.upsertRoomMember(member);
            // 自分のロールが変わったら即時反映
            if (member.user_id === myId) {
              store.setMyRole(member.role);
              toast.info(`ロールが「${ROLE_LABELS[member.role]}」に変更されました`);
            }
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { user_id: string };
            store.removeRoomMember(old.user_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(placesChannel);
      supabase.removeChannel(membersChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleRoomJoined(joinedRoom: Room, userName: string, isCreator: boolean) {
    const role = isCreator ? "leader" : "member";
    const updatedUser = { ...currentUser, name: userName };
    setRoom(joinedRoom);
    setCurrentUser(updatedUser);
    setMyRole(role);
    setRoomDialogOpen(false);
    setUrlCode(undefined);

    await supabase.from("room_members").upsert(
      { room_id: joinedRoom.id, user_id: updatedUser.id, user_name: userName, role },
      { onConflict: "room_id,user_id" }
    );
  }

  // WelcomeScreen 用: 名前設定 + ルーム参加を一括処理
  async function handleWelcomeComplete(name: string, joinedRoom: Room, isCreator: boolean) {
    await handleRoomJoined(joinedRoom, name, isCreator);
  }

  async function handleLeaveRoom() {
    if (room) {
      await supabase.from("room_members")
        .delete()
        .eq("room_id", room.id)
        .eq("user_id", currentUser.id);
    }
    clearRoom();
    markers.current.forEach((m) => m.remove());
    markers.current.clear();
    setRoomDialogOpen(true);
  }

  async function handleLogout() {
    if (room) {
      await supabase.from("room_members")
        .delete()
        .eq("room_id", room.id)
        .eq("user_id", currentUser.id);
    }
    clearRoom();
    markers.current.forEach((m) => m.remove());
    markers.current.clear();
    await supabase.auth.signOut();
    setCurrentUser({ id: "", name: "" });
    setAuthUser(null);
  }

  function getRoomUrl() {
    if (!room) return "";
    return `${window.location.origin}${window.location.pathname}?code=${room.share_code}`;
  }

  function copyRoomCode() {
    if (!room) return;
    navigator.clipboard.writeText(room.share_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function shareRoomUrl() {
    const url = getRoomUrl();
    if (!url || !room) return;
    const shareData = {
      title: room.name ?? "KokoMap ルーム",
      text: `「${room.name ?? room.share_code}」に参加しませんか？`,
      url,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* キャンセル等は無視 */ }
    } else {
      navigator.clipboard.writeText(url);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }

  async function toggleRoomOpen() {
    if (!room) return;
    const next = !room.is_open;
    const { error } = await supabase.from("rooms").update({ is_open: next }).eq("id", room.id);
    if (error) {
      console.error("Failed to update room:", error);
      return;
    }
    setRoom({ ...room, is_open: next });
  }

  const countLabel =
    filteredPlaces.length === places.length
      ? `${places.length}件`
      : `${filteredPlaces.length}/${places.length}件`;

  // アクティブフィルター数（バッジ表示用）
  const activeFilterCount = [
    filterCategories.length > 0,
    !!filterBudgetMin,
    !!filterBudgetMax,
    filterOpenNow,
    !!filterStatus,
  ].filter(Boolean).length;

  function clearAllFilters() {
    setFilterCategories([]);
    setFilterBudgetMin("");
    setFilterBudgetMax("");
    setFilterOpenNow(false);
    setFilterStatus(null);
  }

  // ── 認証前はローディングor認証画面を返す ──────────────────────
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
          "shrink-0 border-l transition-[width] duration-300 ease-in-out flex items-center justify-end px-3",
          expanded ? "w-0 overflow-hidden" : "w-[420px]"
        )}>
          {authUser && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{currentUser.name}</span>
              <button
                onClick={handleLogout}
                title="ログアウト"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="size-3.5" />
                ログアウト
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── モバイル: ルーム情報ヘッダーバー ── */}
      {room && (
        <div className="md:hidden shrink-0 flex items-center justify-between px-3 py-2 bg-background border-b gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {myRole && (
              <span className={`flex items-center gap-0.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 border
                ${myRole === "leader" ? "text-yellow-700 bg-yellow-50 border-yellow-200" :
                  myRole === "admin"  ? "text-blue-700 bg-blue-50 border-blue-200" :
                  myRole === "viewer" ? "text-gray-500 bg-gray-50 border-gray-200" :
                  "text-green-700 bg-green-50 border-green-200"}`}>
                {myRole === "leader" ? <Crown className="size-2.5" /> :
                 myRole === "admin"  ? <Shield className="size-2.5" /> :
                 myRole === "viewer" ? <Eye className="size-2.5" /> :
                 <Users className="size-2.5" />}
                {ROLE_LABELS[myRole]}
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
            {canManageRoom && (
              <button
                onClick={toggleRoomOpen}
                title={room.is_open ? "参加を締め切る" : "参加を再開する"}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors cursor-pointer ${room.is_open ? "text-green-700 hover:bg-green-50" : "text-red-600 hover:bg-red-50"}`}
              >
                {room.is_open ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                <span>{room.is_open ? "参加中" : "締切中"}</span>
              </button>
            )}
            {canManageMembers && (
              <button
                onClick={() => setMemberManageOpen(true)}
                title="メンバー管理"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <Users className="size-3.5" />
              </button>
            )}
            <button
              onClick={copyRoomCode}
              title="コードをコピー"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              {codeCopied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
              <span className="text-xs">{codeCopied ? "コピー済" : "コピー"}</span>
            </button>
            <button
              onClick={shareRoomUrl}
              title="シェア"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Share2 className="size-3.5" />
              <span className="text-xs">シェア</span>
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


          {/* PC: リスト切替ボタン */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="hidden md:flex absolute top-4 right-3 z-10 items-center gap-1.5 bg-white rounded-full shadow-md px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:shadow-lg active:scale-95 transition-all border border-gray-100 cursor-pointer"
            title={expanded ? "リストを表示" : "リストを隠す"}
          >
            <List className="size-3.5" />
            {expanded ? "リスト表示" : "リストを隠す"}
          </button>

          {/* モバイル: ログアウトボタン（右上） */}
          {authUser && (
            <button
              onClick={handleLogout}
              title="ログアウト"
              className="md:hidden absolute top-3 right-3 z-20 bg-white rounded-full shadow-md p-2.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="size-4" />
            </button>
          )}

          {/* 現在地ボタン */}
          <button
            onClick={handleLocateMe}
            className="absolute z-10 bg-white rounded-full shadow-lg p-2.5 hover:bg-gray-50 hover:shadow-xl active:scale-95 transition-all cursor-pointer right-3 md:bottom-6"
            style={{ bottom: 'calc(7.5rem + env(safe-area-inset-bottom, 0px))' }}
            title="現在地へ移動"
          >
            <LocateFixed className="size-5 text-gray-700" />
          </button>

          {/* モバイル: ＋ 追加 FAB（閲覧者には非表示） */}
          {canAdd && (
            <button
              onClick={() => { setEditPlace(undefined); setSheetOpen(true); }}
              disabled={!room}
              className="md:hidden absolute right-3 z-10 bg-primary text-primary-foreground rounded-full shadow-lg p-3 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
              title="場所を追加"
            >
              <Plus className="size-5" />
            </button>
          )}

          {/* モバイル: 常時表示のペークバー（スライドアップトリガー） */}
          <div
            className="md:hidden absolute left-0 right-0 z-10"
            style={{ bottom: 0 }}
          >
            <button
              className="w-full bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,0.13)] active:bg-gray-50 transition-colors"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
              onClick={() => { setDrawerOpen(true); setDrawerSnap(0.45); }}
            >
              {/* ドラッグハンドル（太め・目立つ） */}
              <div className="flex flex-col items-center gap-1 pt-3 pb-1">
                <div className="w-12 h-1.5 rounded-full bg-gray-300" />
              </div>
              {/* タイトル行 */}
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="bg-primary/10 rounded-full p-1.5">
                    <List className="size-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold leading-tight">スポット一覧</p>
                    <p className="text-xs text-muted-foreground leading-tight">{countLabel} · タップして開く</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-primary font-medium bg-primary/10 rounded-full px-2.5 py-1">
                      <SlidersHorizontal className="size-3" />
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronUp className="size-5 text-gray-400" />
                </div>
              </div>
            </button>
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
                disabled={!room || !canAdd}
              >
                ＋ 追加する
              </Button>
            </div>

            {/* ルーム情報バー */}
            {room && (
              <div className="flex items-center justify-between px-5 py-2 bg-muted/40 border-b">
                <div className="flex flex-col min-w-0 gap-0.5">
                  <div className="flex items-center gap-1.5">
                    {myRole && (
                      <span className={`flex items-center gap-0.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 border
                        ${myRole === "leader" ? "text-yellow-700 bg-yellow-50 border-yellow-200" :
                          myRole === "admin"  ? "text-blue-700 bg-blue-50 border-blue-200" :
                          myRole === "viewer" ? "text-gray-500 bg-gray-50 border-gray-200" :
                          "text-green-700 bg-green-50 border-green-200"}`}>
                        {myRole === "leader" ? <Crown className="size-2.5" /> :
                         myRole === "admin"  ? <Shield className="size-2.5" /> :
                         myRole === "viewer" ? <Eye className="size-2.5" /> :
                         <Users className="size-2.5" />}
                        {ROLE_LABELS[myRole]}
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
                  {canManageRoom && (
                    <button
                      onClick={toggleRoomOpen}
                      title={room.is_open ? "参加を締め切る" : "参加を再開する"}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${room.is_open ? "text-green-700 hover:bg-green-50" : "text-red-600 hover:bg-red-50"}`}
                    >
                      {room.is_open ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                    </button>
                  )}
                  {canManageMembers && (
                    <button
                      onClick={() => setMemberManageOpen(true)}
                      title="メンバー管理"
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Users className="size-3.5" />
                    </button>
                  )}
                  <button
                    onClick={copyRoomCode}
                    title="コードをコピー"
                    className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {codeCopied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
                  </button>
                  <button
                    onClick={shareRoomUrl}
                    title="シェア"
                    className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Share2 className="size-3.5" />
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

      {/* ── モバイル Drawer（常時ペーク表示） ── */}
      <Drawer
        open={drawerOpen}
        onOpenChange={(v) => {
          setDrawerOpen(v);
          if (v) setDrawerSnap(0.45);
        }}
        snapPoints={[0.45, 1]}
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
              overflowY: drawerSnap === 1 ? "auto" : "hidden",
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

          {canAdd && (
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
          )}
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

      {/* ルーム未参加時: グループ作成/参加 */}
      {!room && roomDialogOpen && (
        <WelcomeScreen
          initialCode={urlCode}
          onComplete={handleWelcomeComplete}
          userName={currentUser.name}
        />
      )}

      {/* ルーム変更ダイアログ（ルームを持っているときに退出後など） */}
      {room && (
        <RoomJoinDialog
          open={roomDialogOpen}
          currentUserName={currentUser.name}
          initialCode={urlCode}
          onJoined={handleRoomJoined}
        />
      )}

      {/* メンバー管理シート */}
      {room && (
        <MemberManageSheet
          open={memberManageOpen}
          onOpenChange={setMemberManageOpen}
          roomId={room.id}
          myUserId={currentUser.id}
          members={roomMembers}
          onRoleChanged={upsertRoomMember}
        />
      )}

      {/* ── 認証オーバーレイ（マップは背後で初期化し続ける） ── */}
      {authLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">読み込み中...</p>
          </div>
        </div>
      )}

      {!authLoading && !authUser && (
        <AuthScreen
          onAuth={(user) => {
            setAuthUser(user);
            const userName = user.user_metadata?.username ?? user.email?.split("@")[0] ?? "";
            setCurrentUser({ id: user.id, name: userName });
          }}
        />
      )}
    </div>
  );
}
