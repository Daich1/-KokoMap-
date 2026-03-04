const TOKEN = () => process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** 住所 → 座標（Forward Geocoding） */
export async function forwardGeocode(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(query)}&key=${TOKEN()}&language=ja&region=jp`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return null;
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng };
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
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}&key=${TOKEN()}&language=ja&region=jp`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return null;
    return data.results[0].formatted_address as string;
  } catch {
    return null;
  }
}
