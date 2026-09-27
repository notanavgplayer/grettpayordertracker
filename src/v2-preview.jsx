import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Landmark, Receipt, Wallet, BriefcaseBusiness, ArrowUpRight, CalendarClock } from 'lucide-react'
import { projectFinancials, securityAmounts } from './lib/financials'
import { formatCurrency } from './lib/utils'
import KpiCard from './components/shared/KpiCard'
import TransactionLedger from './components/shared/TransactionLedger'
import './index.css'

function Preview() {
  const [dark, setDark] = useState(false)
  const [tab, setTab] = useState('Overview')
  const [payments, setPayments] = useState([{ id: 'test-payment', date: '2026-09-25', amount: 120000, account: 'Demo account', method: 'Bank', reference: 'DEMO-01' }])
  const [refunds, setRefunds] = useState([{ id: 'test-refund', date: '2026-09-24', amount: 10000, account: 'Demo account', method: 'Bank', reference: 'DEMO-R1' }])
  const tender = { id: 'demo-project', status: 'In Progress', name: 'Sample roadworks project', value: 7302671,
    bills: [{ amount: 800000, approvedAmount: 760000, v2: { receipts: [{ amount: 300000 }], deductions: { retention: 30000, tax: 20000 } } }] }
  const expense = { tenderRef: tender.id, amount: 578260, v2: { kind: 'cost', payee: 'Sample supplier', payments, boqItemId: 'BOQ-1' } }
  const metrics = projectFinancials(tender, [expense])
  const po = { amount: 61000, status: 'Held', v2: { instrument: 'pay-order', refunds, followUpDate: '2026-09-27' } }
  const security = securityAmounts(po)
  return <div className={dark ? 'dark' : ''}><div className="min-h-screen bg-background text-foreground">
    <header className="border-b bg-card"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white">G</span><div><strong className="text-sm tracking-wide">GRETT ENGINEERING</strong><p className="text-xs text-muted-foreground">Version 2 · disposable data preview</p></div></div><button onClick={() => setDark(!dark)} className="rounded-lg border px-3 py-2 text-sm">{dark ? 'Light theme' : 'Dark theme'}</button></div></header>
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Project workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{tender.name}</h1><p className="mt-1 text-sm text-muted-foreground">In progress · Illustrative figures only</p></div><span className="rounded-full border bg-card px-3 py-1 text-sm">NIT DEMO-2026</span></div>
      <nav className="flex gap-2 overflow-x-auto border-b pb-2" aria-label="Project sections">{['Overview','Costs & Suppliers','Bills & Receipts','Securities'].map((name) => <button key={name} onClick={() => setTab(name)} className={`shrink-0 rounded-lg px-3 py-2 text-sm ${tab === name ? 'bg-emerald-700 text-white' : 'bg-card hover:bg-muted'}`}>{name}</button>)}</nav>
      {tab === 'Overview' && <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard icon={BriefcaseBusiness} label="Awarded contract" value={formatCurrency(metrics.contract)} helper="Revised value used when entered" /><KpiCard icon={Receipt} label="Costs recorded" value={formatCurrency(metrics.incurred)} helper="Excludes deposits and transfers" tone="amber" /><KpiCard icon={Wallet} label="Approved bills outstanding" value={formatCurrency(metrics.outstanding)} helper="After receipts and deductions" tone="blue" /><KpiCard icon={CalendarClock} label="Forecast profit" value="Forecast incomplete" helper="Remaining cost estimate needed" tone="slate" /></section><div className="grid gap-4 lg:grid-cols-3"><div className="rounded-xl border bg-card p-5 lg:col-span-2"><h2 className="text-lg font-semibold">Financial position</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{[['Unbilled contract',metrics.unbilled],['Bill receipts',metrics.received],['Known supplier payable',metrics.payable],['Cash movement',metrics.cash]].map(([label,value]) => <div key={label} className="flex items-center justify-between gap-4 border-b py-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="overflow-x-auto whitespace-nowrap font-mono font-semibold tabular-nums">{formatCurrency(value)}</span></div>)}</div></div><div className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Next actions</h2><p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Set the remaining cost forecast before relying on a project margin.</p><p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">Security refund follow-up is scheduled for 27 Sep.</p></div></div></>}
      {tab === 'Costs & Suppliers' && <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Sample supplier bill</h2><p className="mt-1 text-sm text-muted-foreground">BOQ-1 allocation · cost counted once</p><div className="mt-4 grid grid-cols-2 gap-3"><KpiCard icon={Receipt} label="Incurred" value={formatCurrency(expense.amount)} /><KpiCard icon={Wallet} label="Payable" value={formatCurrency(metrics.payable)} tone="amber" /></div></div><TransactionLedger title="Payments" events={payments} limit={expense.amount} onChange={setPayments} /></div>}
      {tab === 'Bills & Receipts' && <div className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Running bill · DEMO-01</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><KpiCard label="Submitted" value={formatCurrency(800000)} /><KpiCard label="Approved" value={formatCurrency(760000)} /><KpiCard label="Outstanding" value={formatCurrency(metrics.outstanding)} tone="amber" /></div><p className="mt-4 text-sm text-muted-foreground">Receipt: {formatCurrency(300000)} · Retention: {formatCurrency(30000)} · Tax withheld: {formatCurrency(20000)}</p></div>}
      {tab === 'Securities' && <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Bid security · DEMO-PO</h2><div className="mt-4 grid grid-cols-2 gap-3"><KpiCard icon={Landmark} label="Funded cash" value={formatCurrency(security.funded)} /><KpiCard icon={ArrowUpRight} label="Still held" value={formatCurrency(security.remaining)} tone="amber" /></div><p className="mt-3 text-sm text-muted-foreground">Held requires follow-up. The amount falls only when a refund receipt is recorded.</p></div><TransactionLedger title="Refund receipts" events={refunds} limit={po.amount} onChange={setRefunds} /></div>}
      <p className="text-xs text-muted-foreground">This preview uses disposable local state. Saving and refreshing do not change business records.</p>
    </main>
  </div></div>
}

createRoot(document.getElementById('root')).render(<Preview />)

export default Preview
