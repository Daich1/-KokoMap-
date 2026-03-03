import { NextResponse } from "next/server";

const YAHOO_HOSTS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

// ─── Economic Calendar ────────────────────────────────────────────────────────

function firstFridayOfMonth(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const dow = d.getUTCDay(); // 0=Sun, 5=Fri
  const offset = dow <= 5 ? 5 - dow : 12 - dow;
  d.setUTCDate(1 + offset);
  return d;
}

// FOMC decision dates (2025–2026)
const FOMC_DATES = [
  "2025-09-17", "2025-11-07", "2025-12-10",
  "2026-01-29", "2026-03-19", "2026-04-30",
  "2026-06-18", "2026-07-30", "2026-09-17",
  "2026-10-29", "2026-12-10",
];

function buildEconomicCalendar(): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const now = new Date();
  const cutoff = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days ahead

  // NFP: first Friday of each month, for the past month + next 3 months
  for (let offset = -1; offset <= 3; offset++) {
    const refDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const nfpDate = firstFridayOfMonth(refDate.getFullYear(), refDate.getMonth() + 1);
    if (nfpDate >= new Date(now.getTime() - 7 * 86400000) && nfpDate <= cutoff) {
      events.push({
        id: `nfp-${nfpDate.toISOString().slice(0, 10)}`,
        name: "雇用統計（NFP）",
        nameEn: "Non-Farm Payrolls",
        date: nfpDate.toISOString().slice(0, 10),
        importance: "high",
        category: "economic",
        impact: "強い結果 → 利上げ懸念で半導体売り圧力。弱い結果 → 利下げ期待で上昇しやすい",
        strategy: "発表前後24時間はポジション縮小推奨",
      });
    }

    // CPI: approx 10th–13th (use 12th as estimate)
    const cpiDate = new Date(Date.UTC(refDate.getFullYear(), refDate.getMonth() + 1, 12));
    if (cpiDate >= new Date(now.getTime() - 7 * 86400000) && cpiDate <= cutoff) {
      events.push({
        id: `cpi-${cpiDate.toISOString().slice(0, 10)}`,
        name: "CPI（消費者物価指数）",
        nameEn: "Consumer Price Index",
        date: cpiDate.toISOString().slice(0, 10),
        importance: "high",
        category: "economic",
        impact: "高インフレ → 利上げ懸念で売り。低インフレ → 利下げ期待で買い",
        strategy: "発表前後は乱高下注意",
      });
    }
  }

  // FOMC
  for (const dateStr of FOMC_DATES) {
    const d = new Date(dateStr + "T00:00:00Z");
    if (d >= new Date(now.getTime() - 7 * 86400000) && d <= cutoff) {
      events.push({
        id: `fomc-${dateStr}`,
        name: "FOMC政策金利決定",
        nameEn: "FOMC Rate Decision",
        date: dateStr,
        importance: "high",
        category: "economic",
        impact: "利上げ → 半導体株に下落圧力。据え置き/利下げ → 上昇しやすい",
        strategy: "声明文と会見次第で急騰・急落。発表前はポジション注意",
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Earnings Calendar ────────────────────────────────────────────────────────

async function fetchEarningsDate(symbol: string): Promise<string | null> {
  // Try Yahoo Finance first
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v10/finance/quoteSummary/${symbol}?modules=calendarEvents`;
      const res = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } });
      if (!res.ok) continue;
      const json = await res.json();
      const dates: { raw: number }[] =
        json?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate ?? [];
      if (dates.length === 0) continue;
      const now = Date.now();
      const upcoming = dates
        .map((d) => d.raw * 1000)
        .filter((ts) => ts > now - 86400000 * 3)
        .sort((a, b) => a - b);
      if (upcoming.length > 0) return new Date(upcoming[0]).toISOString().slice(0, 10);
    } catch {
      continue;
    }
  }
  // Fallback: estimate from historical reporting pattern
  return estimateEarningsDate(symbol);
}

// Estimate earnings dates based on historical patterns.
// These are approximate but reliable enough for strategy context.
function estimateEarningsDate(symbol: string): string | null {
  const today = new Date();
  const y = today.getFullYear();

  // Helper: last Nth weekday of a month
  function lastWeekday(year: number, month: number, weekday: number): Date {
    const d = new Date(Date.UTC(year, month, 0)); // last day of month
    while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }
  // Helper: Nth weekday of month
  function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
    const d = new Date(Date.UTC(year, month - 1, 1));
    let count = 0;
    while (count < nth) {
      if (d.getUTCDay() === weekday) count++;
      if (count < nth) d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
  }

  let candidates: Date[] = [];

  if (symbol === "NVDA") {
    // Q4: last Wed of Feb, Q1: last Wed of May, Q2: last Wed of Aug, Q3: 3rd Wed of Nov
    candidates = [
      lastWeekday(y - 1, 11, 3), // last Wed of Nov previous year
      lastWeekday(y, 2, 3),      // last Wed of Feb
      lastWeekday(y, 5, 3),      // last Wed of May
      lastWeekday(y, 8, 3),      // last Wed of Aug
      lastWeekday(y, 11, 3),     // last Wed of Nov
      lastWeekday(y + 1, 2, 3),  // last Wed of Feb next year
    ];
  } else if (symbol === "AMD") {
    // Q4: last Tue of Jan, Q1: last Tue of Apr, Q2: last Tue of Jul, Q3: last Tue of Oct
    candidates = [
      lastWeekday(y - 1, 10, 2),
      lastWeekday(y, 1, 2),
      lastWeekday(y, 4, 2),
      lastWeekday(y, 7, 2),
      lastWeekday(y, 10, 2),
      lastWeekday(y + 1, 1, 2),
    ];
  } else if (symbol === "MU") {
    // Fiscal year ends Aug. Reports ~3rd Wed of Dec, Mar, Jun, Sep
    candidates = [
      nthWeekday(y - 1, 12, 3, 3),
      nthWeekday(y, 3, 3, 3),   // March
      nthWeekday(y, 6, 3, 3),   // June
      nthWeekday(y, 9, 3, 3),   // September
      nthWeekday(y, 12, 3, 3),  // December
      nthWeekday(y + 1, 3, 3, 3),
    ];
  } else {
    return null;
  }

  // Find the nearest upcoming (allow up to 3 days past)
  const threshold = new Date(today.getTime() - 86400000 * 3);
  const upcoming = candidates
    .filter((d) => d >= threshold)
    .sort((a, b) => a.getTime() - b.getTime());

  if (upcoming.length === 0) return null;
  return upcoming[0].toISOString().slice(0, 10);
}

// ─── Strategy logic ───────────────────────────────────────────────────────────

export interface EarningsEvent {
  symbol: string;
  name: string;
  date: string;
  daysUntil: number;
  phase: "far" | "accumulate" | "runup" | "sell_zone" | "imminent" | "passed";
  phaseLabel: string;
  phaseColor: string;
  strategy: string;
}

export interface EconomicEvent {
  id: string;
  name: string;
  nameEn: string;
  date: string;
  importance: "high" | "medium" | "low";
  category: "economic" | "earnings";
  impact: string;
  strategy: string;
}

function classifyEarningsPhase(daysUntil: number, symbol: string): Pick<EarningsEvent, "phase" | "phaseLabel" | "phaseColor" | "strategy"> {
  if (daysUntil < -3) {
    return {
      phase: "passed",
      phaseLabel: "決算通過",
      phaseColor: "#6B7280",
      strategy: "決算反応を確認してから次の判断",
    };
  }
  if (daysUntil <= 0) {
    return {
      phase: "imminent",
      phaseLabel: "決算当日！",
      phaseColor: "#EF4444",
      strategy: `${symbol}決算日。ポジション保有は高リスク。決算前に利確を`,
    };
  }
  if (daysUntil <= 3) {
    return {
      phase: "sell_zone",
      phaseLabel: "利確推奨ゾーン",
      phaseColor: "#F97316",
      strategy: `あと${daysUntil}日で${symbol}決算。「期待で買い、事実で売り」。今日〜明日中に利確が定石`,
    };
  }
  if (daysUntil <= 10) {
    return {
      phase: "runup",
      phaseLabel: "プレアーニングス上昇期",
      phaseColor: "#F59E0B",
      strategy: `${symbol}決算まで${daysUntil}日。期待感で株価が上がりやすい局面。決算3日前には利確を計画`,
    };
  }
  if (daysUntil <= 28) {
    return {
      phase: "accumulate",
      phaseLabel: "仕込みウィンドウ",
      phaseColor: "#10B981",
      strategy: `${symbol}決算まで${daysUntil}日。プレアーニングス戦略の仕込み期間。テクニカルが合えばエントリー検討`,
    };
  }
  return {
    phase: "far",
    phaseLabel: "決算遠い",
    phaseColor: "#6B7280",
    strategy: `${symbol}決算まで${daysUntil}日。まだ先のため通常のテクニカル判断で`,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [nvdaDate, amdDate, muDate] = await Promise.all([
    fetchEarningsDate("NVDA"),
    fetchEarningsDate("AMD"),
    fetchEarningsDate("MU"),
  ]);

  function toEarningsEvent(symbol: string, name: string, date: string | null): EarningsEvent | null {
    if (!date) return null;
    const daysUntil = Math.round((new Date(date).getTime() - new Date(todayStr).getTime()) / 86400000);
    if (daysUntil < -14) return null; // skip if too far past
    const phase = classifyEarningsPhase(daysUntil, symbol);
    return { symbol, name, date, daysUntil, ...phase };
  }

  const earnings = [
    toEarningsEvent("NVDA", "NVIDIA", nvdaDate),
    toEarningsEvent("AMD", "AMD", amdDate),
    toEarningsEvent("MU", "Micron", muDate),
  ].filter((e): e is EarningsEvent => e !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const economic = buildEconomicCalendar();

  // Compute days until for each economic event
  const economicWithDays = economic.map((e) => ({
    ...e,
    daysUntil: Math.round((new Date(e.date).getTime() - new Date(todayStr).getTime()) / 86400000),
  }));

  // Nearest high-impact events
  const nearestEconomic = economicWithDays.filter((e) => e.daysUntil >= -1).slice(0, 5);

  return NextResponse.json({
    earnings,
    economic: nearestEconomic,
    updatedAt: new Date().toISOString(),
  });
}
