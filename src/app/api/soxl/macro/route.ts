import { NextResponse } from "next/server";

const YAHOO_HOSTS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

interface TickerSnapshot {
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
}

async function fetchLatestClose(symbol: string): Promise<TickerSnapshot> {
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
      const res = await fetch(url, { headers: HEADERS, next: { revalidate: 300 } });
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter(
        (v: number | null) => v != null
      );
      if (closes.length < 2) continue;

      const price = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      const change = price - prev;
      const changePct = (change / prev) * 100;

      return { symbol, price, change, changePct };
    } catch {
      continue;
    }
  }
  return { symbol, price: null, change: null, changePct: null };
}

async function fetchNews(): Promise<{ title: string; publisher: string; link: string; publishedAt: number }[]> {
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v1/finance/search?q=semiconductor+SOX+SOXL&newsCount=6&type=news`;
      const res = await fetch(url, { headers: HEADERS, next: { revalidate: 600 } });
      if (!res.ok) continue;

      const json = await res.json();
      const items = json?.news ?? [];
      return items.slice(0, 6).map((n: { title: string; publisher: string; link: string; providerPublishTime: number }) => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        publishedAt: n.providerPublishTime * 1000,
      }));
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://edition.cnn.com/",
        },
        next: { revalidate: 600 },
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const score = json?.fear_and_greed?.score;
    const rating = json?.fear_and_greed?.rating;
    if (score == null) return null;
    const labelMap: Record<string, string> = {
      "extreme fear": "極度の恐怖",
      fear: "恐怖",
      neutral: "中立",
      greed: "強欲",
      "extreme greed": "極度の強欲",
    };
    return { value: Math.round(score), label: labelMap[rating?.toLowerCase()] ?? rating };
  } catch {
    return null;
  }
}

function classifyVix(vix: number): {
  level: "low" | "normal" | "elevated" | "high" | "extreme";
  label: string;
  color: string;
  soxlImpact: string;
} {
  if (vix < 15) return { level: "low", label: "低（市場過熱）", color: "#F59E0B", soxlImpact: "天井警戒" };
  if (vix < 20) return { level: "normal", label: "正常", color: "#10B981", soxlImpact: "通常通り" };
  if (vix < 25) return { level: "elevated", label: "やや上昇", color: "#FBBF24", soxlImpact: "慎重に" };
  if (vix < 30) return { level: "high", label: "高（要注意）", color: "#F97316", soxlImpact: "ポジション縮小推奨" };
  if (vix < 40) return { level: "high", label: "非常に高い", color: "#EF4444", soxlImpact: "3倍レバは危険域" };
  return { level: "extreme", label: "恐慌水準", color: "#DC2626", soxlImpact: "エントリー禁止水準" };
}

export async function GET() {
  const [vixData, soxData, ndxData, fearGreed, news] = await Promise.all([
    fetchLatestClose("^VIX"),
    fetchLatestClose("^SOX"),       // Philadelphia Semiconductor Index
    fetchLatestClose("^NDX"),       // NASDAQ 100
    fetchFearGreed(),
    fetchNews(),
  ]);

  const vixClassification = vixData.price
    ? classifyVix(vixData.price)
    : null;

  return NextResponse.json({
    vix: {
      ...vixData,
      classification: vixClassification,
    },
    sox: soxData,
    ndx: ndxData,
    fearGreed,
    news,
    updatedAt: new Date().toISOString(),
  });
}
