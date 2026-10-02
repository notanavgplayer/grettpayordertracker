import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const tones = {
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function DashboardStatCard({ label, value, detail, icon: Icon, href, tone = 'blue' }) {
  return (
    <Link to={href} className="group min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <Card className="h-full min-w-0 transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
        <CardContent className="flex h-full min-w-0 flex-col justify-between gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium leading-4 text-muted-foreground">{label}</span>
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="overflow-x-auto whitespace-nowrap text-xl font-semibold tracking-tight tabular-nums text-foreground 2xl:text-2xl">{value}</p>
            <p className="mt-1 text-xs leading-4 text-muted-foreground">{detail}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export function DashboardSection({ title, description, href, linkLabel = 'View all', children, className, contentClassName }) {
  return (
    <Card className={cn('min-w-0 overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {href && <Link to={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300">
          {linkLabel}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>}
      </CardHeader>
      <CardContent className={cn('p-4 sm:p-5', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

export function DashboardEmpty({ children }) {
  return <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>
}
