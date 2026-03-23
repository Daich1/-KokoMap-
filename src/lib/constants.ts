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

export const PRESET_MARKER_COLORS = [
  "#F59E0B", // Amber
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#EF4444", // Red
  "#06B6D4", // Cyan
  "#F97316", // Orange
  "#6366F1", // Indigo
  "#14B8A6", // Teal
];

export function getCreatorColor(
  creatorId: string | undefined | null,
  roomMembers: { user_id: string }[]
): string {
  if (!creatorId || !roomMembers || roomMembers.length === 0) {
    return "#E85D04"; // Default primary
  }
  
  // Deterministic mapping based on creation index
  // Avoid changing color constantly as people leave/join by sorting roomMembers by user_id
  const sortedMembers = [...roomMembers].sort((a, b) => a.user_id.localeCompare(b.user_id));
  const idx = sortedMembers.findIndex((m) => m.user_id === creatorId);
  
  if (idx === -1) {
    return "#E85D04";
  }
  
  return PRESET_MARKER_COLORS[idx % PRESET_MARKER_COLORS.length];
}

