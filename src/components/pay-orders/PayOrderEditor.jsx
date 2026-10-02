import { useId } from 'react'
import { formatCurrency, PO_PURPOSES, PO_STATUSES, BID_RESULTS } from '@/lib/utils'
import { securityAmounts } from '@/lib/financials'
import TransactionLedger from '@/components/shared/TransactionLedger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, Search } from 'lucide-react'

function EditorField({ label, value, onChange, type = 'text', error, ...props }) {
  const id = useId()
  return <div className="min-w-0 space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} type={type} value={value ?? ''} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}

function Section({ number, title, description, children }) {
  return <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
    <div className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">{number}</span><div><h3 className="text-sm font-semibold text-foreground">{title}</h3><p className="text-xs text-muted-foreground">{description}</p></div></div>
    {children}
  </section>
}

export default function PayOrderEditor({ form, setForm, setF, tenderMode, setTenderMode, tenders, tenderSearch, setTenderSearch, newTenderFields, setNewTenderFields, selectTender, banks, setAddBankOpen, setNewBankName, errors, clearError = () => {}, extraOpen, setExtraOpen, refundOpen, setRefundOpen, editItem }) {
  const v2 = form.v2 || {}
  const setV2 = (key, value) => { setForm((previous) => ({ ...previous, v2: { ...previous.v2, [key]: value } })); clearError(key === 'refunds' ? 'refunds' : key) }
  const amounts = securityAmounts(form)
  const selected = tenders.find((item) => item.id === form.tenderRef)
  const matches = tenderSearch.trim() ? tenders.filter((item) => [item.name, item.nit, item.agency].some((value) => (value || '').toLowerCase().includes(tenderSearch.trim().toLowerCase()))).slice(0, 8) : []
  const dateField = (key, label) => <EditorField key={key} label={label} type="date" value={v2[key]} onChange={(event) => setV2(key, event.target.value)} />
  const statusSelect = (id, label, value, onChange, options) => <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...options, ...(value && !options.includes(value) ? [value] : [])])].map((option) => <SelectItem key={option} value={option}>{option === 'pay-order' ? 'Pay order / cash deposit' : option === 'guarantee' ? 'Bank guarantee' : option}</SelectItem>)}</SelectContent></Select></div>

  return <div className="space-y-3">
    <Section number="1" title="Project Link" description="Link this instrument to an existing project or keep it standalone.">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Project link mode">
        {[['existing', 'Existing project'], ['none', 'Standalone'], ['new', 'Create new project']].map(([mode, label]) => <button key={mode} type="button" aria-pressed={tenderMode === mode} onClick={() => setTenderMode(mode)} className={`min-h-11 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${tenderMode === mode ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'border-border hover:bg-accent'}`}>{label}</button>)}
      </div>
      {tenderMode === 'existing' && <div className="space-y-2">
        {selected ? <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 p-2"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{selected.name || 'Untitled project'}</p><p className="break-words text-xs text-muted-foreground">{selected.nit || 'No NIT'}{selected.agency ? ` · ${selected.agency}` : ''}</p></div><Button type="button" variant="outline" size="sm" onClick={() => { setForm((current) => ({ ...current, tenderRef: '', nit: current.nit === selected.nit ? '' : current.nit, agency: current.agency === selected.agency ? '' : current.agency })); setTenderSearch('') }}>Change</Button></div> : <><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search projects" value={tenderSearch} onChange={(event) => setTenderSearch(event.target.value)} placeholder="Search projects by name, NIT or agency" className="pl-9" /></div>{tenderSearch && <div className="max-h-44 overflow-y-auto rounded-lg border">{matches.length ? matches.map((item) => <button key={item.id} type="button" onClick={() => selectTender(item)} className="block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-accent"><span className="block break-words text-sm font-medium">{item.name || 'Untitled project'}</span><span className="block text-xs text-muted-foreground">{item.nit || 'No NIT'} · {item.agency || 'No agency'}</span></button>) : <p className="p-3 text-xs text-muted-foreground">No matching projects.</p>}</div>}</>}
        {errors.project && <p role="alert" className="text-xs text-destructive">{errors.project}</p>}
      </div>}
      {tenderMode === 'new' && <div className="space-y-3"><EditorField label="Project name" value={newTenderFields.name} onChange={(event) => setNewTenderFields((previous) => ({ ...previous, name: event.target.value }))} error={errors.project} /><div className="grid gap-3 sm:grid-cols-2"><EditorField label="Project NIT" value={newTenderFields.nit} onChange={(event) => setNewTenderFields((previous) => ({ ...previous, nit: event.target.value }))} /><EditorField label="Project agency" value={newTenderFields.agency} onChange={(event) => setNewTenderFields((previous) => ({ ...previous, agency: event.target.value }))} /></div><p className="text-xs text-muted-foreground">The project is created only when you save this pay order.</p></div>}
      {tenderMode === 'none' && <EditorField label="Project / tender name (optional)" value={form.tender} onChange={setF('tender')} />}
      {tenderMode !== 'new' && <div className="grid gap-3 sm:grid-cols-2"><EditorField label="NIT / Reference" value={form.nit} onChange={setF('nit')} /><EditorField label="Agency" value={form.agency} onChange={setF('agency')} /></div>}
    </Section>

    <Section number="2" title="Instrument & Funding" description="Face value and funded cash are recorded separately.">
      <div className="grid gap-3 sm:grid-cols-2">
        {statusSelect('po-instrument', 'Instrument type', v2.instrument || 'pay-order', (value) => setV2('instrument', value), ['pay-order', 'guarantee'])}
        {statusSelect('po-purpose', 'Purpose', form.purpose || 'Bid Security', setF('purpose'), PO_PURPOSES)}
        <EditorField label="PO / Instrument Number" value={form.po} onChange={setF('po')} error={errors.po} />
        <div className="space-y-1.5"><Label htmlFor="po-bank">Bank</Label><Select value={form.bank} onValueChange={(value) => { if (value === '__add_bank__') { setNewBankName(''); setAddBankOpen(true) } else setForm((previous) => ({ ...previous, bank: value })) }}><SelectTrigger id="po-bank"><SelectValue placeholder="Select bank" /></SelectTrigger><SelectContent>{banks.map((bank) => <SelectItem key={bank.id} value={bank.name}>{bank.name}</SelectItem>)}{form.bank && !banks.some((bank) => bank.name === form.bank) && <SelectItem value={form.bank}>{form.bank} (saved)</SelectItem>}<SelectItem value="__add_bank__">+ Add Bank</SelectItem></SelectContent></Select></div>
        <EditorField label="Instrument Amount (PKR)" type="number" min="0" step="0.01" value={form.amount} onChange={setF('amount')} error={errors.amount} className="tabular-nums" />
        <EditorField label={v2.instrument === 'guarantee' ? 'Guarantee Margin Funded (PKR)' : 'Cash Funded (PKR)'} type="number" min="0" step="0.01" value={v2.fundedCash} onChange={(event) => setV2('fundedCash', event.target.value)} error={errors.fundedCash} className="tabular-nums" />
        <EditorField label="Beneficiary" value={v2.beneficiary} onChange={(event) => setV2('beneficiary', event.target.value)} />
        {dateField('issueDate', 'Issue date')}
      </div>
      <p className="text-xs text-muted-foreground">{v2.instrument === 'guarantee' ? 'Guarantee face value is exposure; cash margin may be unknown until entered.' : 'Cash funded is separate from instrument face value.'}</p>
    </Section>

    <Section number="3" title="Status & Dates" description="Current status and the recorded dates for this instrument.">
      <div className="grid gap-3 sm:grid-cols-3">{statusSelect('po-status', 'Status', form.status, setF('status'), PO_STATUSES)}{statusSelect('po-result', 'Bid result', form.bidResult, setF('bidResult'), BID_RESULTS)}<EditorField label="Date submitted" type="date" value={form.submitted} onChange={setF('submitted')} /></div>
      <button type="button" aria-expanded={extraOpen} onClick={() => setExtraOpen(!extraOpen)} className="flex w-full items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-left text-sm hover:bg-accent"><span>Additional dates & notes</span><ChevronDown className={`h-4 w-4 transition-transform ${extraOpen ? 'rotate-180' : ''}`} /></button>
      {extraOpen && <div className="grid gap-3 sm:grid-cols-2">{dateField('expiryDate', 'Expiry date')}{dateField('eligibilityDate', 'Refund eligibility date')}{dateField('applicationDate', 'Application date')}{dateField('followUpDate', 'Next follow-up')}<div className="space-y-1.5 sm:col-span-2"><Label htmlFor="po-notes">Notes</Label><Textarea id="po-notes" value={form.notes || ''} onChange={setF('notes')} rows={3} /></div></div>}
    </Section>

    <Section number="4" title="Refunds" description="Record only cash actually received; a status change is not a refund.">
      <button type="button" aria-expanded={refundOpen} onClick={() => setRefundOpen(!refundOpen)} className="flex w-full items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-left text-sm hover:bg-accent"><span>{editItem && v2.refunds?.length ? `${v2.refunds.length} recorded refund receipt${v2.refunds.length === 1 ? '' : 's'}` : 'Record an existing refund'}</span><ChevronDown className={`h-4 w-4 transition-transform ${refundOpen ? 'rotate-180' : ''}`} /></button>
      {refundOpen && <TransactionLedger title="Refund receipts" amountLabel="Refund Amount" addLabel="Add Refund Receipt" events={v2.refunds || []} limit={amounts.funded ?? 0} onChange={(events) => setV2('refunds', events)} />}
      {errors.refunds && <p role="alert" className="text-xs text-destructive">{errors.refunds}</p>}
      <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-3"><div><span className="block text-muted-foreground">Known cash remaining</span><strong className="whitespace-nowrap tabular-nums">{['Encashed', 'Forfeited'].includes(form.status) ? 'Needs reconciliation' : amounts.remaining === null ? 'Unknown' : formatCurrency(amounts.remaining)}</strong></div><div><span className="block text-muted-foreground">Recorded refunds</span><strong className="whitespace-nowrap tabular-nums">{formatCurrency(amounts.refunded)}</strong></div><div><span className="block text-muted-foreground">Guarantee exposure</span><strong className="whitespace-nowrap tabular-nums">{formatCurrency(amounts.exposure)}</strong></div></div>
    </Section>
  </div>
}
