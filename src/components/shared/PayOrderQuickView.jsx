import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/shared/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Pencil } from 'lucide-react'

function Row({ label, value, mono = false }) {
  if (value === null || value === undefined || value === '') value = '—'
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-2 border-b border-border last:border-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm text-foreground break-words ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</p>
    </div>
  )
}

export default function PayOrderQuickView({ payOrder, open, onOpenChange, onEdit, canEdit }) {
  if (!payOrder) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-mono text-base break-words">{payOrder.po || 'No PO #'}</DialogTitle>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <StatusBadge status={payOrder.status} />
            {payOrder.bidResult && payOrder.bidResult !== 'N/A' && (
              <StatusBadge status={payOrder.bidResult} />
            )}
            {payOrder.bank && <span className="text-xs text-muted-foreground">{payOrder.bank}</span>}
          </div>
        </DialogHeader>

        <div className="mt-1">
          <Row label="Amount" value={formatCurrency(payOrder.amount)} mono />
          <Row label="NIT / Ref" value={payOrder.nit} mono />
          <Row label="Tender" value={payOrder.tender} />
          <Row label="Agency" value={payOrder.agency} />
          <Row label="Submitted" value={formatDate(payOrder.submitted)} />
          {payOrder.notes && (
            <div className="pt-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{payOrder.notes}</p>
            </div>
          )}
        </div>

        {canEdit && (
          <DialogFooter>
            <Button onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
