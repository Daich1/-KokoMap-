"use client";

import { useCallback, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type Supercluster from "supercluster";
import { useMapStore } from "@/store/useMapStore";
import { type Place, type SpotStatus } from "@/lib/supabase";
import { buildClusterIndex, CLUSTER_THRESHOLD, type PlacePointProps } from "@/lib/clustering";
import { getCreatorColor } from "@/lib/constants";

// ── ポップアップのカテゴリ絵文字 ─────────────────────────────────────
const POPUP_CATEGORY_EMOJI: Record<string, string> = {
  "食事": "🍜", "飲み": "🍺", "娯楽": "🎮", "観光": "🏛", "カフェ・休憩": "☕",
  "買い物": "🛍", "映え・絶景": "📸", "宿": "🏨", "風呂": "♨️",
};

function getCategoryEmoji(category: string): string | null {
  return POPUP_CATEGORY_EMOJI[category] ?? null;
}

// ── ポップアップのステータスボタンスタイル更新（純粋関数）────────────
function applyPopupStatusStyles(
  wantBtn: HTMLButtonElement,
  visitedBtn: HTMLButtonElement,
  status: SpotStatus | null
) {
  const base = "flex-1 text-xs rounded-full py-1.5 px-1 border transition-all duration-150 truncate font-medium cursor-pointer";
  const activeWant = `${base} bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700 font-semibold shadow-sm`;
  const activeVisit = `${base} bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700 font-semibold shadow-sm`;
  const inactive = `${base} text-muted-foreground/70 border-border hover:bg-muted hover:text-foreground hover:border-muted-foreground/40`;

  wantBtn.className = status === "want_to_go" ? activeWant : inactive;
  visitedBtn.className = status === "visited" ? activeVisit : inactive;
}

interface UseMapMarkersArgs {
  map: React.RefObject<mapboxgl.Map | null>;
  mapLoaded: boolean;
  filteredPlaces: Place[];
  // ポップアップ本体クリック時（詳細を開く）。ref 経由で最新を呼ぶ。
  onPlaceClickRef: React.RefObject<(place: Place) => void>;
  // マーカークリック時にモバイルのリストを閉じる
  collapseMobileList: () => void;
}

// ── スポットマーカー + ポップアップ + クラスタリングの管理 ─────────────
export function useMapMarkers({
  map,
  mapLoaded,
  filteredPlaces,
  onPlaceClickRef,
  collapseMobileList,
}: UseMapMarkersArgs) {
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  // ポップアップ内のステータスボタン要素を保持（spotStatuses 変化時に DOM 更新用）
  const popupStatusEls = useRef<
    Map<string, { wantBtn: HTMLButtonElement; visitedBtn: HTMLButtonElement }>
  >(new Map());
  const spotStatuses = useMapStore((s) => s.spotStatuses);

  // collapseMobileList の最新参照
  const collapseListRef = useRef(collapseMobileList);
  collapseListRef.current = collapseMobileList;

  // ── spotStatuses 変化時にポップアップ DOM を更新 ─────────
  useEffect(() => {
    popupStatusEls.current.forEach(({ wantBtn, visitedBtn }, placeId) => {
      const status: SpotStatus | null = spotStatuses[placeId] ?? null;
      applyPopupStatusStyles(wantBtn, visitedBtn, status);
    });
  }, [spotStatuses]);

  // ── マーカー追加（冪等: 既存は削除してから追加）──────
  const addMarker = useCallback((place: Place) => {
    if (!map.current) return;

    markers.current.get(place.id)?.remove();
    markers.current.delete(place.id);
    popupStatusEls.current.delete(place.id);

    const popupEl = document.createElement("div");
    popupEl.className = "w-56 overflow-hidden cursor-pointer group";

    // ── 画像部分 ──
    const imageWrap = document.createElement("div");
    imageWrap.className =
      "h-32 w-full overflow-hidden bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center popup-img-wrap";

    if (place.image_urls && place.image_urls.length > 0) {
      const img = document.createElement("img");
      img.src = place.image_urls[0];
      img.alt = place.name;
      img.className = "h-full w-full object-cover transition-transform duration-300";
      img.style.cssText = "will-change:transform";
      // ホバー時に少し拡大
      popupEl.addEventListener("mouseenter", () => { img.style.transform = "scale(1.05)"; });
      popupEl.addEventListener("mouseleave", () => { img.style.transform = "scale(1)"; });
      imageWrap.appendChild(img);
    } else {
      // カテゴリ絵文字 or デフォルトアイコン
      const emoji = place.categories?.[0] ? getCategoryEmoji(place.categories[0]) : null;
      if (emoji) {
        const emojiEl = document.createElement("span");
        emojiEl.className = "text-4xl select-none";
        emojiEl.textContent = emoji;
        imageWrap.appendChild(emojiEl);
      } else {
        imageWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
      }
    }

    // 画像上に投稿者名をオーバーレイ
    if (place.created_by_name) {
      const creatorBadge = document.createElement("span");
      creatorBadge.className =
        "absolute bottom-1.5 left-1.5 z-10 bg-black/50 backdrop-blur-sm text-white text-[10px] font-medium rounded-full px-2 py-0.5";
      creatorBadge.textContent = `by ${place.created_by_name}`;
      imageWrap.appendChild(creatorBadge);
    }

    // ── 情報セクション ──
    const info = document.createElement("div");
    info.className = "px-3 pt-2.5 pb-3 flex flex-col gap-1.5";

    const titleEl = document.createElement("p");
    titleEl.className = "font-bold text-sm truncate leading-tight";
    titleEl.textContent = place.name;
    info.appendChild(titleEl);

    // カテゴリ + 予算のメタ行
    const metaRow = document.createElement("div");
    metaRow.className = "flex items-center gap-1.5 flex-wrap";
    let hasMeta = false;

    if (place.categories && place.categories.length > 0) {
      place.categories.slice(0, 2).forEach((cat) => {
        const badge = document.createElement("span");
        badge.className =
          "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground";
        badge.textContent = cat;
        metaRow.appendChild(badge);
        hasMeta = true;
      });
    }

    const budgetParts: string[] = [];
    if (place.budget_min != null)
      budgetParts.push(`¥${place.budget_min.toLocaleString()}`);
    if (place.budget_max != null)
      budgetParts.push(`¥${place.budget_max.toLocaleString()}`);
    if (budgetParts.length > 0) {
      const budgetEl = document.createElement("span");
      budgetEl.className = "text-[10px] text-muted-foreground/80 font-medium";
      budgetEl.textContent = budgetParts.join(" 〜 ");
      metaRow.appendChild(budgetEl);
      hasMeta = true;
    }

    if (hasMeta) info.appendChild(metaRow);

    // ステータストグルボタン
    const statusRow = document.createElement("div");
    statusRow.className = "flex gap-1.5 mt-0.5";

    const wantBtn = document.createElement("button");
    wantBtn.textContent = "⭐ 行きたい";

    const visitedBtn = document.createElement("button");
    visitedBtn.textContent = "✅ 行った";

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

    popupStatusEls.current.set(place.id, { wantBtn, visitedBtn });

    popupEl.appendChild(imageWrap);
    popupEl.appendChild(info);

    let markerInstance: mapboxgl.Marker | null = null;
    popupEl.addEventListener("click", () => {
      markerInstance?.getPopup()?.remove();
      onPlaceClickRef.current?.(place);
    });

    const popup = new mapboxgl.Popup({
      offset: 12,
      closeButton: false,
      maxWidth: "none",
      className: "custom-popup",
    }).setDOMContent(popupEl);

    const store = useMapStore.getState();
    const markerColor = getCreatorColor(place.created_by_id, store.roomMembers);

    const marker = new mapboxgl.Marker({ color: markerColor })
      .setLngLat([place.lng, place.lat])
      .setPopup(popup)
      .addTo(map.current);

    // マーカクリック時のUX改善：ドロワーを最小化し、マップを中央へパンする
    marker.getElement().addEventListener("click", () => {
      // モバイルの場合はリストを閉じてマップ下部に余白(約300px)を持たせてパン
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        collapseListRef.current();
      }
      map.current?.flyTo({
        center: [place.lng, place.lat],
        zoom: 15,
        padding: { bottom: isMobile ? window.innerHeight * 0.35 : 0 },
        duration: 800,
      });
    });

    markerInstance = marker;
    markers.current.set(place.id, marker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeMarker = useCallback((placeId: string) => {
    markers.current.get(placeId)?.remove();
    markers.current.delete(placeId);
    popupStatusEls.current.delete(placeId);
  }, []);

  const clearMarkers = useCallback(() => {
    markers.current.forEach((m) => m.remove());
    markers.current.clear();
    popupStatusEls.current.clear();
  }, []);

  // Realtime コールバック内で使うための安定参照
  const addMarkerRef = useRef(addMarker);
  const removeMarkerRef = useRef(removeMarker);
  useEffect(() => { addMarkerRef.current = addMarker; }, [addMarker]);
  useEffect(() => { removeMarkerRef.current = removeMarker; }, [removeMarker]);

  // ── クラスタリング ─────────────────────────────────────
  // スポット数が CLUSTER_THRESHOLD 未満: 全マーカー表示
  // 以上: supercluster でズームに応じてクラスタ円マーカーに集約
  const clusterIndexRef = useRef<Supercluster<PlacePointProps> | null>(null);
  const clusterMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());

  const refreshClusters = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const filteredIds = new Set(filteredPlaces.map((p) => p.id));

    // クラスタリング無効時: 既存動作（フィルタ通過分を全表示）
    const index = clusterIndexRef.current;
    if (!index || filteredPlaces.length < CLUSTER_THRESHOLD) {
      clusterMarkersRef.current.forEach((mk) => mk.remove());
      clusterMarkersRef.current.clear();
      markers.current.forEach((marker, id) => {
        marker.getElement().style.display = filteredIds.has(id) ? "" : "none";
      });
      return;
    }

    const b = m.getBounds();
    if (!b) return;
    const bbox: [number, number, number, number] = [
      b.getWest(), b.getSouth(), b.getEast(), b.getNorth(),
    ];
    const clusters = index.getClusters(bbox, Math.floor(m.getZoom()));

    const visibleLeafIds = new Set<string>();
    const activeClusterIds = new Set<number>();

    for (const c of clusters) {
      const [lng, lat] = c.geometry.coordinates;
      if (c.properties && "cluster" in c.properties && c.properties.cluster) {
        const cid = c.properties.cluster_id as number;
        activeClusterIds.add(cid);
        let mk = clusterMarkersRef.current.get(cid);
        if (!mk) {
          const el = document.createElement("div");
          el.className = "cluster-marker";
          el.textContent = String(c.properties.point_count);
          el.addEventListener("click", () => {
            const zoom = Math.min(index.getClusterExpansionZoom(cid), 18);
            m.easeTo({ center: [lng, lat], zoom });
          });
          mk = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
          clusterMarkersRef.current.set(cid, mk);
        } else {
          mk.setLngLat([lng, lat]);
        }
      } else {
        visibleLeafIds.add((c.properties as PlacePointProps).placeId);
      }
    }

    // クラスタに吸収されたマーカーを隠す（画面外は元々描画されないので leaf のみ表示）
    markers.current.forEach((marker, id) => {
      marker.getElement().style.display = visibleLeafIds.has(id) ? "" : "none";
    });
    // 消えたクラスタを除去
    clusterMarkersRef.current.forEach((mk, cid) => {
      if (!activeClusterIds.has(cid)) {
        mk.remove();
        clusterMarkersRef.current.delete(cid);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredPlaces]);

  // filteredPlaces が変わったらインデックス再構築 + 表示更新
  useEffect(() => {
    clusterIndexRef.current =
      filteredPlaces.length >= CLUSTER_THRESHOLD
        ? buildClusterIndex(filteredPlaces)
        : null;
    refreshClusters();
  }, [filteredPlaces, refreshClusters]);

  // 地図の移動・ズームでクラスタを再計算（ref 経由で最新の callback を呼ぶ）
  const refreshClustersRef = useRef(refreshClusters);
  refreshClustersRef.current = refreshClusters;
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    const handler = () => refreshClustersRef.current();
    m.on("moveend", handler);
    m.on("zoomend", handler);
    return () => {
      m.off("moveend", handler);
      m.off("zoomend", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

  return { addMarker, removeMarker, clearMarkers, addMarkerRef, removeMarkerRef };
}
