import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import TransactionLedger from '@/components/shared/TransactionLedger'
import { billAmounts } from '@/lib/financials'
import BillWorkflowFields from './BillWorkflowFields'

export default function BillEditorDialog({
  open, onOpenChange, editing, form, setField, typeOptions = [], statusOptions,
  isAdmin, onSave, variant = 'bill', original = null, contract = null, documents = [],
}) {
  const isRaBill = variant === 'ra-bill'
  const title = isRaBill ? (editing ? 'Edit RA Bill' : 'Add RA Bill') : (editing ? 'Edit Bill / Invoice' : 'Add Bill / RA Bill')
  const description = isRaBill
    ? 'Record running account bill approvals, payments, deductions, and receivables.'
    : 'Record submitted, approved, received, deductions, and receivable details.'
  const idPrefix = isRaBill ? 'ra-bill' : 'bill'
  const amounts = billAmounts(form)
  const lockedBase = Boolean(original && (original.v2?.receipts?.length || original.v2?.billing?.retentionReleases?.length || Number(original.receivedAmount) > 0))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <FormField id={`${idPrefix}-number`} label={isRaBill ? 'RA Bill No.' : 'Bill No.'} value={form.no} onChange={setField('no')} disabled={!isAdmin || lockedBase} placeholder={isRaBill ? 'RA-06' : 'BILL-12'} />
          {!isRaBill && <div className="min-w-0 space-y-1.5">
            <Label htmlFor="bill-type">Type</Label>
            <Select value={form.type} onValueChange={setField('type')} disabled={!isAdmin || lockedBase}>
              <SelectTrigger id="bill-type"><SelectValue /></SelectTrigger>
              <SelectContent>{typeOptions.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          <FormField id={`${idPrefix}-date`} label={isRaBill ? 'RA Bill Date' : 'Date'} type="date" value={form.date} onChange={setField('date')} disabled={!isAdmin || lockedBase} />
          <div className="min-w-0 space-y-1.5"><Label htmlFor={`${idPrefix}-document`}>Linked document</Label><Select value={form.documentId || 'none'} onValueChange={(value) => setField('documentId')(value === 'none' ? '' : value)} disabled={!isAdmin || lockedBase}><SelectTrigger id={`${idPrefix}-document`}><SelectValue placeholder="No document linked" /></SelectTrigger><SelectContent><SelectItem value="none">No document linked</SelectItem>{documents.filter((item) => item.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.name || item.title || item.fileName || item.id}</SelectItem>)}</SelectContent></Select></div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="bill-status">Status</Label>
            <Select value={form.status} onValueChange={setField('status')} disabled={!isAdmin || lockedBase}>
              <SelectTrigger id="bill-status"><SelectValue /></SelectTrigger>
              <SelectContent>{statusOptions.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <FormField id={`${idPrefix}-amount`} label="Submitted Gross Amount" type="number" min="0" step="0.01" value={form.amount} onChange={setField('amount')} disabled={!isAdmin || lockedBase} />
          <FormField id={`${idPrefix}-approved-amount`} label="Approved Gross Amount" type="number" min="0" step="0.01" value={form.approvedAmount} onChange={setField('approvedAmount')} disabled={!isAdmin || lockedBase} />
          {form.v2?.billing ? <BillWorkflowFields form={form} setField={setField} original={original} contract={contract} isAdmin={isAdmin} /> : <>
            <FormField id={`${idPrefix}-received-amount`} label="Received Amount" type="number" min="0" step="0.01" value={form.receivedAmount} onChange={setField('receivedAmount')} disabled={!isAdmin || lockedBase} />
            <FormField id={`${idPrefix}-deductions`} label="Deductions" type="number" min="0" step="0.01" value={form.deductions} onChange={setField('deductions')} disabled={!isAdmin || lockedBase} />
            <div className="sm:col-span-2 rounded-xl border p-3"><p className="mb-2 text-sm font-semibold">Deduction details (PKR)</p><div className="grid grid-cols-3 gap-2">{[['retention','Retention'],['tax','Tax withheld'],['other','Other']].map(([key,label]) => <div key={key}><Label htmlFor={`${idPrefix}-${key}`}>{label}</Label><Input id={`${idPrefix}-${key}`} type="number" min="0" step="0.01" value={form.v2?.deductions?.[key] ?? ''} onChange={(event) => setField('v2')({ ...form.v2, deductions: { ...form.v2?.deductions, [key]: event.target.value } })} disabled={!isAdmin || lockedBase} /></div>)}</div><p className="mt-2 text-xs text-muted-foreground">When detail is entered, it replaces the legacy total deduction field.</p></div>
            <div className="sm:col-span-2">{Number(form.receivedAmount) > 0 && !form.v2?.receipts ? <p className="rounded-lg border p-3 text-sm text-muted-foreground">Legacy received total has no dated events. Reconcile it before replacing the aggregate with transaction entries.</p> : <TransactionLedger title={`${idPrefix}-receipts`} events={form.v2?.receipts || []} onChange={(events) => setField('v2')({ ...form.v2, receipts: events })} limit={Math.max(amounts.approved - amounts.deductions, 0)} disabled={!isAdmin || lockedBase} />}</div>
          </>}
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-remarks`}>Remarks / Notes</Label>
            <Textarea id={`${idPrefix}-remarks`} value={form.remarks} onChange={setField('remarks')} rows={3} placeholder="Add remarks or notes" disabled={!isAdmin} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" onClick={onSave} disabled={!isAdmin}>
            {editing ? 'Save Changes' : (isRaBill ? 'Add RA Bill' : 'Add Bill')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormField({ id: providedId, label, ...props }) {
  const generatedId = useId()
  const id = providedId || generatedId
  const inputClassName = props.type === 'date' ? 'mobile-date-input' : props.type === 'number' ? 'font-mono tabular-nums' : ''
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} className={inputClassName} />
    </div>
  )
}
