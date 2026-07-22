// Google Geocoding はサーバープロキシ（/api/geocode）経由で呼ぶ
// （API キーをブラウザに露出させないため）

/** 住所 → 座標（Forward Geocoding） */
export async function forwardGeocode(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    const data: { lat: number; lng: number } | null = await res.json();
    return data;
  } catch {
    return null;
  }
}

/** 座標 → 住所（Reverse Geocoding） */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
    );
    if (!res.ok) return null;
    const data: { address: string } | null = await res.json();
    return data?.address ?? null;
  } catch {
    return null;
  }
}
