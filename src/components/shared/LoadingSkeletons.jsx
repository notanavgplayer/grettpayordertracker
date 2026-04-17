import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

/** Placeholder grid of 4 metric cards matching MetricCard dimensions. */
export function MetricRowSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded" />
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** Placeholder rows for a table inside a Card. */
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <Card>
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="divide-y divide-border">
        {/* Header row */}
        <div className="px-4 py-3 flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3 flex gap-4 items-center">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={`h-4 flex-1 ${c === 0 ? 'max-w-[180px]' : c === cols - 1 ? 'max-w-[80px]' : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Full-page skeleton: header + metric row + table. */
export function PageTableSkeleton({ rows = 6, cols = 5, metrics = 4 }) {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {metrics > 0 && <MetricRowSkeleton count={metrics} />}
      <TableSkeleton rows={rows} cols={cols} />
    </div>
  )
}
