import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { billLedger } from '@/lib/billingLedger'
import { formatCurrency } from '@/lib/utils'

export default function BillEditorDialog({
  open, onOpenChange, editing, form, setField, typeOptions = [], isAdmin, onSave,
  variant = 'bill', original = null, documents = [], error = '',
}) {
  const isRaBill = variant === 'ra-bill'
  const idPrefix = isRaBill ? 'ra-bill' : 'bill'
  const billing = form.v2?.billing
  const locked = Boolean(original && ['Approved', 'Paid', 'Partially Paid'].includes(original.status))
  const previous = Number(billing?.previousCertifiedGross) || 0
  const increment = Number(form.amount) - (billing?.basis === 'cumulative' ? previous : 0)
  const updateBilling = (patch) => setField('v2')({ ...form.v2, billing: { ...billing, ...patch } })

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b px-5 py-4">
        <DialogTitle>{editing ? `Edit ${isRaBill ? 'RA Bill' : 'Bill'}` : `Add ${isRaBill ? 'RA Bill' : 'Bill'}`}</DialogTitle>
        <DialogDescription>Record the bill first. Approval and payments have separate actions.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
        {locked && <p className="rounded-lg border p-3 text-sm text-muted-foreground">Approved bill amounts are locked. Use its payment and RM actions for later transactions.</p>}
        {!billing && <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Legacy bill: original financial fields are preserved. Reconcile its gross, deductions and receipts from source documents before using the new actions.</p>}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field id={`${idPrefix}-number`} label={isRaBill ? 'RA Bill No.' : 'Bill No.'} value={form.no} onChange={setField('no')} disabled={!isAdmin || locked} />
          {!isRaBill && <div className="min-w-0 space-y-1"><Label htmlFor="bill-type">Type</Label><Select value={form.type} onValueChange={setField('type')} disabled={!isAdmin || locked}><SelectTrigger id="bill-type"><SelectValue /></SelectTrigger><SelectContent>{typeOptions.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>}
          <Field id={`${idPrefix}-date`} label="Bill date" type="date" value={form.date} onChange={setField('date')} disabled={!isAdmin || locked} />
          <Field id={`${idPrefix}-amount`} label="Submitted gross amount" type="number" min="0" step="0.01" value={form.amount} onChange={setField('amount')} disabled={!isAdmin || locked} />
          {billing && <div className="min-w-0 space-y-1 sm:col-span-2"><Label>Amount basis</Label><Select value={billing.basis} onValueChange={(basis) => updateBilling({ basis })} disabled={!isAdmin || locked}><SelectTrigger aria-label="Amount basis"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="incremental">This bill only</SelectItem><SelectItem value="cumulative">Total including previous bills</SelectItem></SelectContent></Select></div>}
          {billing?.basis === 'cumulative' && <div className="sm:col-span-2 rounded-lg border bg-muted/20 p-3 text-sm"><p>Previous certified gross: <strong>{formatCurrency(previous)}</strong></p><p>Current bill increment: <strong>{Number.isFinite(increment) && increment >= 0 ? formatCurrency(increment) : 'Enter a total at least as large as previous bills'}</strong></p></div>}
          <div className="min-w-0 space-y-1"><Label htmlFor={`${idPrefix}-document`}>Linked document</Label><Select value={form.documentId || 'none'} onValueChange={(value) => setField('documentId')(value === 'none' ? '' : value)} disabled={!isAdmin || locked}><SelectTrigger id={`${idPrefix}-document`}><SelectValue placeholder="No document linked" /></SelectTrigger><SelectContent><SelectItem value="none">No document linked</SelectItem>{documents.filter((item) => item.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.name || item.title || item.fileName || item.id}</SelectItem>)}</SelectContent></Select></div>
          <div className="min-w-0 space-y-1 sm:col-span-2"><Label htmlFor={`${idPrefix}-remarks`}>Notes</Label><Textarea id={`${idPrefix}-remarks`} value={form.remarks} onChange={setField('remarks')} rows={3} disabled={!isAdmin} /></div>
        </div>
        {locked && <p className="text-xs text-muted-foreground">Approved gross: {formatCurrency(billLedger(original, original.v2?.billing?.contractBasis).approved)}</p>}
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t bg-background px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        {!locked && isAdmin && <><Button type="button" variant="outline" onClick={() => onSave('Draft')}>Save Draft</Button><Button type="button" onClick={() => onSave('Submitted')}>Submit Bill</Button></>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

function Field({ id, label, ...props }) {
  return <div className="min-w-0 space-y-1"><Label htmlFor={id}>{label}</Label><Input id={id} aria-label={label} {...props} className={props.type === 'date' ? 'mobile-date-input' : 'min-w-0'} /></div>
}
