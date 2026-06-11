"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
export default function Charts({ series }) {
  if (!series.length) {
    return <p className="text-neutral-500">No data yet.</p>;
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-xs text-neutral-400 mb-4">Conversions by month</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={series}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
          <YAxis stroke="#9CA3AF" fontSize={12} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              color: "#fff",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="consultations"
            name="Consultations"
            stroke="#8A8972"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="retailSales"
            name="Retail sales"
            stroke="#9CA3AF"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
