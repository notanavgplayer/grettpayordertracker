import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import KpiCard from './KpiCard'

const TONES = {
  primary: 'primary',
  success: 'emerald',
  warning: 'amber',
  danger: 'rose',
  info: 'blue',
  neutral: 'slate',
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
  const DeltaIcon = deltaPositive === true ? ArrowUp : deltaPositive === false ? ArrowDown : null

  const card = (
    <KpiCard
      className={cn('transition-colors', href && 'cursor-pointer hover:bg-muted/30', className)}
      icon={Icon}
      label={title}
      value={value}
      helper={delta}
      badge={DeltaIcon ? <DeltaIcon className="h-3 w-3" aria-hidden /> : null}
      tone={TONES[tone] ?? TONES.primary}
    />
  )

  return href ? <Link to={href}>{card}</Link> : card
}
