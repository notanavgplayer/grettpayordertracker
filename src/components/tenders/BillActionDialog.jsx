import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { billDisplayStatus, billLedger, deductionRowAmount, transitionReceipt, validateBillingLedger, validateProjectReceiptReferences } from '@/lib/billingLedger'
import { nullableNumber } from '@/lib/data'
import { formatCurrency, formatDate, uid } from '@/lib/utils'

const approved = (bill) => ['Approved', 'Paid', 'Partially Paid'].includes(bill.status)

export function BillStageActions({ bill, onOpen, isAdmin }) {
  if (!isAdmin || !bill.v2?.billing) return null
  const ledger = billLedger(bill, nullableNumber(bill.v2.billing.contractBasis))
  return <div className="flex flex-wrap gap-1.5">
    {!approved(bill) && <Button size="sm" variant="outline" onClick={() => onOpen('approve', bill)}>Approve Bill</Button>}
    {approved(bill) && <Button size="sm" variant="outline" onClick={() => onOpen('payment', bill)}>Add Payment</Button>}
    {approved(bill) && ledger.retentionHeld > 0 && <Button size="sm" variant="outline" onClick={() => onOpen('release', bill)}>Release RM</Button>}
  </div>
}

export default function BillActionDialog({ mode, bill, onClose, onCommit, otherBills = [] }) {
  const contract = nullableNumber(bill.v2?.billing?.contractBasis)
  const [gross, setGross] = useState(String(bill.approvedAmount === '' || bill.approvedAmount == null ? bill.submittedAmount ?? bill.amount ?? '' : bill.approvedAmount))
  const [rows, setRows] = useState(() => (bill.v2.billing.deductionRows || []).map((row) => ({ ...row })))
  const [advanced, setAdvanced] = useState(() => (bill.v2.billing.deductionRows || []).filter((row) => row.base && row.base !== 'approved').map((row) => row.id))
  const [payment, setPayment] = useState({ amount: '', date: '', method: 'Bank transfer', account: '', reference: '', status: 'Pending Clearance' })
  const [release, setRelease] = useState({ amount: '', date: '', account: '', reference: '' })
  const [clearance, setClearance] = useState({})
  const [reason, setReason] = useState({})
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const effective = mode === 'approve' ? { ...bill, status: 'Approved', approvedAmount: gross, v2: { ...bill.v2, billing: { ...bill.v2.billing, deductionRows: rows } } } : bill
  const ledger = billLedger(effective, contract)
  const updateRow = (id, patch) => { setRows((before) => before.map((row) => row.id === id ? { ...row, ...patch } : row)); setError('') }
  const commit = (next) => {
    if (savingRef.current) return
    const issue = validateBillingLedger(next, contract) || validateProjectReceiptReferences(next, otherBills)
    if (issue) { setError(issue); return }
    savingRef.current = true
    onCommit(next)
  }
  const save = () => {
    if (mode === 'approve') return commit(effective)
    if (mode === 'payment') {
      if (!payment.date) { setError('Payment date is required.'); return }
      if (nullableNumber(payment.amount) === null || Number(payment.amount) <= 0) { setError('Payment amount must be greater than zero.'); return }
      if (!payment.account.trim()) { setError('Bank / account is required.'); return }
      if (!payment.reference.trim()) { setError('Payment reference is required.'); return }
      return commit({ ...bill, v2: { ...bill.v2, receipts: [...(bill.v2.receipts || []), { ...payment, amount: Number(payment.amount), id: uid(), history: [{ status: payment.status, date: payment.date }] }] } })
    }
    if (!release.date) { setError('Release date is required.'); return }
    if (nullableNumber(release.amount) === null || Number(release.amount) <= 0) { setError('Release amount must be greater than zero.'); return }
    if (!release.reference.trim()) { setError('Release reference is required.'); return }
    commit({ ...bill, v2: { ...bill.v2, billing: { ...bill.v2.billing, retentionReleases: [...(bill.v2.billing.retentionReleases || []), { ...release, amount: Number(release.amount), id: uid() }] } } })
  }
  const saveClearance = (receipt) => {
    const status = clearance[receipt.id]
    if (!status || status === receipt.status) return
    try {
      const nextReceipt = transitionReceipt(receipt, status, new Date().toISOString().slice(0, 10), reason[receipt.id] || '')
      commit({ ...bill, v2: { ...bill.v2, receipts: bill.v2.receipts.map((item) => item.id === receipt.id ? nextReceipt : item) } })
    } catch (cause) { setError(cause.message) }
  }

  const title = mode === 'approve' ? 'Approve Bill' : mode === 'payment' ? 'Add Payment' : 'Release RM'
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b px-5 py-4"><DialogTitle>{title}</DialogTitle><DialogDescription>{bill.no || bill.billNo} · {billDisplayStatus(bill)}</DialogDescription></DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
        {mode === 'approve' && <>
          <Field label="Approved gross amount" type="number" min="0" value={gross} onChange={setGross} error={error.includes('Approved gross') ? error : ''} />
          {bill.v2.billing.basis === 'cumulative' && <p className="rounded-lg border p-3 text-sm">Previous certified gross: {formatCurrency(bill.v2.billing.previousCertifiedGross)} · Current approved increment: {formatCurrency(ledger.approved)}</p>}
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Deductions</h3><Button size="sm" variant="outline" onClick={() => setRows([...rows, { id: uid(), kind: 'Other', method: 'fixed', base: 'approved', rate: '', fixedAmount: '', adjustment: 0, reason: '' }])}>Add deduction</Button></div>
          {rows.map((row, index) => {
            const calculated = deductionRowAmount(row, ledger.approved, contract)
            const base = row.base === 'contract' ? contract : row.base === 'fixed' ? nullableNumber(row.baseAmount) : ledger.approved
            const rowError = error.startsWith(`Deduction ${index + 1}:`) ? error : ''
            return <div key={row.id} className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-2"><Choice label={`Deduction ${index + 1} type`} value={row.kind} values={['RM', 'SRB', 'Income Tax', 'Other']} onChange={(value) => updateRow(row.id, { kind: value })} /><Choice label={`Deduction ${index + 1} method`} value={row.method} values={['percentage', 'fixed']} onChange={(value) => updateRow(row.id, { method: value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2">{row.method === 'percentage' ? <Field label={`Deduction ${index + 1} rate %`} type="number" min="0" value={row.rate} onChange={(value) => updateRow(row.id, { rate: value })} error={rowError.includes('rate') ? rowError : ''} /> : <Field label={`Deduction ${index + 1} fixed amount`} type="number" min="0" value={row.fixedAmount} onChange={(value) => updateRow(row.id, { fixedAmount: value })} error={rowError.includes('fixed amount') ? rowError : ''} />}
                <div className="min-w-0 text-sm"><span className="text-muted-foreground">Calculated deduction</span><p className="font-semibold tabular-nums">{calculated === null ? 'Enter a valid base and rate' : formatCurrency(calculated)}</p></div></div>
              {row.method === 'percentage' && <><p className="text-sm">Base: {row.base === 'approved' ? 'Current approved gross increment' : row.base === 'contract' ? 'Contract amount' : 'Documented amount'} · {base === null ? 'Not recorded' : formatCurrency(base)}</p><Button size="sm" variant="ghost" onClick={() => setAdvanced((before) => before.includes(row.id) ? before.filter((id) => id !== row.id) : [...before, row.id])}>Change calculation base</Button>{advanced.includes(row.id) && <Choice label={`Deduction ${index + 1} base`} value={row.base} values={['approved', 'contract', 'fixed']} labels={['Current approved gross increment', 'Contract amount', 'Documented amount']} onChange={(value) => updateRow(row.id, { base: value })} />}{row.base === 'fixed' && advanced.includes(row.id) && <Field label={`Deduction ${index + 1} documented base amount`} type="number" min="0" value={row.baseAmount ?? ''} onChange={(value) => updateRow(row.id, { baseAmount: value })} />}</>}
              <div className="grid gap-3 sm:grid-cols-2"><Field label={`Deduction ${index + 1} adjustment`} type="number" value={row.adjustment ?? 0} onChange={(value) => updateRow(row.id, { adjustment: value })} /><Field label={`Deduction ${index + 1} adjustment reason`} value={row.reason || ''} onChange={(value) => updateRow(row.id, { reason: value })} /></div>
              {rowError && <p role="alert" className="text-sm text-destructive">{rowError}</p>}
              <Button size="sm" variant="ghost" onClick={() => setRows(rows.filter((item) => item.id !== row.id))}>Remove deduction</Button>
            </div>
          })}
          <div className="rounded-lg border bg-muted/20 p-3 text-sm"><p>Approved gross {formatCurrency(ledger.approved)} − deductions {ledger.deductions === null ? 'Incomplete' : formatCurrency(ledger.deductions)} = <strong>Net payable {ledger.net === null ? 'Incomplete' : formatCurrency(ledger.net)}</strong></p><p>RM held separately: {formatCurrency(ledger.retentionHeld)}</p></div>
        </>}
        {mode === 'payment' && <>
          <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2"><p>Net payable: {formatCurrency(ledger.net)}</p><p>Cleared received: {formatCurrency(ledger.received)}</p><p>Pending clearance: {formatCurrency(ledger.pending)}</p><p>Outstanding: {formatCurrency(ledger.balance)}</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Payment amount" type="number" min="0" value={payment.amount} onChange={(value) => setPayment({ ...payment, amount: value })} error={error.includes('Payment amount') ? error : ''} /><Field label="Payment date" type="date" value={payment.date} onChange={(value) => setPayment({ ...payment, date: value })} error={error.includes('Payment date') ? error : ''} /><Choice label="Method" value={payment.method} values={['Bank transfer', 'Cheque', 'Cash', 'Other']} onChange={(value) => setPayment({ ...payment, method: value })} /><Field label="Bank / account" value={payment.account} onChange={(value) => setPayment({ ...payment, account: value })} error={error.includes('Bank / account') ? error : ''} /><Field label="Payment reference" value={payment.reference} onChange={(value) => setPayment({ ...payment, reference: value })} error={error.includes('Payment reference') ? error : ''} /><Choice label="Clearance" value={payment.status} values={['Pending Clearance', 'Cleared']} onChange={(value) => setPayment({ ...payment, status: value })} /></div>
          {(bill.v2.receipts || []).length > 0 && <section className="space-y-2"><h3 className="font-semibold">Recorded payments</h3>{bill.v2.receipts.map((receipt) => <div key={receipt.id} className="space-y-2 rounded-lg border p-3 text-sm"><p>{formatDate(receipt.date)} · {formatCurrency(receipt.amount)} · {receipt.account} / {receipt.reference}</p><p>Status: {receipt.status || 'Cleared'} · {receipt.history?.length || 1} history event(s)</p>{['Pending Clearance', 'Cleared'].includes(receipt.status) && <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Choice label="Change clearance" value={clearance[receipt.id] || receipt.status} values={receipt.status === 'Pending Clearance' ? ['Pending Clearance', 'Cleared', 'Bounced', 'Cancelled'] : ['Cleared', 'Bounced', 'Cancelled']} onChange={(value) => setClearance({ ...clearance, [receipt.id]: value })} /><Field label="Reversal reason" value={reason[receipt.id] || ''} onChange={(value) => setReason({ ...reason, [receipt.id]: value })} /><Button className="self-end" variant="outline" size="sm" onClick={() => saveClearance(receipt)} disabled={!clearance[receipt.id] || clearance[receipt.id] === receipt.status}>Save clearance</Button></div>}</div>)}</section>}
        </>}
        {mode === 'release' && <><div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3"><p>RM withheld: {formatCurrency(ledger.retention)}</p><p>Released: {formatCurrency(ledger.retentionReleased)}</p><p>Remaining held: {formatCurrency(ledger.retentionHeld)}</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Release amount" type="number" min="0" value={release.amount} onChange={(value) => setRelease({ ...release, amount: value })} error={error.includes('Release amount') ? error : ''} /><Field label="Release date" type="date" value={release.date} onChange={(value) => setRelease({ ...release, date: value })} error={error.includes('Release date') ? error : ''} /><Field label="Release reference" value={release.reference} onChange={(value) => setRelease({ ...release, reference: value })} error={error.includes('Release reference') ? error : ''} /><Field label="Account (optional)" value={release.account} onChange={(value) => setRelease({ ...release, account: value })} /></div>{(bill.v2.billing.retentionReleases || []).map((item) => <p key={item.id} className="rounded-lg border p-2 text-sm">{formatDate(item.date)} · {formatCurrency(item.amount)} · {item.reference}</p>)}</>}
        {error && !error.startsWith('Deduction ') && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t bg-background px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>{mode === 'approve' ? 'Confirm Approval' : mode === 'payment' ? 'Add Payment' : 'Record RM Release'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function Field({ label, value, onChange, error, ...props }) {
  return <div className="min-w-0 space-y-1"><Label>{label}</Label><Input aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value)} {...props} className={props.type === 'date' ? 'mobile-date-input' : 'min-w-0'} />{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>
}
function Choice({ label, value, values, labels = values, onChange }) {
  return <div className="min-w-0 space-y-1"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{values.map((item, index) => <SelectItem key={item} value={item}>{labels[index]}</SelectItem>)}</SelectContent></Select></div>
}
