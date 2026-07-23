"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { LocateFixed, List, Search, SlidersHorizontal, X, Plus, Settings, Route as RouteIcon } from "lucide-react";
import { DirectionsPanel, type RouteResult } from "@/components/DirectionsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AddPlaceSheet } from "@/components/AddPlaceSheet";
import { PlaceDetailSheet } from "@/components/PlaceDetailSheet";
import { PlaceCard } from "@/components/PlaceCard";
import { RoomJoinDialog } from "@/components/RoomJoinDialog";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { AuthScreen } from "@/components/AuthScreen";
import { MemberManageSheet } from "@/components/MemberManageSheet";
import { ProfileSettings } from "@/components/ProfileSettings";
import { BottomNav, type TabId } from "@/components/BottomNav";
import { PlanTab, PlanTabContent } from "@/components/tabs/PlanTab";
import { GroupTab, GroupTabContent } from "@/components/tabs/GroupTab";
import { MyPageTab } from "@/components/tabs/MyPageTab";
import { FilterPanel } from "@/components/FilterPanel";
import { CategoryBar } from "@/components/CategoryBar";
import { RoomHeaderActions } from "@/components/RoomHeaderActions";
import { supabase, type Place, type Room, type RoomMember } from "@/lib/supabase";
import { useMapStore } from "@/store/useMapStore";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { reverseGeocode } from "@/lib/geocoding";
import { cn } from "@/lib/utils";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useMapInstance } from "@/hooks/useMapInstance";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useMapMarkers } from "@/hooks/useMapMarkers";
import { useRealtimeRoom } from "@/hooks/useRealtimeRoom";
import { usePlaceFilters } from "@/hooks/usePlaceFilters";

