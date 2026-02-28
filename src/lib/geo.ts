/**
 * Haversine 公式で2点間の距離（メートル）を計算
 */
export function calcDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // 地球半径 (m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 距離を「約350m（徒歩5分）」形式の文字列に変換
 * 徒歩速度: 80m/分
 */
export function formatDistance(meters: number): string {
  const walkMinutes = Math.ceil(meters / 80);
  if (meters < 1000) {
    const rounded = Math.max(10, Math.round(meters / 10) * 10);
    return `約${rounded}m（徒歩${walkMinutes}分）`;
  }
  return `約${(meters / 1000).toFixed(1)}km（徒歩${walkMinutes}分）`;
}
