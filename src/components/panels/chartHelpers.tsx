import type { TooltipProps } from 'recharts';

/** Shared axis styling so every chart in the game reads as one system. */
export const chartAxis = {
  stroke: 'rgba(255,255,255,0.18)',
  tick: { fill: 'rgba(226,232,240,0.5)', fontSize: 10 },
  tickLine: false,
  axisLine: false,
} as const;

function TooltipCard({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass-strong rounded-lg px-3 py-2 text-xs">
      {label !== undefined && <p className="mb-1 font-semibold text-white">{String(label)}</p>}
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="num flex items-center gap-2 text-slate-300">
          <span className="h-2 w-2 rounded-sm" style={{ background: entry.color }} />
          <span className="text-slate-400">{entry.name}</span>
          <span className="ml-auto font-semibold text-white">
            {typeof entry.value === 'number' ? entry.value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export const chartTooltip = {
  content: TooltipCard,
  cursor: { stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 },
} as const;

export const ChartFrame = {
  Empty: ({ message }: { message: string }) => (
    <div className="flex h-52 items-center justify-center text-xs text-slate-500">{message}</div>
  ),
};
