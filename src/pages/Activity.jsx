import { useCollection } from '@/hooks/useFirestore'
import { formatDate } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageTableSkeleton } from '@/components/shared/LoadingSkeletons'
import { Activity } from 'lucide-react'

export default function ActivityPage() {
  const { data: logs, loading } = useCollection('activityLog', 'createdAt', 'desc')

  if (loading) return <PageTableSkeleton rows={8} cols={5} metrics={0} />

  return (
    <div className="space-y-6">
      <PageHeader title="Activity Log" description="Full history of follow-up actions" />

      {logs.length === 0 ? (
        <EmptyState icon={Activity} title="No activity logged" description="Activity entries logged in Pay Orders will appear here." />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border py-3 px-4">
            <CardTitle className="text-sm">Activity entries</CardTitle>
            <CardDescription className="text-xs">
              <span className="font-mono tabular-nums">{logs.length}</span> total
            </CardDescription>
          </CardHeader>

          {/* Mobile: card per entry */}
          <div className="md:hidden p-3 space-y-3 bg-muted/30">
            {logs.map((l) => (
              <Card key={l.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground break-words">{l.action || '—'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(l.date)}{l.by && <> · {l.by}</>}</p>
                    </div>
                    {l.po && <span className="font-mono text-xs text-muted-foreground flex-shrink-0">{l.po}</span>}
                  </div>
                  {(l.ref || l.next) && (
                    <div className="grid grid-cols-1 gap-1 text-xs pt-2 border-t border-border">
                      {l.ref && <div><span className="text-muted-foreground">Ref: </span><span className="font-mono">{l.ref}</span></div>}
                      {l.next && <div className="break-words"><span className="text-muted-foreground">Next: </span>{l.next}</div>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>PO #</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden lg:table-cell">Next Step</TableHead>
                <TableHead className="hidden lg:table-cell">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(l.date)}</TableCell>
                  <TableCell className="font-mono text-sm">{l.po || '—'}</TableCell>
                  <TableCell className="text-sm font-mono">{l.ref || '—'}</TableCell>
                  <TableCell className="text-sm">{l.action || '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{l.next || '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{l.by || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
