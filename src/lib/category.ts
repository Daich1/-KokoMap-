const CATEGORY_CLASS: Record<string, string> = {
  "食事":        "badge-food",
  "飲み":        "badge-drink",
  "娯楽":        "badge-entertainment",
  "観光":        "badge-sightseeing",
  "カフェ・休憩": "badge-cafe",
  "買い物":      "badge-shopping",
  "映え・絶景":  "badge-scenery",
  "宿":          "badge-stay",
  "風呂":        "badge-bath",
};

export function getCategoryClass(cat: string): string {
  return CATEGORY_CLASS[cat] ?? "";
}
