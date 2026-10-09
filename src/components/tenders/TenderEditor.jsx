import { Link } from 'react-router-dom'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { calculateTenderFinancials, formatCurrencyPrecise, TENDER_STATUSES } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function Section({ number, title, description, children }) {
  return <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
    <div className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">{number}</span><div className="min-w-0"><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{description}</p></div></div>
    {children}
  </section>
}

function Field({ id, label, required = false, error, hint, ...props }) {
  return <div className="min-w-0 space-y-1.5">
    <Label htmlFor={id}>{label}{required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}</Label>
    <Input id={id} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props} />
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
    {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
  </div>
}

export default function TenderEditor({ form, setF, errors, extraOpen, setExtraOpen, editItem }) {
  const financials = calculateTenderFinancials(form)
  const direction = financials.direction === 'below' ? 'Below' : financials.direction === 'above' ? 'Above' : financials.direction === 'at' ? 'At' : ''

  return <div className="space-y-3">
    <Section number="1" title="Tender Details" description="The recorded title and submission deadline.">
      <Field id="t-name" label="Tender Name" required value={form.name || ''} onChange={setF('name')} error={errors.name} placeholder="Tender title" />
      <Field id="t-sub" label="Tender Due Date / Bid Submission Deadline" type="date" className="mobile-date-input" value={form.submissionDate || ''} onChange={setF('submissionDate')} />
    </Section>

    <Section number="2" title="Agency & References" description="Keep the agency, NIT and linked pay order reference together.">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field id="t-agency" label="Procuring Agency" value={form.agency || ''} onChange={setF('agency')} />
        <Field id="t-nit" label="NIT / Reference" value={form.nit || ''} onChange={setF('nit')} className="font-mono" />
        <Field id="t-po" label="Linked Pay Order" value={form.linkedPO || ''} onChange={setF('linkedPO')} className="font-mono" />
      </div>
    </Section>

    <Section number="3" title="Amounts & Bid Details" description="Tender value, department estimate and submitted quote remain separate entries.">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field id="t-value" label={editItem ? 'Legacy Tender Value (PKR)' : 'Tender Value (PKR)'} required type="number" min="0" step="0.01" value={form.value ?? ''} onChange={setF('value')} error={errors.value} className="tabular-nums" hint={`${formatCurrencyPrecise(form.value, 0)} · The awarded contract is recorded separately in Award / Work Order.`} />
        <Field id="t-fee" label="Tender Fee (PKR)" type="number" min="0" step="0.01" value={form.tenderFee ?? ''} onChange={setF('tenderFee')} error={errors.tenderFee} className="tabular-nums" hint="Saved with the existing Tender Fees expense sync." />
        <Field id="t-estimated-cost" label="Estimated Cost (PKR)" type="number" min="0" step="0.01" value={form.estimatedCost ?? ''} onChange={setF('estimatedCost')} error={errors.estimatedCost} className="tabular-nums" hint="Official department / NIT estimate." />
        <Field id="t-quoted-amount" label="Quoted Amount (PKR)" type="number" min="0" step="0.01" value={form.quotedAmount ?? ''} onChange={setF('quotedAmount')} error={errors.quotedAmount} className="tabular-nums" hint="Submitted financial bid." />
      </div>
      <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-3">
        <div><span className="block text-muted-foreground">Difference</span><strong className="tabular-nums">{financials.difference === null ? '—' : `${formatCurrencyPrecise(financials.difference, 2)} ${direction}`}</strong></div>
        <div><span className="block text-muted-foreground">Quoted %</span><strong className="tabular-nums">{financials.percentage === null ? '—' : `${financials.percentage.toFixed(2)}% ${direction}`}</strong></div>
        <div><span className="block text-muted-foreground">Bid position</span><strong>{financials.positionLabel}</strong></div>
      </div>
      {editItem && <Button asChild type="button" variant="outline" size="sm"><Link to={`/tenders/${editItem.id}`}>Open award, work order, BOQ and documents <ExternalLink className="h-3.5 w-3.5" /></Link></Button>}
    </Section>

    <Section number="4" title="Status & Dates" description="Tender stage is separate from execution progress on the project detail page.">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="t-status">Status</Label><Select value={form.status} onValueChange={setF('status')}><SelectTrigger id="t-status"><SelectValue /></SelectTrigger><SelectContent>{TENDER_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>{errors.status && <p role="alert" className="text-xs text-destructive">{errors.status}</p>}</div>
        <Field id="t-open" label="Opening Date" type="date" className="mobile-date-input" value={form.openingDate || ''} onChange={setF('openingDate')} />
      </div>
    </Section>

    <Section number="5" title="Additional Details" description="Optional contact and notes stay with this tender.">
      <button type="button" aria-expanded={extraOpen} onClick={() => setExtraOpen(!extraOpen)} className="flex w-full items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-left text-sm hover:bg-accent"><span>{extraOpen ? 'Hide contact and notes' : 'Show contact and notes'}</span><ChevronDown className={`h-4 w-4 transition-transform ${extraOpen ? 'rotate-180' : ''}`} /></button>
      {extraOpen && <div className="space-y-3"><Field id="t-contact" label="Contact" value={form.contact || ''} onChange={setF('contact')} /><div className="space-y-1.5"><Label htmlFor="t-notes">Notes</Label><Textarea id="t-notes" value={form.notes || ''} onChange={setF('notes')} rows={4} /></div></div>}
    </Section>
  </div>
}
