import { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { format, subDays, parseISO, startOfDay } from "date-fns";

const INTENSITY_SCORE = { low: 1, moderate: 2, high: 3 };

export default function BehaviorProgressChart({ logs }) {
  const { chartData, trend } = useMemo(() => {
    const days = 14;
    const buckets = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "MMM d");
      buckets[d] = { date: d, score: null, count: 0, total: 0 };
    }

    for (const log of logs) {
      if (!log.created_date) continue;
      const d = format(new Date(log.created_date), "MMM d");
      if (buckets[d]) {
        buckets[d].total += INTENSITY_SCORE[log.intensity] || 0;
        buckets[d].count += 1;
      }
    }

    const data = Object.values(buckets).map(b => ({
      date: b.date,
      score: b.count > 0 ? parseFloat((b.total / b.count).toFixed(2)) : null,
      count: b.count
    }));

    // Calculate trend from first half vs second half
    const filled = data.filter(d => d.score !== null);
    let trendDir = "neutral";
    if (filled.length >= 4) {
      const half = Math.floor(filled.length / 2);
      const first = filled.slice(0, half).reduce((s, d) => s + d.score, 0) / half;
      const second = filled.slice(half).reduce((s, d) => s + d.score, 0) / (filled.length - half);
      if (second < first - 0.15) trendDir = "improving";
      else if (second > first + 0.15) trendDir = "worsening";
    }

    return { chartData: data, trend: trendDir };
  }, [logs]);

  const hasData = chartData.some(d => d.score !== null);

  const TrendIcon = trend === "improving" ? TrendingDown : trend === "worsening" ? TrendingUp : Minus;
  const trendColor = trend === "improving" ? "text-green-600" : trend === "worsening" ? "text-red-500" : "text-muted-foreground";
  const trendLabel = trend === "improving" ? "Improving trend" : trend === "worsening" ? "Needs attention" : "Stable";

  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (payload.score === null) return null;
    const color = payload.score >= 2.5 ? "#ef4444" : payload.score >= 1.5 ? "#f59e0b" : "#22c55e";
    return <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length || payload[0].value === null) return null;
    const score = payload[0].value;
    const count = payload[0].payload.count;
    const level = score >= 2.5 ? "High" : score >= 1.5 ? "Moderate" : "Low";
    const color = score >= 2.5 ? "text-red-600" : score >= 1.5 ? "text-yellow-600" : "text-green-600";
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-foreground mb-0.5">{label}</p>
        <p className={`font-medium ${color}`}>Avg intensity: {level}</p>
        <p className="text-muted-foreground">{count} behavior{count !== 1 ? "s" : ""} logged</p>
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-foreground text-sm">Behavior Progress</h2>
          <p className="text-xs text-muted-foreground">Last 14 days — lower is better</p>
        </div>
        {hasData && (
          <div className={`flex items-center gap-1.5 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="w-3.5 h-3.5" />
            {trendLabel}
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="h-32 flex items-center justify-center text-center">
          <p className="text-sm text-muted-foreground">No behavior logs yet.<br />Start logging to see your progress.</p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval={3}
              />
              <YAxis domain={[0, 3]} ticks={[1, 2, 3]} tickFormatter={v => ["", "Low", "Med", "High"][v]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={2} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={<CustomDot />}
                activeDot={{ r: 6 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 justify-center">
            {[["bg-green-500","Low"],["bg-yellow-500","Moderate"],["bg-red-500","High"]].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${c}`} />
                <span className="text-xs text-muted-foreground">{l}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}