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
    // resolveOnly=true の場合: 画像バイナリをプロキシせず実URLのみを返す
    // → スポット保存時に1回だけ呼び出し、その後はDBに保存された実URLを直接使う（課金ゼロ）
    if (req.nextUrl.searchParams.get("resolveOnly") === "true") {
      const res = await fetch(url, { redirect: "manual" });
      // Google Places Photo API はリダイレクトで実URLを返す
      const location = res.headers.get("location");
      if (!location) return NextResponse.json({ url: null }, { status: 404 });
      return NextResponse.json(
        { url: location },
        {
          headers: {
            // レスポンス自体はキャッシュ不要（一度だけ呼ばれるため）
            "Cache-Control": "no-store",
          },
        }
      );
    }

    // 通常モード: 画像バイナリをプロキシ（既存DBに保存済みのスポット向け後方互換）
    const res = await fetch(url);
    if (!res.ok) return new NextResponse(null, { status: 404 });

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        // 長期キャッシュ: Vercel CDN + ブラウザでキャッシュし再呼び出しを抑制
        "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
