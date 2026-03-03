import { NextResponse } from "next/server";
import { calculateAllIndicators, type OHLCVData } from "@/lib/technical-analysis";
import { generateSignals, generateActionRecommendation, type EventContext } from "@/lib/soxl-signals";

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

async function fetchEventContext(): Promise<EventContext | null> {
  try {
    function estimateEarningsDate(symbol: string): string | null {
      const today = new Date();
      const y = today.getFullYear();
      function lastWeekday(year: number, month: number, weekday: number): Date {
        const d = new Date(Date.UTC(year, month, 0));
        while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
        return d;
      }
      function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
        const d = new Date(Date.UTC(year, month - 1, 1));
        let count = 0;
        while (count < nth) { if (d.getUTCDay() === weekday) count++; if (count < nth) d.setUTCDate(d.getUTCDate() + 1); }
        return d;
      }
      let candidates: Date[] = [];
      if (symbol === "NVDA") {
        candidates = [lastWeekday(y,2,3),lastWeekday(y,5,3),lastWeekday(y,8,3),lastWeekday(y,11,3),lastWeekday(y+1,2,3)];
      } else if (symbol === "MU") {
        candidates = [nthWeekday(y,3,3,3),nthWeekday(y,6,3,3),nthWeekday(y,9,3,3),nthWeekday(y,12,3,3),nthWeekday(y+1,3,3,3)];
      }
      const threshold = new Date(today.getTime() - 86400000 * 3);
      const upcoming = candidates.filter(d => d >= threshold).sort((a,b) => a.getTime()-b.getTime());
      return upcoming.length > 0 ? upcoming[0].toISOString().slice(0,10) : null;
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    // Check all major semiconductor earnings; pick the most strategically relevant one
    const symbols = ["NVDA", "MU", "AMD"];
    let earningsPhase: EventContext["earningsPhase"] = "far";
    let earningsDaysUntil = 999;
    let earningsSymbol = "NVDA";

    const phasePriority: Record<string, number> = {
      imminent: 0, sell_zone: 1, runup: 2, accumulate: 3, far: 4, passed: 5,
    };

    for (const sym of symbols) {
      const date = estimateEarningsDate(sym);
      if (!date) continue;
      const days = Math.round((new Date(date).getTime() - new Date(todayStr).getTime()) / 86400000);
      let phase: EventContext["earningsPhase"] = "far";
      if (days < -14) phase = "passed";
      else if (days <= 0) phase = "imminent";
      else if (days <= 3) phase = "sell_zone";
      else if (days <= 10) phase = "runup";
      else if (days <= 28) phase = "accumulate";
      else phase = "far";

      // Pick the most urgent/relevant (lower priority number wins)
      if (phasePriority[phase] < phasePriority[earningsPhase]) {
        earningsPhase = phase;
        earningsDaysUntil = days;
        earningsSymbol = sym;
      }
    }

    // Nearest major economic event (NFP: first Friday)
    function firstFriday(year: number, month: number): Date {
      const d = new Date(Date.UTC(year, month - 1, 1));
      const dow = d.getUTCDay();
      d.setUTCDate(1 + (dow <= 5 ? 5 - dow : 12 - dow));
      return d;
    }
    const today = new Date();
    let nearEconomicEvent: string | undefined;
    let nearEconomicDays: number | undefined;

    const candidates: { name: string; date: Date }[] = [];
    for (let i = 0; i <= 2; i++) {
      const m = new Date(today.getFullYear(), today.getMonth() + i, 1);
      candidates.push({ name: "雇用統計（NFP）", date: firstFriday(m.getFullYear(), m.getMonth() + 1) });
      candidates.push({ name: "CPI発表", date: new Date(Date.UTC(m.getFullYear(), m.getMonth() + 1, 12)) });
    }
    const FOMC = ["2026-03-19","2026-04-30","2026-06-18","2026-07-30","2026-09-17","2026-10-29","2026-12-10"];
    FOMC.forEach(d => candidates.push({ name: "FOMC", date: new Date(d + "T00:00:00Z") }));

    const upcoming = candidates
      .map(c => ({ ...c, days: Math.round((c.date.getTime() - today.getTime()) / 86400000) }))
      .filter(c => c.days >= -1 && c.days <= 7)
      .sort((a, b) => a.days - b.days);

    if (upcoming.length > 0) {
      nearEconomicEvent = upcoming[0].name;
      nearEconomicDays = upcoming[0].days;
    }

    return { earningsPhase, earningsSymbol, earningsDaysUntil, nearEconomicEvent, nearEconomicDays };
  } catch {
    return null;
  }
}

async function fetchVix(): Promise<number | null> {
  for (const host of CHART_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/%5EVIX?interval=1d&range=5d`;
      const res = await fetch(url, { headers: FETCH_HEADERS, next: { revalidate: 300 } });
      if (!res.ok) continue;
      const json = await res.json();
      const closes: number[] = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [])
        .filter((v: number | null) => v != null);
      if (closes.length === 0) continue;
      return closes[closes.length - 1];
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? "1y";

    const [rawHistory, vix, eventCtx] = await Promise.all([
      fetchHistory(period),
      fetchVix(),
      fetchEventContext(),
    ]);

    if (rawHistory.length === 0) {
      return NextResponse.json({ error: "データ取得失敗" }, { status: 500 });
    }

    const history = calculateAllIndicators(rawHistory);
    const { signals, riskManagement } = generateSignals(history);
    const current = history[history.length - 1];
    // Rebuild action with VIX + events
    const action = generateActionRecommendation(signals, current, riskManagement, vix, eventCtx);

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
      vix,
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
