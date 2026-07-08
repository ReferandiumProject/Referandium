"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Snapshot = { price: number; recorded_at: string };

export function PriceChart({ data }: { data: Snapshot[] }) {
  const chartData = data.map((s) => ({
    time: new Date(s.recorded_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    price: Number(s.price),
  }));

  if (chartData.length === 0) {
    return (
      <div className="card flex h-64 items-center justify-center text-sm text-muted">
        No price history yet
      </div>
    );
  }

  return (
    <div className="card h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: "#6b6b6b" }}
            minTickGap={40}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "#6b6b6b" }}
            tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
            width={60}
          />
          <Tooltip
            formatter={(v: number | undefined) => [`$${Number(v ?? 0).toFixed(4)}`, "Price"]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e5" }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#0a0a0a"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
