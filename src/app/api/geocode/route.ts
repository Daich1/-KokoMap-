import { NextRequest, NextResponse } from "next/server";

// Google Geocoding API のサーバープロキシ
// ?q=<住所>          → { lat, lng } (Forward)
// ?lat=<>&lng=<>     → { address }  (Reverse)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");

  // Route Handler(サーバー) から叩くため、サーバー用キーを優先する
  const key =
    process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const base = `https://maps.googleapis.com/maps/api/geocode/json`;
  let url: string;
  if (q?.trim()) {
    url = `${base}?address=${encodeURIComponent(q)}&key=${key}&language=ja&region=jp`;
  } else if (lat && lng) {
    url = `${base}?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&key=${key}&language=ja&region=jp`;
  } else {
    return NextResponse.json(null, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json(null, { status: 502 });
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json(null, { status: 404 });
    }
    const r = data.results[0];
    if (q?.trim()) {
      const { lat: rLat, lng: rLng } = r.geometry.location;
      return NextResponse.json({ lat: rLat, lng: rLng });
    }
    return NextResponse.json({ address: r.formatted_address as string });
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
