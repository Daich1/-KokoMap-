"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { Place } from "@/lib/supabase";

// ── プラン（日程）の経路ライン + 番号ピンを地図に描画 ──────────────
// focusedPlanDay が指定された日のスポットを訪問順に結び、番号付きマーカーを立てる。
// 日が切り替わったタイミングでその範囲にフィットする。
export function usePlanRoute(
  map: React.RefObject<mapboxgl.Map | null>,
  mapLoaded: boolean,
  places: Place[],
  focusedPlanDay: number | null,
) {
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const prevDayRef = useRef<number | null>(null);

  // その日のスポットを訪問順にソート
  const dayItems =
    focusedPlanDay == null
      ? []
      : places
          .filter((p) => p.plan_day === focusedPlanDay)
          .sort(
            (a, b) =>
              (a.plan_order ?? Number.MAX_SAFE_INTEGER) -
                (b.plan_order ?? Number.MAX_SAFE_INTEGER) ||
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );

  // ライン座標 + マーカー位置のキー（並べ替え・座標変化で再描画）
  const shapeKey = dayItems.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|");

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const m = map.current;

    // 既存の番号ピンをクリア
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = [];

    const src = m.getSource("plan-route") as mapboxgl.GeoJSONSource | undefined;

    if (dayItems.length === 0) {
      src?.setData({ type: "FeatureCollection", features: [] });
      prevDayRef.current = focusedPlanDay;
      return;
    }

    // ライン（訪問順の直線）
    src?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: dayItems.map((p) => [p.lng, p.lat]),
          },
        },
      ],
    });

    // 番号ピン
    dayItems.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "plan-pin";
      el.textContent = String(i + 1);
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.lng, p.lat])
        .addTo(m);
      markersRef.current.push(marker);
    });

    // 日が切り替わった時だけフィット（並べ替えでは動かさない）
    if (prevDayRef.current !== focusedPlanDay) {
      const bounds = new mapboxgl.LngLatBounds(
        [dayItems[0].lng, dayItems[0].lat],
        [dayItems[0].lng, dayItems[0].lat],
      );
      dayItems.forEach((p) => bounds.extend([p.lng, p.lat]));
      m.fitBounds(bounds, { padding: 90, duration: 800, maxZoom: 15 });
    }
    prevDayRef.current = focusedPlanDay;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, focusedPlanDay, shapeKey]);

  // アンマウント時にピンを掃除
  useEffect(() => {
    return () => {
      markersRef.current.forEach((mk) => mk.remove());
      markersRef.current = [];
    };
  }, []);
}
