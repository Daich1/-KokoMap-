"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

interface ChartDataPoint {
  date: string;
  close: number;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
}

interface PriceChartProps {
  data: ChartDataPoint[];
  showMA20?: boolean;
  showMA50?: boolean;
  showMA200?: boolean;
  showBB?: boolean;
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const formatPrice = (v: number) => `$${v.toFixed(2)}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-2 font-medium">{label}</p>
      {data && (
        <>
          <p className="text-white font-bold">終値: ${data.close?.toFixed(2)}</p>
          {data.ma20 && <p className="text-yellow-400">MA20: ${data.ma20?.toFixed(2)}</p>}
          {data.ma50 && <p className="text-blue-400">MA50: ${data.ma50?.toFixed(2)}</p>}
          {data.ma200 && <p className="text-red-400">MA200: ${data.ma200?.toFixed(2)}</p>}
          {data.bbUpper && <p className="text-purple-300">BB上限: ${data.bbUpper?.toFixed(2)}</p>}
          {data.bbLower && <p className="text-purple-300">BB下限: ${data.bbLower?.toFixed(2)}</p>}
        </>
      )}
    </div>
  );
};

export function PriceChart({
  data,
  showMA20 = true,
  showMA50 = true,
  showMA200 = true,
  showBB = true,
}: PriceChartProps) {
  const prices = data.map(d => d.close).filter(Boolean);
  const allValues = [
    ...prices,
    ...(showBB ? data.map(d => d.bbUpper).filter((v): v is number => v !== null) : []),
    ...(showBB ? data.map(d => d.bbLower).filter((v): v is number => v !== null) : []),
  ];
  const minY = Math.min(...allValues) * 0.97;
  const maxY = Math.max(...allValues) * 1.03;

  // Show every ~30th date tick
  const tickInterval = Math.floor(data.length / 8);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="bbGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          interval={tickInterval}
          axisLine={{ stroke: "#374151" }}
          tickLine={false}
        />
        <YAxis
          domain={[minY, maxY]}
          tickFormatter={formatPrice}
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          axisLine={{ stroke: "#374151" }}
          tickLine={false}
          width={65}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
          formatter={(value) => <span style={{ color: "#9CA3AF" }}>{value}</span>}
        />

        {/* Bollinger Band fill area */}
        {showBB && (
          <Area
            dataKey="bbUpper"
            stroke="none"
            fill="url(#bbGradient)"
            name="BB上限"
            legendType="none"
            isAnimationActive={false}
          />
        )}
        {showBB && (
          <Area
            dataKey="bbLower"
            stroke="none"
            fill="white"
            fillOpacity={0}
            name="BB下限"
            legendType="none"
            isAnimationActive={false}
          />
        )}

        {/* Price area */}
        <Area
          type="monotone"
          dataKey="close"
          stroke="#3B82F6"
          strokeWidth={2}
          fill="url(#priceGradient)"
          name="終値"
          dot={false}
          isAnimationActive={false}
        />

        {/* Bollinger Bands lines */}
        {showBB && (
          <Line
            type="monotone"
            dataKey="bbUpper"
            stroke="#8B5CF6"
            strokeWidth={1}
            strokeDasharray="4 2"
            dot={false}
            name="BB上限"
            isAnimationActive={false}
          />
        )}
        {showBB && (
          <Line
            type="monotone"
            dataKey="bbMiddle"
            stroke="#8B5CF6"
            strokeWidth={1}
            strokeDasharray="2 2"
            dot={false}
            name="BB中央"
            legendType="none"
            isAnimationActive={false}
          />
        )}
        {showBB && (
          <Line
            type="monotone"
            dataKey="bbLower"
            stroke="#8B5CF6"
            strokeWidth={1}
            strokeDasharray="4 2"
            dot={false}
            name="BB下限"
            isAnimationActive={false}
          />
        )}

        {/* Moving Averages */}
        {showMA20 && (
          <Line
            type="monotone"
            dataKey="ma20"
            stroke="#F59E0B"
            strokeWidth={1.5}
            dot={false}
            name="MA20"
            isAnimationActive={false}
            connectNulls
          />
        )}
        {showMA50 && (
          <Line
            type="monotone"
            dataKey="ma50"
            stroke="#3B82F6"
            strokeWidth={1.5}
            dot={false}
            name="MA50"
            isAnimationActive={false}
            connectNulls
          />
        )}
        {showMA200 && (
          <Line
            type="monotone"
            dataKey="ma200"
            stroke="#EF4444"
            strokeWidth={1.5}
            dot={false}
            name="MA200"
            isAnimationActive={false}
            connectNulls
          />
        )}

        <ReferenceLine y={data[data.length - 1]?.close} stroke="#3B82F6" strokeDasharray="2 4" strokeOpacity={0.5} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
