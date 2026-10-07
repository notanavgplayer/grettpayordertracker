import { useState } from 'react'
import { uid, formatCurrency, formatDate } from '@/lib/utils'
import { billLedger, deductionRowAmount, transitionReceipt, validateBillingLedger } from '@/lib/billingLedger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const emptyReceipt = { date: '', amount: '', account: '', reference: '', method: 'Bank transfer', status: 'Pending Clearance' }
const emptyRelease = { date: '', amount: '', account: '', reference: '' }

function Choice({ label, value, values, onChange, disabled }) {
  return <div className="min-w-0 space-y-1"><Label>{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{values.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
}

function Entry({ label, value, onChange, type = 'text', disabled, min }) {
  return <div className="min-w-0 space-y-1"><Label>{label}</Label><Input aria-label={label} type={type} min={min} step={type === 'number' ? '0.01' : undefined} value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={type === 'date' ? 'mobile-date-input' : ''} /></div>
}

export default function BillWorkflowFields({ form, setField, original, isAdmin, contract }) {
  const [receiptDraft, setReceiptDraft] = useState(emptyReceipt)
  const [releaseDraft, setReleaseDraft] = useState(emptyRelease)
  const [error, setError] = useState('')
  const billing = form.v2?.billing
  if (!billing) return <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Legacy bill: gross/net basis and receipt history remain unverified. Existing totals are preserved. Create new bills with the verified workflow; reconcile this bill from source documents before conversion.</p>

  const updateV2 = (patch) => setField('v2')({ ...form.v2, ...patch })
  const updateBilling = (patch) => updateV2({ billing: { ...billing, ...patch } })
  const ledger = billLedger(form, contract)
  const lockedBase = Boolean(original && (original.v2?.receipts?.length || original.v2?.billing?.retentionReleases?.length || Number(original.receivedAmount) > 0))
  const updateRow = (id, patch) => updateBilling({ deductionRows: billing.deductionRows.map((row) => row.id === id ? { ...row, ...patch } : row) })
  const checkAndSet = (patch) => {
    const next = { ...form, v2: { ...form.v2, ...patch } }
    const issue = validateBillingLedger(next, contract)
    if (issue) { setError(issue); return false }
    updateV2(patch); setError(''); return true
  }
  const addReceipt = () => {
    const next = [...(form.v2.receipts || []), { ...receiptDraft, amount: Number(receiptDraft.amount), id: uid(), history: [{ status: receiptDraft.status, date: receiptDraft.date }] }]
    if (checkAndSet({ receipts: next })) setReceiptDraft(emptyReceipt)
  }
  const changeReceiptStatus = (receipt, status) => {
    if ((receipt.status || 'Cleared') === status) return
    const reason = ['Bounced', 'Cancelled'].includes(status) ? window.prompt('Record the reversal reason') : ''
    if (reason === null) return
    try {
      const next = form.v2.receipts.map((item) => item.id === receipt.id ? transitionReceipt(item, status, new Date().toISOString().slice(0, 10), reason) : item)
      checkAndSet({ receipts: next })
    } catch (cause) { setError(cause.message) }
  }
  const addRelease = () => {
    const next = [...(billing.retentionReleases || []), { ...releaseDraft, amount: Number(releaseDraft.amount), id: uid() }]
    if (checkAndSet({ billing: { ...billing, retentionReleases: next } })) setReleaseDraft(emptyRelease)
  }

  return <div className="space-y-4 sm:col-span-2">
    <section className="space-y-3 rounded-xl border p-3">
      <h3 className="text-sm font-semibold">Gross bill basis</h3>
      <Choice label="Bill amount basis" value={billing.basis} values={['incremental', 'cumulative']} onChange={(basis) => updateBilling({ basis })} disabled={!isAdmin || lockedBase} />
      {billing.basis === 'cumulative' && <Entry label="Previous certified gross (PKR)" type="number" min="0" value={billing.previousCertifiedGross} onChange={(value) => updateBilling({ previousCertifiedGross: value })} disabled={!isAdmin || lockedBase} />}
      <p className="text-xs text-muted-foreground">Submitted and approved fields above are gross. Cumulative bills contribute only the amount above previous certified gross. Contract basis captured for these deductions: {formatCurrency(billing.contractBasis)}.</p>
      <p className="text-sm">Current approved gross increment: <strong>{formatCurrency(ledger.approved)}</strong></p>
    </section>

    <section className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Approved deduction rows</h3><Button type="button" size="sm" variant="outline" disabled={!isAdmin || lockedBase} onClick={() => updateBilling({ deductionRows: [...billing.deductionRows, { id: uid(), kind: 'Other', method: 'fixed', base: 'approved', rate: '', fixedAmount: '', adjustment: 0, reason: '' }] })}>Add deduction</Button></div>
      {billing.deductionRows.map((row) => <div key={row.id} className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <Choice label="Kind" value={row.kind} values={['RM', 'SRB', 'Income Tax', 'Other']} onChange={(value) => updateRow(row.id, { kind: value })} disabled={!isAdmin || lockedBase} />
          <Choice label="Method" value={row.method} values={['percentage', 'fixed']} onChange={(value) => updateRow(row.id, { method: value })} disabled={!isAdmin || lockedBase} />
          {row.method === 'percentage' && <Choice label="Calculation base" value={row.base} values={['approved', 'contract', 'fixed']} onChange={(value) => updateRow(row.id, { base: value })} disabled={!isAdmin || lockedBase} />}
          {row.method === 'percentage' ? <Entry label="Rate %" type="number" min="0" value={row.rate} onChange={(value) => updateRow(row.id, { rate: value })} disabled={!isAdmin || lockedBase} /> : <Entry label="Fixed amount" type="number" min="0" value={row.fixedAmount} onChange={(value) => updateRow(row.id, { fixedAmount: value })} disabled={!isAdmin || lockedBase} />}
          {row.method === 'percentage' && row.base === 'fixed' && <Entry label="Documented base amount" type="number" min="0" value={row.baseAmount} onChange={(value) => updateRow(row.id, { baseAmount: value })} disabled={!isAdmin || lockedBase} />}
          <Entry label="Adjustment (+/-)" type="number" value={row.adjustment} onChange={(value) => updateRow(row.id, { adjustment: value })} disabled={!isAdmin || lockedBase} />
          <Entry label="Adjustment reason" value={row.reason} onChange={(value) => updateRow(row.id, { reason: value })} disabled={!isAdmin || lockedBase} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs"><span>Calculated: {formatCurrency(deductionRowAmount(row, ledger.approved, contract))}</span><Button type="button" variant="ghost" size="sm" disabled={!isAdmin || lockedBase} onClick={() => updateBilling({ deductionRows: billing.deductionRows.filter((item) => item.id !== row.id) })}>Remove</Button></div>
      </div>)}
      <p className="text-sm">Deductions: <strong>{formatCurrency(ledger.deductions)}</strong> · Net payable: <strong>{formatCurrency(ledger.net)}</strong> · RM held: <strong>{formatCurrency(ledger.retentionHeld)}</strong></p>
    </section>

    <section className="space-y-3 rounded-xl border p-3">
      <h3 className="text-sm font-semibold">Receipts and clearance</h3>
      {(form.v2.receipts || []).map((receipt) => <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs"><span>{formatDate(receipt.date)} · {receipt.account} · {receipt.reference} · {formatCurrency(receipt.amount)}</span><Choice label="Clearance" value={receipt.status || 'Cleared'} values={(receipt.status || 'Cleared') === 'Pending Clearance' ? ['Pending Clearance', 'Cleared', 'Bounced', 'Cancelled'] : (receipt.status || 'Cleared') === 'Cleared' ? ['Cleared', 'Bounced', 'Cancelled'] : [receipt.status]} onChange={(status) => changeReceiptStatus(receipt, status)} disabled={!isAdmin || ['Bounced', 'Cancelled'].includes(receipt.status)} /><span>{(receipt.history || []).map((event) => `${event.status} ${event.date}${event.reason ? ` (${event.reason})` : ''}`).join(' → ')}</span></div>)}
      {isAdmin && <div className="grid gap-2 sm:grid-cols-3"><Entry label="Receipt date" type="date" value={receiptDraft.date} onChange={(value) => setReceiptDraft({ ...receiptDraft, date: value })} /><Entry label="Receipt amount" type="number" min="0.01" value={receiptDraft.amount} onChange={(value) => setReceiptDraft({ ...receiptDraft, amount: value })} /><Entry label="Bank / account" value={receiptDraft.account} onChange={(value) => setReceiptDraft({ ...receiptDraft, account: value })} /><Entry label="Receipt reference" value={receiptDraft.reference} onChange={(value) => setReceiptDraft({ ...receiptDraft, reference: value })} /><Choice label="Method" value={receiptDraft.method} values={['Bank transfer', 'Cheque', 'Cash', 'Other']} onChange={(value) => setReceiptDraft({ ...receiptDraft, method: value })} /><Choice label="Clearance" value={receiptDraft.status} values={['Pending Clearance', 'Cleared']} onChange={(value) => setReceiptDraft({ ...receiptDraft, status: value })} /><Button type="button" variant="outline" onClick={addReceipt}>Add receipt</Button></div>}
      <p className="text-sm">Pending: {formatCurrency(ledger.pending)} · Cleared: {formatCurrency(ledger.received)} · Outstanding: {formatCurrency(ledger.balance)}</p>
    </section>

    <section className="space-y-3 rounded-xl border p-3">
      <h3 className="text-sm font-semibold">RM release history</h3>
      {(billing.retentionReleases || []).map((release) => <p key={release.id} className="text-xs">{formatDate(release.date)} · {release.account} · {release.reference} · {formatCurrency(release.amount)}</p>)}
      {isAdmin && <div className="grid gap-2 sm:grid-cols-3"><Entry label="Release date" type="date" value={releaseDraft.date} onChange={(value) => setReleaseDraft({ ...releaseDraft, date: value })} /><Entry label="Release amount" type="number" min="0.01" value={releaseDraft.amount} onChange={(value) => setReleaseDraft({ ...releaseDraft, amount: value })} /><Entry label="Release account" value={releaseDraft.account} onChange={(value) => setReleaseDraft({ ...releaseDraft, account: value })} /><Entry label="Release reference" value={releaseDraft.reference} onChange={(value) => setReleaseDraft({ ...releaseDraft, reference: value })} /><Button type="button" variant="outline" onClick={addRelease}>Record RM release</Button></div>}
      <p className="text-xs text-muted-foreground">RM release changes held retention, not the original bill net or ordinary bill receipts.</p>
    </section>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
