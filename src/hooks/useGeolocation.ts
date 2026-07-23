"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { useMapStore } from "@/store/useMapStore";

// ── 現在地の追跡（watchPosition）+ 青点マーカー + コンパスビーム ──────────
export function useGeolocation(
  map: React.RefObject<mapboxgl.Map | null>,
  mapLoaded: boolean
) {
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const userBeamElRef = useRef<HTMLDivElement | null>(null);
  const geoWatchRef = useRef<number | null>(null);
  const userLocation = useMapStore((s) => s.userLocation);

  // watchPosition → ストアへ反映
  useEffect(() => {
    if (!navigator.geolocation) return;

    geoWatchRef.current = navigator.geolocation.watchPosition(
      ({ coords: c }) => {
        useMapStore.getState().setUserLocation({ lat: c.latitude, lng: c.longitude });
      },
      (err) => console.warn("Geolocation error:", err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );

    return () => {
      if (geoWatchRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
      }
    };
  }, []);

  // 現在地マーカー（Googleマップ風の青点）の作成・更新
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return;

    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "user-location-marker";
      el.innerHTML =
        '<div class="user-location-beam"></div>' +
        '<div class="user-location-pulse"></div>' +
        '<div class="user-location-dot"></div>';
      userBeamElRef.current = el.querySelector(".user-location-beam");
      userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map.current);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, mapLoaded]);

  // 端末の向き（コンパス）をビームに反映
  useEffect(() => {
    function handleOrientation(e: DeviceOrientationEvent) {
      const webkitHeading = (e as unknown as { webkitCompassHeading?: number })
        .webkitCompassHeading;
      let heading: number | null = null;
      if (typeof webkitHeading === "number") {
        heading = webkitHeading;
      } else if (e.absolute && e.alpha !== null) {
        heading = 360 - e.alpha;
      }
      if (heading === null || Number.isNaN(heading)) return;

      const el = userBeamElRef.current;
      if (!el) return;
      el.style.opacity = "1";
      el.style.transform = `translate(-50%, -50%) rotate(${heading}deg)`;
    }

    window.addEventListener("deviceorientationabsolute", handleOrientation);
    window.addEventListener("deviceorientation", handleOrientation);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation);
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, []);

  return { userLocation };
}
