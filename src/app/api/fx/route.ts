import { NextResponse } from "next/server";

const CHART_HOSTS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

export async function GET() {
  for (const host of CHART_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/USDJPY%3DX?interval=1d&range=5d`;
      const res = await fetch(url, { headers: FETCH_HEADERS, next: { revalidate: 300 } });
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
      const validCloses = closes.filter((v) => v != null);
      if (validCloses.length === 0) continue;

      const rate = validCloses[validCloses.length - 1];
      return NextResponse.json({ rate, updatedAt: new Date().toISOString() });
    } catch {
      continue;
    }
  }

  // Fallback to a reasonable default if all endpoints fail
  return NextResponse.json({ rate: 150, updatedAt: new Date().toISOString(), fallback: true });
}