export default function Home() {
  const pickingModeRef = useRef(false);

  // ── Zustand ストア ────────────────────────────────────
  // セレクタ購読: Home が使う state のみ購読する
  // （allMemberStatuses の Realtime 更新でシェル全体が再レンダーされるのを防ぐ）
  const {
    places,
    room,
    currentUser,
    myRole,
    roomMembers,
    spotStatuses,
    userLocation,
  } = useMapStore(
    useShallow((s) => ({
      places: s.places,
      room: s.room,
      currentUser: s.currentUser,
      myRole: s.myRole,
      roomMembers: s.roomMembers,
      spotStatuses: s.spotStatuses,
      userLocation: s.userLocation,
    }))
  );
  // アクションは参照が安定しているため購読不要
  const {
    setRoom,
    clearRoom,
    setMyRole,
    setRoomMembers,
    upsertRoomMember,
    setPlaces,
    addPlace,
    upsertPlace,
    removePlace,
    setCurrentUser,
    loadSpotStatuses,
    loadAllMemberStatuses,
  } = useMapStore.getState();

  // 権限ヘルパー
  const canAdd = myRole !== "viewer" && myRole !== null;
  const canManageRoom = myRole === "leader";
  const canManageMembers = myRole === "leader";

  // ── ボトムナビタブ ─────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>("map");
  // ── PC サイドパネルのタブ ──────────────────────────────
  const [deskTab, setDeskTab] = useState<"spots" | "plan" | "members">("spots");
  function handleTabChange(tab: TabId) {
    if (tab === "map") setIsListExpanded(false);
    setActiveTab(tab);
  }

  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [editPlace, setEditPlace] = useState<Place | undefined>(undefined);
  const [pickingMode, setPickingMode] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodedAddress, setGeocodedAddress] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [roomDialogOpen, setRoomDialogOpen] = useState(!room);
  const [memberManageOpen, setMemberManageOpen] = useState(false);
  const [urlCode, setUrlCode] = useState<string | undefined>(undefined);
  const [profileOpen, setProfileOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // ── 認証セッション + 所属マップ復元 ──────────────────────────
  const handleRoomMissing = useCallback(() => setRoomDialogOpen(true), []);
  const { authUser, setAuthUser, authLoading, restoreUserRoom } = useAuthSession(handleRoomMissing);

  // ── マップ初期化 ─────────────────────────────────────
  const onMapClickRef = useRef<(c: { lat: number; lng: number }) => void>(() => {});
  const { mapContainer, map, mapLoaded } = useMapInstance(onMapClickRef);

  // マップクリック: ピッキングモード時のみ座標を確定
  onMapClickRef.current = async ({ lat, lng }) => {
    if (!pickingModeRef.current) return;
    pickingModeRef.current = false;
    setCoords({ lat, lng });
    setPickingMode(false);
    setSheetOpen(true);
    const address = await reverseGeocode(lat, lng);
    if (address) setGeocodedAddress(address);
  };

  // ── 現在地（watchPosition + 青点マーカー + コンパス）──────────
  useGeolocation(map, mapLoaded);

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

  // ── フィルター ─────────────────────────────────────────
  const filters = usePlaceFilters(places, spotStatuses, userLocation);
  const {
    filterText, setFilterText,
    filterCategories, setFilterCategories,
    setFilterCreatorId,
    filteredPlaces, distanceMap, activeFilterCount,
    clearAllFilters, toggleFilterCategory,
  } = filters;

  // ── 初期化: スポットステータスを読み込む ─────────────────
  useEffect(() => {
    loadSpotStatuses(currentUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  // ── 全メンバーのスポットステータスを読み込む ──────────────
  // 件数ではなく id の集合をキーにする（件数据え置きで中身だけ変わった場合も再取得）
  const placeIdsKey = places.map((p) => p.id).sort().join(",");
  useEffect(() => {
    if (!room || places.length === 0) return;
    loadAllMemberStatuses(places.map((p) => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, placeIdsKey]);

  // ── 初期化: マップのメンバー一覧とロールを取得 ──────────
  useEffect(() => {
    if (!room || !currentUser.id) return;
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
  }, [room?.id, currentUser.id]);

  // ── マーカー + クラスタリング ──────────────────────────
  const onPlaceClickRef = useRef<(place: Place) => void>(() => {});
  const collapseMobileList = useCallback(() => setIsListExpanded(false), []);
  const { addMarker, removeMarker, clearMarkers, addMarkerRef, removeMarkerRef } =
    useMapMarkers({ map, mapLoaded, filteredPlaces, onPlaceClickRef, collapseMobileList });

  // ── room + mapLoaded → スポットを読み込む ───────────
  useEffect(() => {
    if (!mapLoaded || !room) return;

    clearMarkers();

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
  useRealtimeRoom({
    roomId: room?.id,
    currentUserId: currentUser.id,
    addMarkerRef,
    removeMarkerRef,
  });

  useEffect(() => {
    if (!map.current) return;
    map.current.getCanvas().style.cursor = pickingMode ? "crosshair" : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickingMode]);

  // 拡大縮小時にリサイズ
  useEffect(() => {
    const timer = setTimeout(() => map.current?.resize(), 310);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // ドラッグ可能なプレビューマーカー
  const previewMarkerRef = useRef<mapboxgl.Marker | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen, coords]);

  // ── 経路検索結果をマップに反映 ───────────────────────
  const routeOriginMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const routeDestMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const handleRouteChange = useCallback((route: RouteResult | null) => {
    const src = map.current?.getSource("route") as mapboxgl.GeoJSONSource | undefined;

    if (!route) {
      src?.setData({ type: "FeatureCollection", features: [] });
      routeOriginMarkerRef.current?.remove();
      routeOriginMarkerRef.current = null;
      routeDestMarkerRef.current?.remove();
      routeDestMarkerRef.current = null;
      return;
    }

    src?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: route.coordinates },
        },
      ],
    });

    if (routeOriginMarkerRef.current) {
      routeOriginMarkerRef.current.setLngLat([route.origin.lng, route.origin.lat]);
    } else if (map.current) {
      routeOriginMarkerRef.current = new mapboxgl.Marker({ color: "#16a34a" })
        .setLngLat([route.origin.lng, route.origin.lat])
        .addTo(map.current);
    }

    if (routeDestMarkerRef.current) {
      routeDestMarkerRef.current.setLngLat([route.destination.lng, route.destination.lat]);
    } else if (map.current) {
      routeDestMarkerRef.current = new mapboxgl.Marker({ color: "#dc2626" })
        .setLngLat([route.destination.lng, route.destination.lat])
        .addTo(map.current);
    }

    if (map.current) {
      const bounds = new mapboxgl.LngLatBounds(
        [route.origin.lng, route.origin.lat],
        [route.origin.lng, route.origin.lat]
      );
      bounds.extend([route.destination.lng, route.destination.lat]);
      route.coordinates.forEach((c) => bounds.extend(c));
      map.current.fitBounds(bounds, { padding: 80, duration: 1000, maxZoom: 16 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ハンドラー ───────────────────────────────────────
  function handleLocateMe() {
    // iOS Safari は DeviceOrientationEvent の利用にユーザー操作起点の許可が必要
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof DOE?.requestPermission === "function") {
      DOE.requestPermission().catch(() => {});
    }

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
    setIsListExpanded(false);
    setDetailPlace(place);
    setDetailOpen(true);
  }

  onPlaceClickRef.current = handleSelectPlace;

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
    let role: "leader" | "member" = isCreator ? "leader" : "member";
    const updatedUser = { ...currentUser, name: userName };

    // 既存の権限があればそれを優先（リーダーからの降格を防ぐ）
    const { data: existing } = await supabase
      .from("room_members")
      .select("role")
      .eq("room_id", joinedRoom.id)
      .eq("user_id", updatedUser.id)
      .maybeSingle();

    if (existing && existing.role) {
      role = existing.role as "leader" | "member";
    }

    // 先に DB 登録し、成功した場合のみローカル state を更新する
    // （RLS で拒否された場合に幽霊マップに入った状態を防ぐ）
    const { error: joinError } = await supabase.from("room_members").upsert(
      { room_id: joinedRoom.id, user_id: updatedUser.id, user_name: userName, role },
      { onConflict: "room_id,user_id" }
    );
    if (joinError) {
      console.error("Failed to join room:", joinError);
      toast.error("マップへの参加に失敗しました");
      return;
    }

    setRoom(joinedRoom);
    setCurrentUser(updatedUser);
    setMyRole(role);
    setRoomDialogOpen(false);
    setUrlCode(undefined);
  }

  // WelcomeScreen 用: 名前設定 + マップ参加を一括処理
  async function handleWelcomeComplete(name: string, joinedRoom: Room, isCreator: boolean) {
    await handleRoomJoined(joinedRoom, name, isCreator);
  }

  // 別のマップに切り替える（メンバーシップは維持）
  function handleLeaveRoom() {
    clearRoom();
    clearMarkers();
    setRoomDialogOpen(true);
  }

  // このマップから抜ける（自分のメンバーシップを削除）
  async function handleLeaveMap() {
    const r = room;
    if (!r) return;
    const { error } = await supabase
      .from("room_members")
      .delete()
      .eq("room_id", r.id)
      .eq("user_id", currentUser.id);
    if (error) {
      console.error("Failed to leave map:", error);
      toast.error("マップから抜けるのに失敗しました");
      return;
    }
    clearMarkers();
    clearRoom();
    toast.success("マップから抜けました");
    // 他に所属マップがあれば自動で開き、無ければ選択ダイアログ
    await restoreUserRoom(currentUser.id);
  }

  // このマップを削除（リーダーのみ・関連データも削除）
  async function handleDeleteMap() {
    const r = room;
    if (!r) return;
    const { error } = await supabase.rpc("delete_room", { p_room_id: r.id });
    if (error) {
      console.error("Failed to delete map:", error);
      toast.error("マップの削除に失敗しました（リーダーのみ削除できます）");
      return;
    }
    clearMarkers();
    clearRoom();
    toast.success("マップを削除しました");
    await restoreUserRoom(currentUser.id);
  }

  async function handleLogout() {
    clearRoom();
    clearMarkers();
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
      title: room.name ?? "KokoMap マップ",
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
      toast.error("参加受付の切り替えに失敗しました");
      return;
    }
    setRoom({ ...room, is_open: next });
  }

  const countLabel =
    filteredPlaces.length === places.length
      ? `${places.length}件`
      : `${filteredPlaces.length}/${places.length}件`;

  // ── フィルター Popover の中身（PC ヘッダー・モバイルドロワー共通）──
  const filterPopoverContent = (
    <FilterPanel
      filters={filters}
      roomMembers={roomMembers}
      places={places}
      userLocation={userLocation}
    />
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
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden">

      {/* ── PC: トップカテゴリ＋フィルターバー ── */}
      <div className="hidden md:flex shrink-0 bg-background border-b h-[52px]">

        {/* 左: マップ幅エリア（カテゴリ横スクロール + フィルターボタン） */}
        <div className="relative flex-1 overflow-hidden h-full flex items-center">
          <div className="overflow-x-auto scrollbar-hide h-full flex items-center w-full">
            <div className="flex items-center gap-1.5 px-4 h-full min-w-max">
              <CategoryBar
                variant="desktop"
                selectedCategories={filterCategories}
                onToggle={toggleFilterCategory}
                onClear={() => setFilterCategories([])}
              />
            </div>
          </div>

          {/* グラデーション境界 + フィルターボタン（マップ右端に固定） */}
          <div className="absolute right-0 top-0 h-full flex items-center">
            <div className="w-16 h-full bg-gradient-to-l from-background to-transparent pointer-events-none" />
            <div className="flex items-center gap-2 pr-3 pl-1 bg-background h-full">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all cursor-pointer hover:scale-105 active:scale-95",
                      activeFilterCount > 0
                        ? "bg-primary text-primary-foreground border-primary hover:opacity-80"
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

              {/* PC: アカウント＆設定 */}
              {authUser && (
                <div className="hidden md:flex items-center gap-1 border-l pl-2">
                  <button
                    onClick={() => setProfileOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-foreground/80 hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    title="設定"
                  >
                    <Settings className="size-4 text-muted-foreground" />
                    <span className="hidden lg:inline">{currentUser.name}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右: サイドバーと同幅スペーサー（マップ右端をヘッダーと揃える） */}
        <div className={cn(
          "shrink-0 border-l transition-[width] duration-300 ease-in-out hidden md:block",
          expanded ? "w-0" : "w-[420px]"
        )} />

      </div>

      {/* ── モバイル: マップ情報ヘッダーバー ── */}
      {room && (
        <div className="md:hidden relative z-[43] shrink-0 flex items-center justify-between px-3 bg-background border-b gap-2" style={{ minHeight: '52px' }}>
          <RoomHeaderActions
            variant="mobile"
            room={room}
            myRole={myRole}
            canManageRoom={canManageRoom}
            canManageMembers={canManageMembers}
            codeCopied={codeCopied}
            onToggleOpen={toggleRoomOpen}
            onOpenMemberManage={() => setMemberManageOpen(true)}
            onCopyCode={copyRoomCode}
            onShare={shareRoomUrl}
            onAddRoom={() => setRoomDialogOpen(true)}
          />
        </div>
      )}

      {/* ── メインコンテンツ（マップ＋リスト） ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── マップ（PC: 左 flex-1、モバイル: 全画面） ── */}
        <div className="relative flex-1 overflow-hidden">
          <div ref={mapContainer} className="w-full h-full" />

          {pickingMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-background border rounded-full shadow-lg px-5 py-2.5 flex items-center gap-3 text-sm font-medium whitespace-nowrap">
              <span>地図をクリックして場所を指定してください</span>
              <button
                onClick={cancelPicking}
                className="text-xs underline opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
              >
                キャンセル
              </button>
            </div>
          )}


          {/* PC: リスト切替・経路検索ボタン群 */}
          <div className="hidden md:flex absolute top-4 right-3 z-10 items-center gap-2">
            <button
              onClick={() => setDirectionsOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 map-glass-btn px-3 py-2 text-xs font-medium rounded-[13px] cursor-pointer",
                directionsOpen && "text-primary"
              )}
              title="経路を検索"
            >
              <RouteIcon className="size-3.5" />
              経路
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 map-glass-btn px-3 py-2 text-xs font-medium rounded-[13px] cursor-pointer"
              title={expanded ? "リストを表示" : "リストを隠す"}
            >
              <List className="size-3.5" />
              {expanded ? "リスト表示" : "リストを隠す"}
            </button>
          </div>

          {/* モバイル: 右上ボタン群（マップ上） */}
          {authUser && (
            <div className="md:hidden absolute top-3 right-3 z-20 flex items-center gap-2">
              <button
                onClick={() => setDirectionsOpen((v) => !v)}
                title="経路を検索"
                className={cn(
                  "map-glass-btn w-11 h-11 flex items-center justify-center rounded-[13px] cursor-pointer",
                  directionsOpen && "text-primary"
                )}
              >
                <RouteIcon className="size-5" />
              </button>
              <button
                onClick={() => setProfileOpen(true)}
                title="設定"
                className="map-glass-btn w-11 h-11 flex items-center justify-center rounded-[13px] cursor-pointer"
              >
                <Settings className="size-5" />
              </button>
            </div>
          )}

          {/* 現在地ボタン */}
          <button
            onClick={handleLocateMe}
            // PWAのSafe Areaを考慮（peek時は140px、展開時は85dvh）
            className="absolute z-10 map-glass-btn w-11 h-11 flex items-center justify-center rounded-[13px] cursor-pointer right-3 md:bottom-6"
            style={{
              bottom: isListExpanded
                ? 'calc(85dvh - 60px + env(safe-area-inset-bottom, 0px) + 0.75rem)'
                : 'calc(200px + env(safe-area-inset-bottom, 0px) + 0.75rem)',
              transition: 'bottom 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
            }}
            title="現在地へ移動"
          >
            <LocateFixed className="size-5" />
          </button>

          {/* 経路検索パネル */}
          {directionsOpen && (
            <DirectionsPanel
              onClose={() => setDirectionsOpen(false)}
              userLocation={userLocation}
              onRouteChange={handleRouteChange}
              places={places}
            />
          )}

          {/* モバイル: ＋ 追加 FAB（閲覧者には非表示・マップタブのみ） */}
          {canAdd && activeTab === "map" && (
            <button
              onClick={() => { setEditPlace(undefined); setSheetOpen(true); }}
              disabled={!room}
              className="md:hidden absolute right-3 z-[15] w-14 h-14 rounded-2xl bg-accent text-accent-foreground shadow-[0_6px_20px_oklch(0.64_0.17_28/0.5)] flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              style={{
                bottom: isListExpanded
                  ? 'calc(85dvh - 60px + env(safe-area-inset-bottom, 0px) - 3rem)'
                  : 'calc(200px + env(safe-area-inset-bottom, 0px) + 4rem)',
                transition: 'bottom 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
              }}
              title="場所を追加"
            >
              <Plus className="size-5" />
            </button>
          )}
        </div>

        {/* ── PC: 右リストパネル ── */}
        <div
          className={cn(
            "hidden md:flex flex-col bg-background border-l shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden",
            expanded ? "w-0" : "w-[420px]"
          )}
        >
          {/* パネルタブ切替（スポット / プラン / メンバー） */}
          <div className="shrink-0 flex border-b bg-background">
            {([
              { id: "spots", label: "スポット" },
              { id: "plan", label: "プラン" },
              { id: "members", label: "メンバー" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDeskTab(tab.id)}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer",
                  deskTab === tab.id
                    ? "text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {deskTab === "plan" && room && (
            <div className="flex-1 overflow-hidden">
              <PlanTabContent onSelectPlace={handleSelectPlace} />
            </div>
          )}

          {deskTab === "members" && room && (
            <div className="flex-1 overflow-y-auto flex flex-col">
              <GroupTabContent
                onInvite={shareRoomUrl}
                onManageMembers={() => setMemberManageOpen(true)}
                canManageMembers={canManageMembers}
                onSelectPlace={handleSelectPlace}
              />
            </div>
          )}

          {deskTab === "spots" && (<>
          <div className="shrink-0 bg-background">
            {/* タイトルバー */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b">
              <h2 className="font-bold text-base tracking-tight">
                スポット一覧
                <span className="ml-2 text-muted-foreground font-normal text-sm">{countLabel}</span>
              </h2>
              <button
                className="bg-accent text-accent-foreground rounded-[11px] px-3 py-1.5 text-sm font-bold shadow-[0_3px_10px_oklch(0.64_0.17_28/0.3)] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                onClick={() => { setEditPlace(undefined); setSheetOpen(true); }}
                disabled={!room || !canAdd}
              >
                ＋ 追加する
              </button>
            </div>

            {/* マップ情報バー */}
            {room && (
              <div className="flex items-center justify-between px-5 py-2 bg-muted/40 border-b">
                <RoomHeaderActions
                  variant="desktop"
                  room={room}
                  myRole={myRole}
                  canManageRoom={canManageRoom}
                  canManageMembers={canManageMembers}
                  codeCopied={codeCopied}
                  onToggleOpen={toggleRoomOpen}
                  onOpenMemberManage={() => setMemberManageOpen(true)}
                  onCopyCode={copyRoomCode}
                  onShare={shareRoomUrl}
                  onAddRoom={() => setRoomDialogOpen(true)}
                />
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
              <div className="flex flex-col gap-3" role="list">
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
          </>)}
        </div>

      </div>

      {/* ── モバイル カスタム BottomSheet（固定2段階） ── */}
      <div
        className={cn(
          "md:hidden fixed inset-x-0 z-40 bg-background rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden will-change-transform",
          // マップタブ以外では非表示
          activeTab !== "map" && "hidden",
        )}
        style={{
          bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
          height: 'calc(85dvh - 60px)',
          transform: isListExpanded
            ? 'translateY(0)'
            : 'translateY(calc(85dvh - 200px))',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
        }}
      >
        {/* ハンドル＆ヘッダー部分（ここをタップ・スワイプして開閉） */}
        <div
          className="shrink-0 cursor-pointer touch-pan-y"
          onClick={() => setIsListExpanded(!isListExpanded)}
          // 簡易スワイプ検知
          onTouchStart={(e) => {
            const touch = e.touches[0];
            const startY = touch.clientY;
            let currentY = startY;

            const handleTouchMove = (e: TouchEvent) => {
              currentY = e.touches[0].clientY;
            };

            const handleTouchEnd = () => {
              const diff = currentY - startY;
              if (diff > 30) {
                // 下スワイプ：閉じる
                setIsListExpanded(false);
              } else if (diff < -30) {
                // 上スワイプ：開く
                setIsListExpanded(true);
              }
              document.removeEventListener('touchmove', handleTouchMove);
              document.removeEventListener('touchend', handleTouchEnd);
            };

            document.addEventListener('touchmove', handleTouchMove, { passive: true });
            document.addEventListener('touchend', handleTouchEnd);
          }}
        >
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <h2 className="text-base font-bold tracking-tight">
              スポット一覧
              <span className="ml-2 text-muted-foreground font-normal text-sm">
                {countLabel}
              </span>
            </h2>
            {activeFilterCount > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); clearAllFilters(); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-muted rounded-full px-2 py-0.5"
              >
                <X className="size-3" />
                クリア
              </button>
            )}
          </div>

          {/* カテゴリバー */}
          <div className="overflow-x-auto scrollbar-hide border-b snap-x snap-mandatory px-2 pb-2">
            <div className="flex gap-1.5 min-w-max">
              <CategoryBar
                variant="mobile"
                selectedCategories={filterCategories}
                onToggle={toggleFilterCategory}
                onClear={() => setFilterCategories([])}
              />
            </div>
          </div>
        </div>

        {filterUI}

        {/* リスト本体 */}
        <div
          className="flex-1 overflow-y-auto flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] custom-scrollbar"
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

        {/* ボトム追加ボタン */}
        {canAdd && (
          <div className="shrink-0 p-4 border-t bg-background" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <button
              className="w-full bg-accent text-accent-foreground rounded-[14px] py-[14px] font-bold text-base shadow-[0_4px_16px_oklch(0.64_0.17_28/0.3)] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              onClick={() => {
                setEditPlace(undefined);
                setSheetOpen(true);
                setIsListExpanded(false);
              }}
              disabled={!room}
            >
              <Plus className="size-4" />
              スポットを追加する
            </button>
          </div>
        )}
      </div>

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
        onCreatorFilter={(creatorId) => {
          setFilterCreatorId(creatorId);
          setDetailOpen(false);
          setIsListExpanded(true); // Close map detail, open filtered list
        }}
      />

      {/* マップ未参加時: マップ作成/参加 */}
      {!room && roomDialogOpen && (
        <WelcomeScreen
          initialCode={urlCode}
          onComplete={handleWelcomeComplete}
          userName={currentUser.name}
        />
      )}

      {/* マップ変更ダイアログ（マップを持っているときに退出後など） */}
      {room && (
        <RoomJoinDialog
          open={roomDialogOpen}
          currentUserName={currentUser.name}
          initialCode={urlCode}
          onJoined={handleRoomJoined}
          onClose={() => setRoomDialogOpen(false)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
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

      {/* ── プロフィール設定（PC / 設定ボタン経由） ── */}
      <ProfileSettings
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onLogout={handleLogout}
        onLeaveRoom={handleLeaveRoom}
        onLeaveMap={handleLeaveMap}
        onDeleteMap={handleDeleteMap}
        canDeleteMap={canManageRoom}
        userId={authUser?.id}
        currentEmail={authUser?.user_metadata?.recovery_email}
      />

      {/* ── モバイルタブオーバーレイ ── */}
      {activeTab === "plan" && room && (
        <PlanTab
          onSelectPlace={(place) => {
            setDetailPlace(place);
            setDetailOpen(true);
          }}
        />
      )}
      {activeTab === "group" && room && (
        <GroupTab
          onInvite={shareRoomUrl}
          onManageMembers={() => setMemberManageOpen(true)}
          canManageMembers={canManageMembers}
          onSelectPlace={(p) => { setDetailPlace(p); setDetailOpen(true); }}
        />
      )}
      {activeTab === "mypage" && (
        <MyPageTab
          onLogout={handleLogout}
          onLeaveRoom={handleLeaveRoom}
          onLeaveMap={handleLeaveMap}
          onDeleteMap={handleDeleteMap}
          canDeleteMap={canManageRoom}
          userId={authUser?.id}
          currentEmail={authUser?.user_metadata?.recovery_email}
        />
      )}

      {/* ── BottomNav（モバイルのみ・認証済み＆マップ参加時） ── */}
      {!authLoading && authUser && room && (
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      )}
    </div>
  );
}
