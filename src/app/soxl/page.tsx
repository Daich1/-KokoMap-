"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Bell,
  BellOff,
  Settings,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  BarChart2,
  Activity,
  Wallet,
  Calculator,
} from "lucide-react";

const PriceChart = dynamic(
  () => import("@/components/soxl/PriceChart").then((m) => m.PriceChart),
  { ssr: false }
);
const RSIChart = dynamic(
  () => import("@/components/soxl/IndicatorCharts").then((m) => m.RSIChart),
  { ssr: false }
);
const MACDChart = dynamic(
  () => import("@/components/soxl/IndicatorCharts").then((m) => m.MACDChart),
  { ssr: false }
);
const VolumeChart = dynamic(
  () => import("@/components/soxl/IndicatorCharts").then((m) => m.VolumeChart),
  { ssr: false }
);

type Period = "3mo" | "6mo" | "1y" | "2y";

interface SOXLData {
  quote: {
    price: number;
    priceChange: number;
    priceChangePct: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    ma50: number | null;
    ma200: number | null;
    rsi: number | null;
    atr: number | null;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    marketState: string;
  };
  chartData: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    ma20: number | null;
    ma50: number | null;
    ma200: number | null;
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHist: number | null;
    bbUpper: number | null;
    bbMiddle: number | null;
    bbLower: number | null;
    stochK: number | null;
    stochD: number | null;
  }[];
  signals: {
    overall: string;
    overallLabel: string;
    score: number;
    maxScore: number;
    scorePct: number;
    color: string;
    bgColor: string;
    details: {
      name: string;
      nameJa: string;
      signal: "BUY" | "SELL" | "NEUTRAL";
      strength: number;
      description: string;
      value: number | null;
    }[];
  };
  riskManagement: {
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    riskRewardRatio1: number;
    riskRewardRatio2: number;
    atr: number;
    suggestedPositionNote: string;
  };
  lastUpdated: string;
}

function SignalBadge({ signal, strength }: { signal: "BUY" | "SELL" | "NEUTRAL"; strength: number }) {
  if (signal === "BUY") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-900/60 text-emerald-400 border border-emerald-700">
        <TrendingUp size={10} /> 買い {strength > 0 ? `+${strength}` : strength}
      </span>
    );
  }
  if (signal === "SELL") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-900/60 text-red-400 border border-red-700">
        <TrendingDown size={10} /> 売り {strength}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-700/60 text-gray-400 border border-gray-600">
      <Minus size={10} /> 中立
    </span>
  );
}

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? ((score + maxScore) / (2 * maxScore)) * 100 : 50;
  const clampedPct = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative w-full h-3 bg-gray-800 rounded-full overflow-hidden">
      <div className="absolute inset-0 flex">
        <div className="w-1/2 h-full bg-gradient-to-r from-red-600 to-yellow-500" />
        <div className="w-1/2 h-full bg-gradient-to-r from-yellow-500 to-emerald-500" />
      </div>
      <div
        className="absolute top-0 h-full w-1 bg-white rounded-full shadow-lg transition-all duration-500"
        style={{ left: `calc(${clampedPct}% - 2px)` }}
      />
    </div>
  );
}

