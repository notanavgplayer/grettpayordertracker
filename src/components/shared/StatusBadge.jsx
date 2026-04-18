import { cn } from '@/lib/utils'

/**
 * Unified outline-style status badge with a colored dot.
 * Uses `currentColor` so the dot inherits the status text color.
 */
const STATUS_TONE_MAP = {
  // Amber (pending / review)
  Pending: 'amber',
  'Under Review': 'amber',
  // Blue (in-flight)
  Submitted: 'blue',
  Bidding: 'blue',
  Awaiting: 'blue',
  // Emerald (success)
  Returned: 'emerald',
  Won: 'emerald',
  Awarded: 'emerald',
  Encashed: 'emerald',
  Paid: 'emerald',
  // Red (failure / overdue)
  Forfeited: 'red',
  Lost: 'red',
  Rejected: 'red',
  Overdue: 'red',
  // Slate (neutral / closed)
  Cancelled: 'slate',
  'N/A': 'slate',
}

const TONE_CLASSES = {
  amber: 'text-amber-700 dark:text-amber-400 border-amber-300/60 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30',
  blue: 'text-blue-700 dark:text-blue-400 border-blue-300/60 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/30',
  emerald: 'text-emerald-700 dark:text-emerald-400 border-emerald-300/60 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30',
  red: 'text-red-700 dark:text-red-400 border-red-300/60 dark:border-red-800/60 bg-red-50/50 dark:bg-red-950/30',
  slate: 'text-slate-600 dark:text-slate-400 border-slate-300/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30',
}

export default function StatusBadge({ status, className }) {
  if (!status) return null
  const tone = STATUS_TONE_MAP[status] ?? 'slate'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: 'currentColor' }}
      />
      {status}
    </span>
  )
}
