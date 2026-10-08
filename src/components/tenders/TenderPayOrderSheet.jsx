import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import SecurityFields from '@/components/shared/SecurityFields'
import { calculatedBidSecurity } from '@/lib/bidSecurity'
import { formatCurrency } from '@/lib/utils'

export default function TenderPayOrderSheet({
  open,
  onOpenChange,
  editing,
  form,
  setField,
  banks,
  purposes,
  statuses,
  onSave,
  saving,
  tender,
}) {
  const calculation = form.v2?.bidSecurityCalculation || { basis: 'estimated', rate: '', fixedAmount: '' }
  const expected = calculatedBidSecurity(tender, calculation)
  const setCalculation = (key, value) => setField('v2')({ ...form.v2, bidSecurityCalculation: { ...calculation, [key]: value } })
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full min-w-0 flex-col gap-0 overflow-x-hidden p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
          <SheetTitle>{editing ? 'Edit Pay Order' : 'New Pay Order'}</SheetTitle>
          <SheetDescription>
            {editing ? 'Update pay order details.' : 'Attach a pay order to this tender. It will also appear in the global Pay Orders list.'}
          </SheetDescription>
        </SheetHeader>
        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="td-po-num">PO Number <span className="text-destructive">*</span></Label>
              <Input id="td-po-num" required value={form.po} onChange={setField('po')} className="font-mono" placeholder="PO-2024-001" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="td-po-bank">Bank</Label>
              <Select value={form.bank} onValueChange={setField('bank')}>
                <SelectTrigger id="td-po-bank"><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>{banks.map((bank) => <SelectItem key={bank} value={bank}>{bank}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {form.purpose === 'Bid Security' && <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-semibold">Bid security calculation</p>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Calculation basis</Label><Select value={calculation.basis} onValueChange={(value) => setCalculation('basis', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="estimated">Estimated cost</SelectItem><SelectItem value="quoted">Quoted bid</SelectItem><SelectItem value="fixed">Fixed amount</SelectItem></SelectContent></Select></div>
            {calculation.basis === 'fixed' ? <div className="space-y-1"><Label htmlFor="td-bid-fixed">Fixed security amount</Label><Input id="td-bid-fixed" type="number" min="0" step="0.01" value={calculation.fixedAmount} onChange={(event) => setCalculation('fixedAmount', event.target.value)} /></div> : <div className="space-y-1"><Label htmlFor="td-bid-rate">Rate %</Label><Input id="td-bid-rate" type="number" min="0" max="100" step="0.01" value={calculation.rate} onChange={(event) => setCalculation('rate', event.target.value)} /></div>}</div>
            <p className="text-xs text-muted-foreground">Calculated security: {expected === null ? 'Basis not recorded' : formatCurrency(expected)}. The bank instrument amount stays separately editable and is not deducted from bill net payable.</p>
            {expected !== null && <Button type="button" size="sm" variant="outline" onClick={() => setField('amount')(String(expected))}>Use calculated amount</Button>}
          </div>}
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="td-po-amt">Amount (PKR) <span className="text-destructive">*</span></Label>
              <Input id="td-po-amt" required type="number" min="0" step="0.01" value={form.amount} onChange={setField('amount')} placeholder="0" className="font-mono tabular-nums" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="td-po-sub">Submitted</Label>
              <Input id="td-po-sub" type="date" value={form.submitted} onChange={setField('submitted')} className="mobile-date-input" />
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="td-po-purpose">Purpose</Label>
              <Select value={form.purpose} onValueChange={setField('purpose')}>
                <SelectTrigger id="td-po-purpose"><SelectValue /></SelectTrigger>
                <SelectContent>{purposes.map((purpose) => <SelectItem key={purpose} value={purpose}>{purpose}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="td-po-status">Status</Label>
              <Select value={form.status} onValueChange={setField('status')}>
                <SelectTrigger id="td-po-status"><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-po-notes">Notes</Label>
            <Textarea id="td-po-notes" value={form.notes} onChange={setField('notes')} rows={3} />
          </div>
          <SecurityFields form={form} setV2={(key, value) => setField('v2')({ ...form.v2, [key]: value })} />
        </div>
        <SheetFooter className="gap-2 border-t border-border bg-background px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:justify-end sm:px-6 sm:pb-4">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="w-full sm:w-auto" onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Add Pay Order'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