export default function SOXLDashboard() {
  const [data, setData] = useState<SOXLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("1y");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(300); // seconds
  const [countdown, setCountdown] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showChartOptions, setShowChartOptions] = useState(false);
  const [lineToken, setLineToken] = useState("");
  const [lastNotifiedSignal, setLastNotifiedSignal] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const [chartOptions, setChartOptions] = useState({
    showMA20: true,
    showMA50: true,
    showMA200: true,
    showBB: true,
  });
  const [capitalJPY, setCapitalJPY] = useState(300000);
  const [usdJpy, setUsdJpy] = useState(150);
  const [usdJpyLoading, setUsdJpyLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/fx")
      .then(r => r.json())
      .then(d => { if (d.rate) setUsdJpy(d.rate); })
      .catch(() => {})
      .finally(() => setUsdJpyLoading(false));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/soxl?period=${period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SOXLData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "データ取得エラー");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (autoRefresh) {
      setCountdown(refreshInterval);
      intervalRef.current = setInterval(() => {
        fetchData();
        setCountdown(refreshInterval);
      }, refreshInterval * 1000);

      countdownRef.current = setInterval(() => {
        setCountdown(prev => (prev > 0 ? prev - 1 : refreshInterval));
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, refreshInterval, fetchData]);

  // Auto LINE notification when signal changes
  useEffect(() => {
    if (!data || !lineToken) return;
    const currentSignal = data.signals.overall;
    if (lastNotifiedSignal !== null && lastNotifiedSignal !== currentSignal) {
      sendLineNotification(data);
    }
    setLastNotifiedSignal(currentSignal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.signals.overall]);

  const sendLineNotification = async (d: SOXLData) => {
    if (!lineToken) return;
    const msg = `\n【SOXL 自動分析】\n現在価格: $${d.quote.price.toFixed(2)} (${d.quote.priceChangePct > 0 ? "+" : ""}${d.quote.priceChangePct.toFixed(2)}%)\nシグナル: ${d.signals.overallLabel}（スコア: ${d.signals.score > 0 ? "+" : ""}${d.signals.score}）\nRSI: ${d.quote.rsi?.toFixed(1) ?? "N/A"}\n更新: ${new Date(d.lastUpdated).toLocaleString("ja-JP")}`;
    try {
      const res = await fetch("/api/soxl/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: lineToken, message: msg }),
      });
      if (res.ok) setNotifStatus("LINE通知を送信しました");
      else setNotifStatus("LINE通知に失敗しました");
      setTimeout(() => setNotifStatus(null), 4000);
    } catch {
      setNotifStatus("LINE通知エラー");
    }
  };

  const testLineNotification = async () => {
    if (!data) return;
    await sendLineNotification(data);
  };

  const formatJST = (iso: string) => {
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) + " JST";
  };

  const getSignalIcon = (overall: string) => {
    if (overall.includes("BUY")) return <TrendingUp className="text-emerald-400" size={24} />;
    if (overall.includes("SELL")) return <TrendingDown className="text-red-400" size={24} />;
    return <Minus className="text-yellow-400" size={24} />;
  };

  const getOverallBg = (overall: string) => {
    if (overall.includes("BUY")) return "from-emerald-900/40 to-emerald-800/20 border-emerald-700/50";
    if (overall.includes("SELL")) return "from-red-900/40 to-red-800/20 border-red-700/50";
    return "from-yellow-900/30 to-yellow-800/10 border-yellow-700/50";
  };

  const getRSIColor = (rsi: number | null) => {
    if (rsi === null) return "text-gray-400";
    if (rsi < 30) return "text-emerald-400";
    if (rsi > 70) return "text-red-400";
    return "text-blue-400";
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AlertTriangle className="text-red-500 mx-auto" size={48} />
          <p className="text-red-400 text-lg font-medium">データ取得エラー</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <button
            onClick={fetchData}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="text-blue-400" size={20} />
              <span className="font-bold text-white text-lg">SOXL</span>
              <span className="text-gray-400 text-sm hidden sm:inline">分析ダッシュボード</span>
            </div>
            {data && (
              <div className="hidden md:flex items-center gap-1 text-xs text-gray-500">
                <span>更新: {formatJST(data.lastUpdated)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
              {(["3mo", "6mo", "1y", "2y"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    period === p
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Auto refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                autoRefresh
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              <RefreshCw size={12} className={autoRefresh && loading ? "animate-spin" : ""} />
              {autoRefresh ? `${countdown}s` : "自動更新"}
            </button>

            {/* Manual refresh */}
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg transition-colors ${showSettings ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="border-t border-gray-800 bg-gray-900 px-4 py-3">
            <div className="max-w-7xl mx-auto flex flex-wrap gap-6">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">自動更新間隔</p>
                <div className="flex gap-1">
                  {[60, 300, 600, 1800].map(sec => (
                    <button
                      key={sec}
                      onClick={() => setRefreshInterval(sec)}
                      className={`px-2 py-1 rounded text-xs transition-colors ${
                        refreshInterval === sec ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                      }`}
                    >
                      {sec >= 60 ? `${sec / 60}分` : `${sec}秒`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">LINE通知トークン</p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={lineToken}
                    onChange={(e) => setLineToken(e.target.value)}
                    placeholder="LINE Notify トークン"
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-52 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={testLineNotification}
                    disabled={!lineToken || !data}
                    className="flex items-center gap-1 px-2 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded disabled:opacity-50 transition-colors"
                  >
                    <Bell size={10} /> テスト
                  </button>
                  {lineToken ? (
                    <Bell className="text-green-400 self-center" size={14} />
                  ) : (
                    <BellOff className="text-gray-600 self-center" size={14} />
                  )}
                </div>
                {notifStatus && <p className="text-xs text-blue-400">{notifStatus}</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="max-w-7xl mx-auto px-4 py-16 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">SOXLデータを取得中...</p>
        </div>
      ) : data ? (
        <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">

          {/* Price & Signal Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Price card */}
            <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-bold font-mono tabular-nums">
                      ${data.quote.price.toFixed(2)}
                    </span>
                    <span className={`text-xl font-semibold ${data.quote.priceChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {data.quote.priceChange >= 0 ? "+" : ""}{data.quote.priceChange.toFixed(2)}
                      {" "}
                      ({data.quote.priceChangePct >= 0 ? "+" : ""}{data.quote.priceChangePct.toFixed(2)}%)
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    SOXL — Direxion Daily Semiconductor Bull 3X
                    {data.quote.marketState !== "REGULAR" && (
                      <span className="ml-2 text-xs text-yellow-500">({data.quote.marketState})</span>
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">始値</p>
                    <p className="font-mono font-medium">${data.quote.open.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">高値</p>
                    <p className="font-mono font-medium text-emerald-400">${data.quote.high.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">安値</p>
                    <p className="font-mono font-medium text-red-400">${data.quote.low.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">出来高</p>
                    <p className="font-mono font-medium">
                      {data.quote.volume >= 1_000_000
                        ? `${(data.quote.volume / 1_000_000).toFixed(1)}M`
                        : `${(data.quote.volume / 1_000).toFixed(0)}K`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">RSI (14)</p>
                  <p className={`text-xl font-bold font-mono ${getRSIColor(data.quote.rsi)}`}>
                    {data.quote.rsi?.toFixed(1) ?? "N/A"}
                  </p>
                  <p className="text-xs text-gray-600">
                    {data.quote.rsi
                      ? data.quote.rsi < 30
                        ? "売られすぎ"
                        : data.quote.rsi > 70
                        ? "買われすぎ"
                        : "中立"
                      : ""}
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">MA50</p>
                  <p className="text-xl font-bold font-mono text-blue-400">
                    {data.quote.ma50 ? `$${data.quote.ma50.toFixed(2)}` : "N/A"}
                  </p>
                  <p className="text-xs text-gray-600">
                    {data.quote.ma50
                      ? data.quote.price > data.quote.ma50
                        ? "↑ 上回り"
                        : "↓ 下回り"
                      : ""}
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">MA200</p>
                  <p className="text-xl font-bold font-mono text-red-400">
                    {data.quote.ma200 ? `$${data.quote.ma200.toFixed(2)}` : "N/A"}
                  </p>
                  <p className="text-xs text-gray-600">
                    {data.quote.ma200
                      ? data.quote.price > data.quote.ma200
                        ? "↑ 上回り"
                        : "↓ 下回り"
                      : ""}
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">ATR (14)</p>
                  <p className="text-xl font-bold font-mono text-purple-400">
                    {data.quote.atr ? `$${data.quote.atr.toFixed(2)}` : "N/A"}
                  </p>
                  <p className="text-xs text-gray-600">
                    {data.quote.atr
                      ? `±${((data.quote.atr / data.quote.price) * 100).toFixed(1)}%`
                      : ""}
                  </p>
                </div>
              </div>

              {/* 52-week range */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>52週安値 ${data.quote.fiftyTwoWeekLow.toFixed(2)}</span>
                  <span>52週高値 ${data.quote.fiftyTwoWeekHigh.toFixed(2)}</span>
                </div>
                <div className="relative h-2 bg-gray-800 rounded-full">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        ((data.quote.price - data.quote.fiftyTwoWeekLow) /
                          (data.quote.fiftyTwoWeekHigh - data.quote.fiftyTwoWeekLow)) *
                          100
                      )}%`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-blue-500"
                    style={{
                      left: `calc(${Math.min(
                        100,
                        ((data.quote.price - data.quote.fiftyTwoWeekLow) /
                          (data.quote.fiftyTwoWeekHigh - data.quote.fiftyTwoWeekLow)) *
                          100
                      )}% - 6px)`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Signal card */}
            <div className={`bg-gradient-to-br ${getOverallBg(data.signals.overall)} rounded-xl border p-5 flex flex-col gap-4`}>
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-gray-400" />
                <span className="text-sm text-gray-400 font-medium">総合シグナル</span>
              </div>

              <div className="flex items-center gap-3">
                {getSignalIcon(data.signals.overall)}
                <div>
                  <p
                    className="text-3xl font-black"
                    style={{ color: data.signals.color }}
                  >
                    {data.signals.overallLabel}
                  </p>
                  <p className="text-gray-400 text-sm">
                    スコア: {data.signals.score > 0 ? "+" : ""}{data.signals.score} / {data.signals.maxScore}
                  </p>
                </div>
              </div>

              <ScoreBar score={data.signals.score} maxScore={data.signals.maxScore} />
              <div className="flex justify-between text-xs text-gray-600">
                <span>SELL</span>
                <span>NEUTRAL</span>
                <span>BUY</span>
              </div>

              <div className="space-y-2">
                {data.signals.details.map((sig) => (
                  <div key={sig.name} className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 font-medium">{sig.nameJa}</p>
                      <p className="text-xs text-gray-600 truncate">{sig.description}</p>
                    </div>
                    <SignalBadge signal={sig.signal} strength={sig.strength} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Price Chart */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-white">価格チャート</h2>
                <span className="text-xs text-gray-500">({period})</span>
              </div>
              <button
                onClick={() => setShowChartOptions(!showChartOptions)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                表示オプション {showChartOptions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {showChartOptions && (
              <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-gray-800">
                {Object.entries(chartOptions).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => setChartOptions(prev => ({ ...prev, [key]: !val }))}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      val ? "bg-blue-700 text-white" : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {key === "showMA20" ? "MA20" : key === "showMA50" ? "MA50" : key === "showMA200" ? "MA200" : "BB"}
                  </button>
                ))}
              </div>
            )}

            <PriceChart
              data={data.chartData}
              showMA20={chartOptions.showMA20}
              showMA50={chartOptions.showMA50}
              showMA200={chartOptions.showMA200}
              showBB={chartOptions.showBB}
            />

            {/* Volume */}
            <div className="mt-2">
              <p className="text-xs text-gray-600 mb-1">出来高</p>
              <VolumeChart data={data.chartData} />
            </div>
          </div>

          {/* RSI & MACD */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-white text-sm">RSI (14)</h2>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" />過買 70</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-400 inline-block" />過売 30</span>
                </div>
              </div>
              <RSIChart data={data.chartData} />
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-white text-sm">MACD (12,26,9)</h2>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block" />MACD</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block" />シグナル</span>
                </div>
              </div>
              <MACDChart data={data.chartData} />
            </div>
          </div>

          {/* Risk Management */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="text-yellow-500" size={18} />
              <h2 className="font-semibold text-white">リスク管理パネル（参考値）</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 col-span-1">
                <p className="text-xs text-gray-500">現在値（エントリー参考）</p>
                <p className="text-lg font-bold font-mono text-white">
                  ${data.riskManagement.entryPrice.toFixed(2)}
                </p>
              </div>
              <div className="bg-red-900/30 rounded-lg p-3 border border-red-800/50">
                <p className="text-xs text-red-400">損切りライン (ATR×2)</p>
                <p className="text-lg font-bold font-mono text-red-400">
                  ${data.riskManagement.stopLoss.toFixed(2)}
                </p>
                <p className="text-xs text-red-600">
                  -{((data.riskManagement.entryPrice - data.riskManagement.stopLoss) / data.riskManagement.entryPrice * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-emerald-900/30 rounded-lg p-3 border border-emerald-800/50">
                <p className="text-xs text-emerald-400">利確① (ATR×2.5)</p>
                <p className="text-lg font-bold font-mono text-emerald-400">
                  ${data.riskManagement.takeProfit1.toFixed(2)}
                </p>
                <p className="text-xs text-emerald-600">
                  +{((data.riskManagement.takeProfit1 - data.riskManagement.entryPrice) / data.riskManagement.entryPrice * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-emerald-900/20 rounded-lg p-3 border border-emerald-800/30">
                <p className="text-xs text-emerald-300">利確② (ATR×4)</p>
                <p className="text-lg font-bold font-mono text-emerald-300">
                  ${data.riskManagement.takeProfit2.toFixed(2)}
                </p>
                <p className="text-xs text-emerald-700">
                  +{((data.riskManagement.takeProfit2 - data.riskManagement.entryPrice) / data.riskManagement.entryPrice * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">RR比① </p>
                <p className="text-lg font-bold font-mono text-purple-400">
                  1:{data.riskManagement.riskRewardRatio1.toFixed(1)}
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">ATR (14)</p>
                <p className="text-lg font-bold font-mono text-purple-400">
                  ${data.riskManagement.atr.toFixed(2)}
                </p>
                <p className="text-xs text-gray-600">日次変動幅目安</p>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-800/40 rounded-lg p-3">
              <AlertTriangle className="text-yellow-500 flex-shrink-0 mt-0.5" size={14} />
              <p className="text-xs text-yellow-600">
                {data.riskManagement.suggestedPositionNote}
                {" "}SOXLは3倍レバレッジETFのため、標準ETFより大きなリスクがあります。
                楽天証券での発注はすべて自己判断でお願いします。
              </p>
            </div>
          </div>

          {/* Position Sizing Panel */}
          {(() => {
            const entry = data.riskManagement.entryPrice;
            const stopLoss = data.riskManagement.stopLoss;
            const riskPerShare = entry - stopLoss;
            const capitalUSD = capitalJPY / usdJpy;

            // Full position
            const fullShares = Math.floor(capitalUSD / entry);
            const fullCostUSD = fullShares * entry;
            const fullCostJPY = fullCostUSD * usdJpy;
            const fullStopLossJPY = fullShares * riskPerShare * usdJpy;
            const fullStopLossPct = capitalJPY > 0 ? (fullStopLossJPY / capitalJPY) * 100 : 0;

            // Price target rows: from just above entry to 52w high, plus user custom
            const w52High = data.quote.fiftyTwoWeekHigh;
            const step = entry < 50 ? 3 : entry < 80 ? 5 : 10;
            const baseTargets: number[] = [];
            let t = Math.ceil(entry / step) * step;
            while (t <= Math.max(w52High * 1.05, entry * 1.8)) {
              baseTargets.push(t);
              t += step;
            }
            // Insert 52w high and stopLoss as special rows if not already in list
            const allTargetPrices = Array.from(
              new Set([stopLoss, ...baseTargets, w52High])
            ).sort((a, b) => a - b);

            return (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <h2 className="font-semibold text-white flex items-center gap-2">
                    <Calculator className="text-blue-400" size={18} />
                    発注シミュレーター
                  </h2>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>
                      USD/JPY:{" "}
                      {usdJpyLoading ? (
                        <span className="text-gray-600">取得中…</span>
                      ) : (
                        <span className="text-yellow-400 font-mono font-bold">{usdJpy.toFixed(2)}</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Capital input */}
                <div className="flex flex-wrap items-end gap-4 mb-5">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 flex items-center gap-1">
                      <Wallet size={11} /> 元金（円）
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={capitalJPY}
                        onChange={e => setCapitalJPY(Number(e.target.value))}
                        step={10000}
                        min={0}
                        className="w-40 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-gray-500 text-sm">円</span>
                    </div>
                    <p className="text-xs text-gray-600">≈ ${capitalUSD.toFixed(0)} USD</p>
                  </div>
                  <div className="flex gap-1">
                    {[100000, 300000, 500000, 1000000].map(v => (
                      <button
                        key={v}
                        onClick={() => setCapitalJPY(v)}
                        className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                          capitalJPY === v ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                        }`}
                      >
                        {(v / 10000).toFixed(0)}万
                      </button>
                    ))}
                  </div>
                </div>

                {/* Full position hero */}
                <div className="bg-gradient-to-r from-blue-950/60 to-indigo-950/40 border border-blue-700/40 rounded-xl p-5 mb-5">
                  <p className="text-xs text-blue-300 font-bold uppercase tracking-widest mb-3">
                    全額投入シミュレーション
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">購入株数</p>
                      <p className="text-5xl font-black text-white font-mono leading-none">{fullShares}</p>
                      <p className="text-xs text-blue-400 mt-1">株</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">投資額（概算）</p>
                      <p className="text-2xl font-bold text-white font-mono">¥{Math.round(fullCostJPY).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">${fullCostUSD.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-red-400 mb-1">損切り到達時の損失</p>
                      <p className="text-2xl font-bold text-red-400 font-mono">-¥{Math.round(fullStopLossJPY).toLocaleString()}</p>
                      <p className="text-xs text-red-600">
                        元金の {fullStopLossPct.toFixed(1)}% ・ 損切り ${stopLoss.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">エントリー価格</p>
                      <p className="text-2xl font-bold font-mono text-white">${entry.toFixed(2)}</p>
                      <p className="text-xs text-gray-500">現在値</p>
                    </div>
                  </div>
                </div>

                {/* Price target P&L table */}
                <div>
                  <p className="text-xs text-gray-500 mb-2 font-medium">
                    価格別 損益シミュレーション（{fullShares}株 全力保有時）
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">価格</th>
                          <th className="text-right py-2 px-3 text-xs text-gray-500 font-medium">損益（円）</th>
                          <th className="text-right py-2 px-3 text-xs text-gray-500 font-medium">元金比</th>
                          <th className="text-right py-2 px-3 text-xs text-gray-500 font-medium hidden sm:table-cell">損益（USD）</th>
                          <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium hidden sm:table-cell">備考</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allTargetPrices.map(price => {
                          const pnlUSD = fullShares * (price - entry);
                          const pnlJPY = pnlUSD * usdJpy;
                          const pnlPct = capitalJPY > 0 ? (pnlJPY / capitalJPY) * 100 : 0;
                          const isEntry = Math.abs(price - entry) < 0.01;
                          const isStop = Math.abs(price - stopLoss) < 0.01;
                          const is52wHigh = Math.abs(price - w52High) < 0.01;
                          const isPrevSell = Math.abs(price - 71) < 0.5;
                          const isProfit = pnlJPY > 0;
                          const isLoss = pnlJPY < 0;

                          const note = isStop
                            ? "⚡ 損切りライン"
                            : isEntry
                            ? "← 現在値"
                            : is52wHigh
                            ? "★ 52週高値"
                            : isPrevSell
                            ? "★ 前回売却値"
                            : "";

                          return (
                            <tr
                              key={price}
                              className={`border-b border-gray-800/40 transition-colors ${
                                isStop
                                  ? "bg-red-900/20"
                                  : isEntry
                                  ? "bg-gray-800/60"
                                  : is52wHigh || isPrevSell
                                  ? "bg-emerald-900/10"
                                  : "hover:bg-gray-800/20"
                              }`}
                            >
                              <td className="py-2 px-3 font-mono font-bold">
                                <span className={isStop ? "text-red-400" : is52wHigh || isPrevSell ? "text-emerald-400" : "text-white"}>
                                  ${price.toFixed(2)}
                                </span>
                              </td>
                              <td className={`py-2 px-3 text-right font-mono font-bold ${
                                isProfit ? "text-emerald-400" : isLoss ? "text-red-400" : "text-gray-400"
                              }`}>
                                {isProfit ? "+" : ""}{Math.round(pnlJPY).toLocaleString()}円
                              </td>
                              <td className={`py-2 px-3 text-right font-mono text-sm ${
                                isProfit ? "text-emerald-600" : isLoss ? "text-red-600" : "text-gray-600"
                              }`}>
                                {isProfit ? "+" : ""}{pnlPct.toFixed(1)}%
                              </td>
                              <td className={`py-2 px-3 text-right font-mono text-xs hidden sm:table-cell ${
                                isProfit ? "text-emerald-700" : isLoss ? "text-red-700" : "text-gray-700"
                              }`}>
                                {isProfit ? "+" : ""}{pnlUSD.toFixed(0)}
                              </td>
                              <td className="py-2 px-3 text-xs text-gray-500 hidden sm:table-cell">{note}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Note */}
                <div className="mt-4 flex items-start gap-2 bg-blue-900/10 border border-blue-800/30 rounded-lg p-3">
                  <AlertTriangle className="text-blue-400 flex-shrink-0 mt-0.5" size={13} />
                  <p className="text-xs text-blue-700">
                    全額投入の場合、損切りライン（${stopLoss.toFixed(2)}）到達時の損失は元金の{fullStopLossPct.toFixed(1)}%です。
                    楽天証券での発注前に必ず損切り注文も同時に設定してください。
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Signal Details Table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Activity size={16} className="text-blue-400" />
              指標別シグナル詳細
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">指標</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">シグナル</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium hidden sm:table-cell">詳細</th>
                    <th className="text-right py-2 px-3 text-xs text-gray-500 font-medium">スコア</th>
                  </tr>
                </thead>
                <tbody>
                  {data.signals.details.map((sig) => (
                    <tr key={sig.name} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="py-3 px-3 font-medium text-white">{sig.nameJa}</td>
                      <td className="py-3 px-3">
                        <SignalBadge signal={sig.signal} strength={sig.strength} />
                      </td>
                      <td className="py-3 px-3 text-gray-400 text-xs hidden sm:table-cell">{sig.description}</td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`font-bold font-mono text-base ${
                            sig.strength > 0
                              ? "text-emerald-400"
                              : sig.strength < 0
                              ? "text-red-400"
                              : "text-gray-500"
                          }`}
                        >
                          {sig.strength > 0 ? `+${sig.strength}` : sig.strength}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-800/30">
                    <td className="py-3 px-3 font-bold text-white" colSpan={2}>合計スコア</td>
                    <td className="hidden sm:table-cell" />
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`font-black font-mono text-xl ${
                          data.signals.score > 0
                            ? "text-emerald-400"
                            : data.signals.score < 0
                            ? "text-red-400"
                            : "text-yellow-400"
                        }`}
                      >
                        {data.signals.score > 0 ? `+${data.signals.score}` : data.signals.score}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              ⚠️ 免責事項: このツールは情報提供のみを目的としており、投資助言ではありません。
              SOXLは3倍レバレッジETFであり、元本保証がなく、短期間で大きな損失が生じる可能性があります。
              楽天証券での売買はすべてご自身の判断と責任において行ってください。
              過去のパフォーマンスは将来の結果を保証するものではありません。
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
