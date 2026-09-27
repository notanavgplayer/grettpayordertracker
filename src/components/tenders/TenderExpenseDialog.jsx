import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import TransactionLedger from '@/components/shared/TransactionLedger'

function CalculationPreview({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

export default function TenderExpenseDialog({
  open,
  onOpenChange,
  editing,
  form,
  setField,
  categories,
  boqItems = [],
  preview,
  onSave,
  saving,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update expense details.' : 'Record a new expense for this tender.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-exp-desc">Description <span className="text-destructive">*</span></Label>
            <Input id="td-exp-desc" value={form.description} onChange={setField('description')} placeholder="What was this expense for?" className="h-10 w-full min-w-0 text-sm sm:h-11" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-exp-category">Category</Label>
            <Select value={form.category} onValueChange={setField('category')}>
              <SelectTrigger id="td-exp-category" className="h-10 w-full min-w-0 text-sm sm:h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-exp-method">Calculation Method</Label>
            <Select value={form.calculationMethod || 'manual'} onValueChange={setField('calculationMethod')}>
              <SelectTrigger id="td-exp-method" className="h-10 w-full min-w-0 text-sm sm:h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Amount</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-exp-basis">Calculate From</Label>
            <Select value={form.amountBasis || 'manual'} onValueChange={setField('amountBasis')}>
              <SelectTrigger id="td-exp-basis" className="h-10 w-full min-w-0 text-sm sm:h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gross">Gross Value</SelectItem>
                <SelectItem value="net">Net Value</SelectItem>
                <SelectItem value="manual">Manual / Not Based</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-exp-percentage">Percentage</Label>
            <Input id="td-exp-percentage" type="number" min="0" step="0.01" value={form.percentage ?? ''} onChange={setField('percentage')} placeholder="0" disabled={form.calculationMethod !== 'percentage'} className="h-10 w-full min-w-0 font-mono text-sm tabular-nums sm:h-11" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-exp-amt">Amount (PKR)</Label>
            <Input id="td-exp-amt" type="number" min="0" step="0.01" value={form.amount} onChange={setField('amount')} readOnly={form.calculationMethod === 'percentage' && form.amountBasis !== 'manual'} placeholder="0" className="h-10 w-full min-w-0 font-mono text-sm tabular-nums sm:h-11" />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <div className="grid grid-cols-1 gap-2 rounded-xl border bg-muted/20 p-3 text-sm sm:grid-cols-3">
              <CalculationPreview label="Base Amount" value={preview.baseAmount} />
              <CalculationPreview label="Percentage" value={preview.percentage} />
              <CalculationPreview label="Calculated Amount" value={preview.calculatedAmount} />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-exp-date">Date</Label>
            <Input id="td-exp-date" type="date" value={form.date} onChange={setField('date')} className="expense-date-input" />
          </div>
          <div className="min-w-0 space-y-1.5"><Label htmlFor="td-exp-payee">Supplier / payee</Label><Input id="td-exp-payee" value={form.v2?.payee || ''} onChange={(event) => setField('v2')({ ...form.v2, payee: event.target.value })} /></div>
          <div className="min-w-0 space-y-1.5"><Label htmlFor="td-exp-invoice">Invoice / reference</Label><Input id="td-exp-invoice" value={form.v2?.invoice || ''} onChange={(event) => setField('v2')({ ...form.v2, invoice: event.target.value })} /></div>
          <div className="min-w-0 space-y-1.5"><Label htmlFor="td-exp-boq">BOQ allocation</Label><Select value={form.v2?.boqItemId || 'none'} onValueChange={(value) => setField('v2')({ ...form.v2, boqItemId: value === 'none' ? '' : value })}><SelectTrigger id="td-exp-boq"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unallocated</SelectItem>{boqItems.filter((item) => item.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.description || item.name || item.id}</SelectItem>)}</SelectContent></Select></div>
          <div className="sm:col-span-2">{form.v2?.payments === undefined ? <div className="rounded-lg border p-3 text-sm"><p>Legacy payment history is unknown. Reconcile bank records first.</p><Button className="mt-2" variant="outline" onClick={() => setField('v2')({ ...form.v2, payments: [] })}>Start reconciled payment ledger</Button></div> : <TransactionLedger title="Payments" events={form.v2.payments} limit={Number(form.amount) || 0} onChange={(events) => setField('v2')({ ...form.v2, payments: events })} />}</div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="td-exp-note">Notes</Label>
            <Textarea id="td-exp-note" value={form.note} onChange={setField('note')} rows={3} className="min-h-24 text-sm sm:min-h-28" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-10 w-full sm:h-11 sm:w-auto" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:h-11 sm:w-auto" onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Add Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
