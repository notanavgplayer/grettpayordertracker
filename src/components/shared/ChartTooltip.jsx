/* eslint-disable react-refresh/only-export-components */
/**
 * Shared Recharts tooltip styled to match the app's card/popover tokens.
 * Pass as `content={<ChartTooltip />}` on any Recharts <Tooltip /> to get
 * a consistent, theme-aware dark/light look.
 *
 * Optional `formatter(value, name, entry)` lets callers override the
 * value rendering (e.g. currency).
 */
export default function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      {label !== undefined && label !== '' && (
        <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => {
          const value = formatter ? formatter(entry.value, entry.name, entry) : entry.value
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: entry.color || entry.fill || 'currentColor' }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-mono tabular-nums font-medium text-foreground">
                {value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Brand color palette for categorical charts. Mix of navy primary tints
 * and amber accent. Sequence tuned to read well on both light and dark.
 */
export const CHART_COLORS = [
  'hsl(217 91% 45%)', // primary blue
  'hsl(38 92% 50%)',  // amber
  'hsl(160 84% 39%)', // emerald
  'hsl(262 83% 58%)', // violet
  'hsl(346 87% 55%)', // rose
  'hsl(199 89% 48%)', // sky
  'hsl(24 95% 53%)',  // orange
  'hsl(280 65% 60%)', // purple
  'hsl(173 80% 40%)', // teal
  'hsl(340 75% 55%)', // pink
]

/**
 * Semantic colors for specific outcomes (bid results, statuses).
 */
export const CHART_SEMANTIC = {
  positive: 'hsl(160 84% 39%)', // emerald
  negative: 'hsl(0 84% 60%)',   // red
  neutral: 'hsl(217 91% 45%)',  // primary
  warning: 'hsl(38 92% 50%)',   // amber
}

/** Common axis tick style for Recharts */
export const AXIS_TICK = { fontSize: 11, fill: 'oklch(var(--muted-foreground))' }
