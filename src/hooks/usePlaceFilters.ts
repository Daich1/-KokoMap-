"use client";

import { useMemo, useState } from "react";
import { type Place, type SpotStatus } from "@/lib/supabase";
import { calcDistance, formatDistance } from "@/lib/geo";
import { isPlaceOpenNow } from "@/lib/openNow";

export type SortOrder = "default" | "distance" | "newest" | "budget";

// ── スポットの検索・フィルター・並び替え ─────────────────────────────
export function usePlaceFilters(
  places: Place[],
  spotStatuses: Record<string, SpotStatus>,
  userLocation: { lat: number; lng: number } | null
) {
  const [filterText, setFilterText] = useState("");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterBudgetMin, setFilterBudgetMin] = useState("");
  const [filterBudgetMax, setFilterBudgetMax] = useState("");
  const [filterOpenNow, setFilterOpenNow] = useState(false);
  const [filterStatus, setFilterStatus] = useState<SpotStatus | null>(null);
  const [filterCreatorId, setFilterCreatorId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("default");

  const filteredPlaces = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    const budgetMin = filterBudgetMin.trim() ? parseInt(filterBudgetMin, 10) : null;
    const budgetMax = filterBudgetMax.trim() ? parseInt(filterBudgetMax, 10) : null;

    let result = places.filter((place) => {
      if (query) {
        const haystack = [
          place.name ?? "",
          place.note ?? "",
          place.address ?? "",
          ...(place.categories ?? []),
          ...(place.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
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
      // 登録者フィルター
      if (filterCreatorId !== null) {
        if (place.created_by_id !== filterCreatorId) return false;
      }
      return true;
    });

    // 並び替え
    if (sortOrder === "distance" && userLocation) {
      result = [...result].sort((a, b) => {
        const da = calcDistance(userLocation.lat, userLocation.lng, a.lat, a.lng);
        const db = calcDistance(userLocation.lat, userLocation.lng, b.lat, b.lng);
        return da - db;
      });
    } else if (sortOrder === "newest") {
      result = [...result].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (sortOrder === "budget") {
      // 予算(下限)の安い順。未設定は末尾へ
      result = [...result].sort((a, b) => {
        const ba = a.budget_min ?? Number.POSITIVE_INFINITY;
        const bb = b.budget_min ?? Number.POSITIVE_INFINITY;
        return ba - bb;
      });
    }

    return result;
  }, [places, filterText, filterCategories, filterBudgetMin, filterBudgetMax, filterOpenNow, filterStatus, filterCreatorId, spotStatuses, sortOrder, userLocation]);

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

  // アクティブフィルター数（バッジ表示用）
  const activeFilterCount = [
    filterCategories.length > 0,
    !!filterBudgetMin,
    !!filterBudgetMax,
    filterOpenNow,
    !!filterStatus,
    !!filterCreatorId,
  ].filter(Boolean).length;

  function clearAllFilters() {
    setFilterCategories([]);
    setFilterBudgetMin("");
    setFilterBudgetMax("");
    setFilterOpenNow(false);
    setFilterStatus(null);
    setFilterCreatorId(null);
  }

  function toggleFilterCategory(cat: string) {
    setFilterCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  return {
    filterText, setFilterText,
    filterCategories, setFilterCategories,
    filterBudgetMin, setFilterBudgetMin,
    filterBudgetMax, setFilterBudgetMax,
    filterOpenNow, setFilterOpenNow,
    filterStatus, setFilterStatus,
    filterCreatorId, setFilterCreatorId,
    sortOrder, setSortOrder,
    filteredPlaces,
    distanceMap,
    activeFilterCount,
    clearAllFilters,
    toggleFilterCategory,
  };
}

export type PlaceFilters = ReturnType<typeof usePlaceFilters>;
