import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref) {
    return new NextResponse(null, { status: 400 });
  }

  // Route Handler(サーバー) から叩くため、サーバー用キーを優先する
  const key =
    process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const url =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=800` +
    `&photo_reference=${encodeURIComponent(ref)}` +
    `&key=${key}`;

  try {
    // fetch はリダイレクトを自動的にたどる
    const res = await fetch(url);
    if (!res.ok) return new NextResponse(null, { status: 404 });

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
