"use client";

import { Utensils, Wine, Gamepad2, Landmark, Coffee, ShoppingBag, Camera, BedDouble, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESET_CATEGORIES } from "@/lib/constants";

// ── カテゴリアイコンマッピング ──────────────────────────────────────
export const CATEGORY_ICONS = {
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

interface CategoryBarProps {
  variant: "desktop" | "mobile";
  selectedCategories: string[];
  onToggle: (cat: string) => void;
  onClear: () => void;
}

// ── カテゴリチップの横スクロールバー（PCヘッダー / モバイルドロワー共通）──
export function CategoryBar({ variant, selectedCategories, onToggle, onClear }: CategoryBarProps) {
  const isDesktop = variant === "desktop";
  const chipClass = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-full font-medium border transition-all shrink-0 cursor-pointer",
      isDesktop ? "px-4 py-1.5 text-sm" : "px-3 min-h-[40px] text-xs snap-center",
      active
        ? "bg-primary text-primary-foreground border-primary hover:opacity-80"
        : "text-muted-foreground border-transparent hover:border-border hover:text-foreground hover:bg-muted/50"
    );

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        className={chipClass(selectedCategories.length === 0)}
      >
        すべて
      </button>
      {PRESET_CATEGORIES.map((cat) => {
        const Icon = CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS];
        return (
          <button
            key={cat}
            onClick={(e) => { e.stopPropagation(); onToggle(cat); }}
            className={chipClass(selectedCategories.includes(cat))}
          >
            <Icon className={isDesktop ? "size-4" : "size-3.5"} />
            {cat}
          </button>
        );
      })}
    </>
  );
}
