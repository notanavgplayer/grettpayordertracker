import { useCollection } from '@/hooks/useFirestore'
import { formatDate } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Activity, Loader2 } from 'lucide-react'

export default function ActivityPage() {
  const { data: logs, loading } = useCollection('activityLog', 'createdAt', 'desc')

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader title="Activity Log" description="Full history of follow-up actions" />

      {logs.length === 0 ? (
        <EmptyState icon={Activity} title="No activity logged" description="Activity entries logged in Pay Orders will appear here." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>PO #</TableHead>
                <TableHead className="hidden sm:table-cell">Reference</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Next Step</TableHead>
                <TableHead className="hidden lg:table-cell">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(l.date)}</TableCell>
                  <TableCell className="font-mono text-sm">{l.po || '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">{l.ref || '—'}</TableCell>
                  <TableCell className="text-sm">{l.action || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{l.next || '—'}</TableCell>
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
