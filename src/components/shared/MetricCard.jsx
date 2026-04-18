import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const TONE_TILES = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  neutral: 'bg-muted text-muted-foreground',
}

export default function MetricCard({
  title,
  value,
  icon: Icon,
  delta,
  deltaPositive,
  href,
  tone = 'primary',
  className,
}) {
  const tileClass = TONE_TILES[tone] ?? TONE_TILES.primary
  const deltaColor =
    deltaPositive === true
      ? 'text-emerald-600 dark:text-emerald-400'
      : deltaPositive === false
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-muted-foreground'
  const DeltaIcon = deltaPositive === true ? ArrowUp : deltaPositive === false ? ArrowDown : null

  const card = (
    <Card className={cn('transition-colors', href && 'cursor-pointer hover:bg-muted/30', className)}>
      <div className="flex items-start justify-between gap-2 p-6">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          {typeof value === 'string' && /^Rs\s/i.test(value) ? (
            <div className="mt-3 leading-none">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Rs
              </p>
              <p className="font-display mt-1 text-2xl sm:text-3xl font-semibold tabular-nums text-foreground break-all">
                {value.replace(/^Rs\s/i, '')}
              </p>
            </div>
          ) : (
            <p className="font-display mt-3 text-3xl font-semibold tabular-nums leading-none text-foreground">
              {value}
            </p>
          )}
          {delta && (
            <div className={cn('mt-3 flex items-center gap-1 text-xs', deltaColor)}>
              {DeltaIcon && <DeltaIcon size={14} aria-hidden />}
              <span className="font-medium truncate">{delta}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-md flex-shrink-0', tileClass)}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </Card>
  )

  return href ? <Link to={href}>{card}</Link> : card
}
