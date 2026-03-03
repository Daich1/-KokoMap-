import { NextResponse } from "next/server";
import { calculateAllIndicators, type OHLCVData } from "@/lib/technical-analysis";
import { generateSignals } from "@/lib/soxl-signals";

const TICKER = "SOXL";

const CHART_HOSTS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchHistory(period: string): Promise<OHLCVData[]> {
  const intervalMap: Record<string, string> = {
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1d",
    "1y": "1d",
    "2y": "1wk",
    "5y": "1wk",
  };
  const interval = intervalMap[period] ?? "1d";

  let lastError: Error | null = null;
  for (const host of CHART_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${TICKER}?interval=${interval}&range=${period}&includePrePost=false`;
      const res = await fetch(url, { headers: FETCH_HEADERS, next: { revalidate: 300 } });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${host}`);
        continue;
      }
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) {
        lastError = new Error("No chart data in response");
        continue;
      }

      const timestamps: number[] = result.timestamp ?? [];
      const q = result.indicators?.quote?.[0] ?? {};
      const opens: number[] = q.open ?? [];
      const highs: number[] = q.high ?? [];
      const lows: number[] = q.low ?? [];
      const closes: number[] = q.close ?? [];
      const volumes: number[] = q.volume ?? [];

      const data: OHLCVData[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (opens[i] == null || highs[i] == null || lows[i] == null || closes[i] == null) continue;
        data.push({
          date: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
          open: opens[i],
          high: highs[i],
          low: lows[i],
          close: closes[i],
          volume: volumes[i] ?? 0,
        });
      }
      return data;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("All Yahoo Finance endpoints failed");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? "1y";

    const rawHistory = await fetchHistory(period);
    if (rawHistory.length === 0) {
      return NextResponse.json({ error: "データ取得失敗" }, { status: 500 });
    }

    const history = calculateAllIndicators(rawHistory);
    const { signals, riskManagement, action } = generateSignals(history);

    const current = history[history.length - 1];
    const prev = history.length >= 2 ? history[history.length - 2] : null;
    const priceChange = prev ? current.close - prev.close : 0;
    const priceChangePct = prev ? (priceChange / prev.close) * 100 : 0;

    const quoteData = {
      price: current.close,
      open: current.open,
      high: current.high,
      low: current.low,
      volume: current.volume,
      priceChange,
      priceChangePct,
      ma50: current.ma50,
      ma200: current.ma200,
      rsi: current.rsi,
      atr: current.atr,
      fiftyTwoWeekHigh: Math.max(...rawHistory.map(d => d.high)),
      fiftyTwoWeekLow: Math.min(...rawHistory.map(d => d.low)),
      marketState: "CLOSED",
    };

    const chartData = history.slice(-365).map(d => ({
      date: d.date,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
      ma20: d.ma20,
      ma50: d.ma50,
      ma200: d.ma200,
      rsi: d.rsi,
      macd: d.macd,
      macdSignal: d.macdSignal,
      macdHist: d.macdHist,
      bbUpper: d.bbUpper,
      bbMiddle: d.bbMiddle,
      bbLower: d.bbLower,
      stochK: d.stochK,
      stochD: d.stochD,
    }));

    return NextResponse.json({
      quote: quoteData,
      chartData,
      signals,
      riskManagement,
      action,
      lastUpdated: new Date().toISOString(),
      ticker: TICKER,
    });
  } catch (error) {
    console.error("SOXL API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
