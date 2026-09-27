import { securityAmounts } from '@/lib/financials'
import { formatCurrency } from '@/lib/utils'
import TransactionLedger from './TransactionLedger'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function SecurityFields({ form, setV2 }) {
  const v2 = form.v2 || {}
  const amounts = securityAmounts(form)
  const field = (key, label, type = 'text') => <div key={key} className="space-y-1"><Label htmlFor={`security-${key}`}>{label}</Label><Input id={`security-${key}`} type={type} value={v2[key] ?? ''} onChange={(event) => setV2(key, event.target.value)} /></div>
  return <div className="space-y-3 rounded-xl border p-3">
    <div><p className="text-sm font-semibold">Security and refund tracking</p><p className="text-xs text-muted-foreground">Returned means the instrument came back; Released ends a guarantee. Record a refund receipt to reduce cash held. Encashed means the beneficiary drew the instrument.</p></div>
    <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="security-instrument">Instrument</Label><Select value={v2.instrument || 'pay-order'} onValueChange={(value) => setV2('instrument', value)}><SelectTrigger id="security-instrument"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pay-order">Pay order / cash deposit</SelectItem><SelectItem value="guarantee">Bank guarantee</SelectItem></SelectContent></Select></div>{field('fundedCash', 'Cash funded / margin (PKR)', 'number')}</div>
    <div className="grid grid-cols-2 gap-2">{field('beneficiary', 'Beneficiary')}{field('issueDate', 'Issue date', 'date')}{field('expiryDate', 'Expiry date', 'date')}{field('eligibilityDate', 'Refund eligibility date', 'date')}{field('applicationDate', 'Application date', 'date')}{field('followUpDate', 'Next follow-up', 'date')}</div>
    <TransactionLedger title="Refund receipts" events={v2.refunds || []} limit={amounts.funded ?? 0} onChange={(events) => setV2('refunds', events)} />
    <p className="text-xs text-muted-foreground">Remaining cash held: {amounts.remaining === null ? 'Unknown funded amount' : formatCurrency(amounts.remaining)} · Guarantee exposure: {formatCurrency(amounts.exposure)}</p>
  </div>
}
