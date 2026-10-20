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

export function DashboardStatCard({ label, value, detail, icon: Icon, href, tone = 'blue', featured = false, className }) {
  return (
    <Link to={href} className={cn('group min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2', className)}>
      <Card className={cn('h-full min-w-0 rounded-2xl border-border shadow-[0_5px_18px_rgba(15,23,42,0.045)] transition-[box-shadow,border-color] lg:min-h-[128px] group-hover:border-blue-300 group-hover:shadow-[0_8px_24px_rgba(15,23,42,0.09)] dark:shadow-none dark:group-hover:border-blue-700', featured && 'dashboard-featured border-indigo-600/40 bg-gradient-to-br from-[#354787] via-[#283a78] to-[#192a60] text-white shadow-[0_10px_24px_rgba(27,45,102,0.2)] group-hover:border-indigo-400 group-hover:shadow-[0_12px_28px_rgba(27,45,102,0.28)] dark:from-[#34457d] dark:via-[#283869] dark:to-[#1b2956] dark:shadow-[0_10px_24px_rgba(0,0,0,0.18)]')}>
        <CardContent className="flex h-full min-w-0 flex-col justify-between gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className={cn('min-w-0 break-words text-[13px] font-medium leading-[18px] text-muted-foreground', featured && 'text-indigo-100')}>{label}</span>
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent', tones[tone], featured && 'border-white/15 bg-white/10 text-white')}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="min-w-0">
            <p className={cn('kpi-amount', featured && 'text-white')}>{value}</p>
            <p className={cn('mt-0.5 break-words text-xs leading-4 text-muted-foreground', featured && 'text-indigo-100/90')}>{detail}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export function DashboardSection({ title, description, href, linkLabel = 'View all', children, className, contentClassName }) {
  return (
    <Card role="region" aria-label={title} className={cn('min-w-0 overflow-hidden rounded-2xl border-border shadow-[0_5px_18px_rgba(15,23,42,0.035)] dark:shadow-none', className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold leading-5 sm:text-base">{title}</CardTitle>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {href && <Link to={href} className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40">
          {linkLabel}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>}
      </CardHeader>
      <div className={cn('p-4', contentClassName)}>{children}</div>
    </Card>
  )
}

export function DashboardEmpty({ children }) {
  return <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{children}</p>
}
