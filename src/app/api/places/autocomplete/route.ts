import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get("input");
  if (!input?.trim()) {
    return NextResponse.json([]);
  }

  // Route Handler(サーバー) から叩くため、サーバー用キーを優先する
  const key =
    process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const url =
    `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
    `?input=${encodeURIComponent(input)}` +
    `&key=${key}` +
    `&language=ja` +
    `&components=country:jp`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return NextResponse.json(data.predictions ?? []);
  } catch {
    return NextResponse.json([]);
  }
}
