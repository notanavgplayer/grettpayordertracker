import { cn } from '@/lib/utils'
import { getTenderDeadline } from '@/lib/tenderDeadlines'

const TONES = {
  upcoming: 'border-border bg-muted/50 text-muted-foreground',
  attention: 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300',
  urgent: 'border-orange-300/70 bg-orange-50 text-orange-700 dark:border-orange-800/70 dark:bg-orange-950/35 dark:text-orange-300',
  'very-urgent': 'border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/35 dark:text-rose-300',
  critical: 'border-destructive/40 bg-destructive/10 text-destructive dark:text-rose-300',
  overdue: 'border-destructive/50 bg-destructive/10 text-destructive dark:text-rose-300',
}

export default function DeadlineBadge({ tender, deadline = getTenderDeadline(tender), className }) {
  if (!deadline) return null
  return (
    <span className={cn('inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none', TONES[deadline.urgency], className)}>
      {deadline.label}
    </span>
  )
}
