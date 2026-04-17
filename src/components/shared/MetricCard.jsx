import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export default function MetricCard({ title, value, icon: Icon, delta, deltaPositive, href, mono = true, className }) {
  const card = (
    <Card className={cn('transition-shadow overflow-hidden', href && 'cursor-pointer hover:shadow-sm', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4 px-4 sm:px-5">
        <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate min-w-0">{title}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      </CardHeader>
      <CardContent className="px-4 sm:px-5 pb-4 min-w-0">
        <p className={cn(
          'text-lg sm:text-xl lg:text-2xl font-bold tracking-tight truncate',
          mono && 'font-mono tabular-nums'
        )}>
          {value}
        </p>
        {delta && (
          <p className={cn(
            'text-xs mt-1 truncate',
            deltaPositive === true  && 'text-emerald-600 dark:text-emerald-400',
            deltaPositive === false && 'text-red-500 dark:text-red-400',
            deltaPositive === null  && 'text-muted-foreground'
          )}>
            {delta}
          </p>
        )}
      </CardContent>
    </Card>
  )

  return href ? <Link to={href}>{card}</Link> : card
}
