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
 * 距離に応じた移動手段と所要時間を返す
 * ～800m   : 🚶 徒歩  (80m/分)
 * 800m～8km: 🚗 車    (500m/分 ≒ 30km/h)
 * 8km～    : 🚃 電車  (600m/分 ≒ 36km/h)
 * ※直線距離のため実際の所要時間より短めになる場合があります
 */
export function formatDistance(meters: number): string {
  const distLabel =
    meters < 1000
      ? `約${Math.max(10, Math.round(meters / 10) * 10)}m`
      : `約${(meters / 1000).toFixed(1)}km`;

  if (meters < 800) {
    const mins = Math.ceil(meters / 80);
    return `${distLabel}・🚶 ${mins}分`;
  }
  if (meters < 8000) {
    const mins = Math.ceil(meters / 500);
    return `${distLabel}・🚗 約${mins}分`;
  }
  const mins = Math.ceil(meters / 600);
  return `${distLabel}・🚃 約${mins}分`;
}
