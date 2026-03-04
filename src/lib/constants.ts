export const PRESET_CATEGORIES = [
  "食事",
  "飲み",
  "娯楽",
  "観光",
  "カフェ・休憩",
  "買い物",
  "映え・絶景",
  "宿",
  "風呂",
] as const;

export const DURATION_OPTIONS = [
  { value: "1h", label: "1時間" },
  { value: "2-3h", label: "2〜3時間" },
  { value: "half-day", label: "半日" },
  { value: "full-day", label: "1日" },
] as const;

export const DURATION_LABELS: Record<string, string> = {
  "1h": "1時間",
  "2-3h": "2〜3時間",
  "half-day": "半日",
  "full-day": "1日",
};
