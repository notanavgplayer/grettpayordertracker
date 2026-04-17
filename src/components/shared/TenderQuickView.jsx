import { Link } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import StatusBadge from '@/components/shared/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Pencil, ExternalLink } from 'lucide-react'

function Row({ label, value, mono = false, className = '' }) {
  if (value === null || value === undefined || value === '') value = '—'
  return (
    <div className={`grid grid-cols-[110px_1fr] gap-3 py-2 border-b border-border last:border-0 ${className}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm text-foreground break-words ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</p>
    </div>
  )
}

export default function TenderQuickView({ tender, open, onOpenChange, onEdit, canEdit }) {
  if (!tender) return null
  const done = (tender.checklist || []).filter((c) => c.done).length
  const total = (tender.checklist || []).length
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-8">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="text-base break-words">{tender.name || 'Untitled tender'}</DialogTitle>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={tender.status} />
            {tender.agency && <span className="text-xs text-muted-foreground break-words">{tender.agency}</span>}
          </div>
        </DialogHeader>

        <div className="mt-1">
          <Row label="NIT / Ref" value={tender.nit} mono />
          <Row label="Value" value={formatCurrency(tender.value)} mono />
          {Number(tender.tenderFee) > 0 && <Row label="Tender Fee" value={formatCurrency(tender.tenderFee)} mono />}
          <Row label="Submission" value={formatDate(tender.submissionDate)} />
          <Row label="Opening" value={formatDate(tender.openingDate)} />
          {tender.linkedPO && <Row label="Linked PO" value={tender.linkedPO} mono />}
          {tender.contact && <Row label="Contact" value={tender.contact} />}
          {total > 0 && (
            <div className="py-2 border-b border-border">
              <p className="text-xs text-muted-foreground">Checklist</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Progress value={pct} className="flex-1 h-1.5" />
                <span className="text-xs text-muted-foreground font-mono tabular-nums">{done}/{total}</span>
              </div>
            </div>
          )}
          {tender.notes && (
            <div className="pt-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{tender.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" asChild>
            <Link to={`/tenders/${tender.id}`}>
              <ExternalLink className="h-4 w-4" /> Full detail
            </Link>
          </Button>
          {canEdit && (
            <Button onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
