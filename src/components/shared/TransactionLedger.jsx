import { useState } from 'react'
import { uid, formatCurrency, formatDate } from '@/lib/utils'
import { validateEvents } from '@/lib/financials'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function TransactionLedger({ title, events = [], onChange, limit, disabled = false }) {
  const [draft, setDraft] = useState({ date: '', amount: '', account: '', method: '', reference: '' })
  const [error, setError] = useState('')
  const idPrefix = title.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const add = () => {
    const next = [...events, { ...draft, id: uid(), amount: Number(draft.amount) }]
    const issue = validateEvents(next, limit)
    if (issue) { setError(issue); return }
    onChange(next)
    setDraft({ date: '', amount: '', account: '', method: '', reference: '' })
    setError('')
  }
  const total = events.reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
  return <div className="rounded-xl border p-3 space-y-3">
    <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{title}</p><span className="whitespace-nowrap font-mono text-sm tabular-nums">{formatCurrency(total)}</span></div>
    {events.map((event) => <div key={event.id} className="flex items-center justify-between gap-2 border-t py-2 text-xs">
      <span>{formatDate(event.date)} · {event.account} · {event.reference}</span>
      <span className="whitespace-nowrap font-mono tabular-nums">{formatCurrency(event.amount)}</span>
      {!disabled && <Button variant="ghost" size="sm" onClick={() => onChange(events.filter((row) => row.id !== event.id))} aria-label={`Remove transaction ${event.reference}`}>Remove</Button>}
    </div>)}
    {!disabled && <div className="grid grid-cols-2 gap-2">
      <div><Label htmlFor={`${idPrefix}-date`}>Date</Label><Input id={`${idPrefix}-date`} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
      <div><Label htmlFor={`${idPrefix}-amount`}>Transaction value</Label><Input id={`${idPrefix}-amount`} type="number" min="0.01" step="0.01" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></div>
      <div><Label htmlFor={`${idPrefix}-account`}>Account</Label><Input id={`${idPrefix}-account`} value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })} /></div>
      <div><Label htmlFor={`${idPrefix}-reference`}>Bank / cash reference</Label><Input id={`${idPrefix}-reference`} value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} /></div>
      <div className="col-span-2"><Label htmlFor={`${idPrefix}-method`}>Method</Label><Input id={`${idPrefix}-method`} value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} placeholder="Bank transfer, cash, cheque…" /></div>
      <Button className="col-span-2" variant="outline" onClick={add}>Add transaction</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
