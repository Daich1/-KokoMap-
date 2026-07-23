"use client";

import { X, Star, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getCreatorColor } from "@/lib/constants";
import type { Place, RoomMember } from "@/lib/supabase";
import type { PlaceFilters } from "@/hooks/usePlaceFilters";

interface FilterPanelProps {
  filters: PlaceFilters;
  roomMembers: RoomMember[];
  places: Place[];
  userLocation: { lat: number; lng: number } | null;
}

// ── フィルター Popover の中身（PC ヘッダー・モバイルドロワー共通）──────
export function FilterPanel({ filters, roomMembers, places, userLocation }: FilterPanelProps) {
  const {
    filterStatus, setFilterStatus,
    filterBudgetMin, setFilterBudgetMin,
    filterBudgetMax, setFilterBudgetMax,
    filterOpenNow, setFilterOpenNow,
    filterCreatorId, setFilterCreatorId,
    sortOrder, setSortOrder,
    activeFilterCount, clearAllFilters,
  } = filters;

  return (
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
            onClick={() => setFilterStatus(filterStatus === "want_to_go" ? null : "want_to_go")}
          >
            <Star className="size-3" />行きたい
          </Badge>
          <Badge
            variant={filterStatus === "visited" ? "default" : "outline"}
            className={cn("cursor-pointer select-none text-xs transition-colors gap-1", filterStatus === "visited" && "bg-green-600 hover:bg-green-700 border-green-600")}
            onClick={() => setFilterStatus(filterStatus === "visited" ? null : "visited")}
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
        <span className="text-xs font-medium text-muted-foreground">登録した人</span>
        <Select
          value={filterCreatorId ?? "all"}
          onValueChange={(val) => setFilterCreatorId(val === "all" ? null : val)}
        >
          <SelectTrigger className="w-full h-9 text-xs">
            <SelectValue placeholder="登録した人で絞り込む" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <SelectItem value="all" className="text-xs">すべて</SelectItem>
            {roomMembers
              .filter(m => Array.from(new Set(places.map(p => p.created_by_id))).includes(m.user_id))
              .map((member) => {
                const color = getCreatorColor(member.user_id, roomMembers);
                return (
                  <SelectItem key={member.user_id} value={member.user_id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="truncate">{member.user_name}</span>
                    </div>
                  </SelectItem>
                );
              })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">並び順</span>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={sortOrder === "default" ? "default" : "outline"} className="cursor-pointer select-none text-xs transition-colors" onClick={() => setSortOrder("default")}>
            追加順
          </Badge>
          <Badge variant={sortOrder === "newest" ? "default" : "outline"} className="cursor-pointer select-none text-xs transition-colors" onClick={() => setSortOrder("newest")}>
            新しい順
          </Badge>
          <Badge variant={sortOrder === "budget" ? "default" : "outline"} className="cursor-pointer select-none text-xs transition-colors" onClick={() => setSortOrder("budget")}>
            予算が安い順
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
}
