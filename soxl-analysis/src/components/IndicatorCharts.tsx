"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  AreaChart,
  Area,
} from "recharts";

interface ChartDataPoint {
  date: string;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  stochK: number | null;
  stochD: number | null;
  volume: number;
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RSITooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs shadow-xl">
      <p className="text-gray-400">{label}</p>
      <p className="text-green-400">RSI: {payload[0]?.value?.toFixed(1)}</p>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MACDTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs shadow-xl">
      <p className="text-gray-400">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {p.value?.toFixed(4)}</p>
      ))}
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VolumeTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const vol = payload[0]?.value;
  const formatted = vol >= 1_000_000
    ? `${(vol / 1_000_000).toFixed(1)}M`
    : vol >= 1_000
    ? `${(vol / 1_000).toFixed(0)}K`
    : vol?.toString();
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs shadow-xl">
      <p className="text-gray-400">{label}</p>
      <p className="text-blue-400">出来高: {formatted}</p>
    </div>
  );
};

export function RSIChart({ data }: { data: ChartDataPoint[] }) {
  const tickInterval = Math.floor(data.length / 6);
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="rsiGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: "#9CA3AF", fontSize: 10 }}
          interval={tickInterval}
          axisLine={{ stroke: "#374151" }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 30, 50, 70, 100]}
          tick={{ fill: "#9CA3AF", fontSize: 10 }}
          axisLine={{ stroke: "#374151" }}
          tickLine={false}
          width={30}
        />
        <Tooltip content={<RSITooltip />} />
        <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="4 2" strokeOpacity={0.7} />
        <ReferenceLine y={50} stroke="#6B7280" strokeDasharray="2 2" strokeOpacity={0.5} />
        <ReferenceLine y={30} stroke="#10B981" strokeDasharray="4 2" strokeOpacity={0.7} />
        <Area
          type="monotone"
          dataKey="rsi"
          stroke="#10B981"
          strokeWidth={2}
          fill="url(#rsiGradient)"
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MACDChart({ data }: { data: ChartDataPoint[] }) {
  const tickInterval = Math.floor(data.length / 6);
  return (
    <ResponsiveContainer width="100%" height={140}>
      <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: "#9CA3AF", fontSize: 10 }}
          interval={tickInterval}
          axisLine={{ stroke: "#374151" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#9CA3AF", fontSize: 10 }}
          axisLine={{ stroke: "#374151" }}
          tickLine={false}
          width={40}
          tickFormatter={(v) => v.toFixed(2)}
        />
        <Tooltip content={<MACDTooltip />} />
        <ReferenceLine y={0} stroke="#6B7280" strokeOpacity={0.8} />
        <Bar
          dataKey="macdHist"
          name="ヒスト"
          fill="#60A5FA"
          opacity={0.8}
          isAnimationActive={false}
          label={false}
        />
        <Line
          type="monotone"
          dataKey="macd"
          stroke="#3B82F6"
          strokeWidth={1.5}
          dot={false}
          name="MACD"
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="macdSignal"
          stroke="#F97316"
          strokeWidth={1.5}
          dot={false}
          name="シグナル"
          isAnimationActive={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function VolumeChart({ data }: { data: ChartDataPoint[] }) {
  const tickInterval = Math.floor(data.length / 6);
  const formatVol = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${(v / 1_000).toFixed(0)}K`;

  return (
    <ResponsiveContainer width="100%" height={100}>
      <ComposedChart data={data} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: "#9CA3AF", fontSize: 10 }}
          interval={tickInterval}
          axisLine={{ stroke: "#374151" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatVol}
          tick={{ fill: "#9CA3AF", fontSize: 10 }}
          axisLine={{ stroke: "#374151" }}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<VolumeTooltip />} />
        <Bar dataKey="volume" name="出来高" fill="#3B82F6" opacity={0.5} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

