import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("place_id");
  if (!placeId) {
    return NextResponse.json(null, { status: 400 });
  }

  // Route Handler(サーバー) から叩くため、サーバー用キーを優先する
  const key =
    process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const fields = "name,formatted_address,geometry,photos,website,opening_hours";
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${fields}` +
    `&key=${key}` +
    `&language=ja`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const r = data.result;
    if (!r) return NextResponse.json(null, { status: 404 });

    const photoRefs: string[] = (r.photos ?? [])
      .slice(0, 3)
      .map((p: { photo_reference: string }) => p.photo_reference);

    const businessHours = r.opening_hours
      ? {
          open_now: r.opening_hours.open_now ?? false,
          periods: r.opening_hours.periods ?? [],
          weekday_text: r.opening_hours.weekday_text ?? [],
        }
      : null;

    return NextResponse.json({
      name: r.name ?? null,
      address: r.formatted_address ?? null,
      lat: r.geometry?.location?.lat ?? null,
      lng: r.geometry?.location?.lng ?? null,
      photoRefs,
      website: r.website ?? null,
      businessHours,
    });
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
