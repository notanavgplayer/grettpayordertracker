import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { AlertTriangle, ArrowRight, CalendarDays, ClipboardList, FileText, Landmark, Plus, ShieldCheck, BriefcaseBusiness } from 'lucide-react'
import { toast } from 'sonner'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { DashboardEmpty, DashboardSection, DashboardStatCard } from '@/components/dashboard/DashboardCards'
import LoadState from '@/components/shared/LoadState'
import { MetricRowSkeleton } from '@/components/shared/LoadingSkeletons'
import StatusBadge from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { expenseAmounts, projectFinancials, securityAmounts } from '@/lib/financials'
import { getAtRiskPayOrders, getSecurityFollowUps } from '@/lib/payOrderMetrics'
import { daysUntil, formatCurrency, isActionableTenderStatus, isTaskDone, sortByField } from '@/lib/utils'

const PROJECT_STATES = new Set(['Awarded', 'In Progress', 'On Hold'])
const WON_STATES = new Set(['Awarded', 'In Progress', 'Completed'])

function asDate(value) {
  if (value?.toDate) return value.toDate()
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function dateLabel(value) {
  const date = asDate(value)
  return date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

function activityTitle(log, payOrders) {
  const title = String(log.title || '').trim()
  if (title && !/^\d+$/.test(title)) return title
  if (log.type === 'payOrder') {
    const po = payOrders.find((item) => item.id === log.entityId)
    if (po?.po) return `Pay Order ${po.po} ${(log.action || 'updated').toLowerCase()}`
  }
  const type = log.type ? activityTypeLabel(log.type) : 'Record'
  return type.charAt(0).toUpperCase() + type.slice(1) + ' ' + (log.action || 'updated').toLowerCase()
}

function activityTypeLabel(type) {
  return type === 'payOrder' ? 'Pay Order' : type === 'todo' ? 'Task' : type || 'Activity'
}

function activityLink(log, tenders, payOrders, expenses) {
  if (log.action === 'deleted') return '/activity'
  if (log.type === 'tender' && tenders.some((item) => item.id === log.entityId)) return '/tenders/' + log.entityId
  if (log.type === 'payOrder') {
    const po = payOrders.find((item) => item.id === log.entityId)
    if (po?.po) return '/pay-orders?search=' + encodeURIComponent(po.po)
  }
  if (log.type === 'expense') {
    const expense = expenses.find((item) => item.id === log.entityId)
    if (expense?.description) return '/expenses?search=' + encodeURIComponent(expense.description)
  }
  if (log.type === 'todo') return '/todo'
  return '/activity'
}

function datedReceipts(tenders, months) {
  const now = new Date()
  const buckets = Array.from({ length: months }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - months + index + 1, 1)
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, month: date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), receipts: 0 }
  })
  const byMonth = new Map(buckets.map((row) => [row.key, row]))
  for (const tender of tenders) {
    if (!WON_STATES.has(tender.status)) continue
    for (const bill of [...(tender.bills || []), ...(tender.raBills || [])]) {
      for (const receipt of bill.v2?.receipts || []) {
        if (receipt.status && receipt.status !== 'Cleared') continue
        const key = typeof receipt.date === 'string' ? receipt.date.slice(0, 7) : ''
        const amount = Number(receipt.amount)
        if (byMonth.has(key) && Number.isFinite(amount) && amount > 0) byMonth.get(key).receipts += amount
      }
    }
  }
  return buckets
}

export default function Home() {
  const { isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tenders, setTenders] = useState([])
  const [payOrders, setPayOrders] = useState([])
  const [expenses, setExpenses] = useState([])
  const [todos, setTodos] = useState([])
  const [activity, setActivity] = useState([])
  const [receiptMonths, setReceiptMonths] = useState(6)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const names = ['tenders', 'payOrders', 'expenses', 'todos']
      const snapshots = await Promise.all(names.map((name) => getDocs(collection(db, name))))
      const rows = snapshots.map((snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
      setTenders(rows[0])
      setPayOrders(rows[1])
      setExpenses(rows[2])
      setTodos(rows[3])
      try {
        const logs = await getDocs(collection(db, 'activityLog'))
        setActivity(sortByField(logs.docs.map((item) => ({ id: item.id, ...item.data() })), 'createdAt', 'desc').slice(0, 6))
      } catch {
        setActivity([])
      }
    } catch (cause) {
      console.error('Dashboard load failed', cause)
      const message = cause?.code === 'permission-denied'
        ? "You don't have permission to load dashboard data."
        : 'The dashboard could not be loaded. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const summary = useMemo(() => {
    const won = tenders.filter((tender) => WON_STATES.has(tender.status))
    const financials = won.map((tender) => projectFinancials(tender, expenses))
    const wonIds = new Set(won.map((tender) => tender.id))
    return {
      receivables: financials.reduce((sum, row) => sum + (row.outstanding ?? 0), 0),
      unknownReceiptCount: financials.reduce((sum, row) => sum + row.unknownReceiptCount, 0),
      retentionHeld: financials.reduce((sum, row) => sum + row.retentionHeld, 0),
      unknownRetentionCount: financials.reduce((sum, row) => sum + row.unknownRetentionCount, 0),
      approvedGross: financials.reduce((sum, row) => sum + row.approvedGross, 0),
      netPayable: financials.reduce((sum, row) => sum + row.netPayable, 0),
      received: financials.reduce((sum, row) => sum + row.received, 0),
      unbilled: financials.reduce((sum, row) => sum + row.unbilled, 0),
      missingContractCount: financials.filter((row) => row.contract === null).length,
      unknownBillBasisCount: financials.filter((row) => row.contract !== null && row.unknownBillBasis).length,
      costs: expenses.filter((expense) => wonIds.has(expense.tenderRef || expense.tenderId))
        .reduce((sum, expense) => sum + expenseAmounts(expense).incurred, 0),
      securities: payOrders.filter((po) => !['Forfeited', 'Encashed'].includes(po.status))
        .reduce((sum, po) => sum + (securityAmounts(po).remaining ?? 0), 0),
    }
  }, [tenders, expenses, payOrders])

  const projects = useMemo(() => tenders.filter((tender) => PROJECT_STATES.has(tender.status))
    .map((tender) => ({ ...tender, financials: projectFinancials(tender, expenses) }))
    .sort((a, b) => a.name?.localeCompare(b.name || '') || 0).slice(0, 5), [tenders, expenses])

  const activeProjectCount = tenders.filter((tender) => PROJECT_STATES.has(tender.status)).length
  const heldCount = payOrders.filter((po) => po.status === 'Held').length
  const receiptSeries = useMemo(() => datedReceipts(tenders, receiptMonths), [tenders, receiptMonths])
  const hasDatedReceipts = receiptSeries.some((row) => row.receipts > 0)
  const pipeline = useMemo(() => tenders.filter((item) => isActionableTenderStatus(item.status) && asDate(item.submissionDate))
    .sort((a, b) => asDate(a.submissionDate) - asDate(b.submissionDate)).slice(0, 4), [tenders])

  const attention = useMemo(() => {
    const tenderById = new Map(tenders.map((tender) => [tender.id, tender]))
    const tenderReminders = tenders.filter((tender) => isActionableTenderStatus(tender.status))
      .map((tender) => ({ tender, days: daysUntil(tender.submissionDate) }))
      .filter(({ days }) => days !== null && days <= 7)
      .sort((a, b) => a.days - b.days)
      .map(({ tender, days }) => ({
        id: 'tender-' + tender.id,
        title: tender.name || 'Tender deadline',
        detail: days < 0 ? 'Submission overdue' : days === 0 ? 'Submission due today' : 'Submission due in ' + days + (days === 1 ? ' day' : ' days'),
        href: '/tenders/' + tender.id,
        priority: days,
        icon: AlertTriangle,
        tone: 'amber',
      }))
    const securityReminders = getSecurityFollowUps(payOrders, tenders).map((po) => ({
      id: 'security-' + po.id,
      title: po.po ? 'Security: ' + po.po : 'Security follow-up',
      detail: po.v2?.followUpDate ? 'Scheduled refund follow-up' : 'Held security on a completed project',
      href: '/pay-orders?search=' + encodeURIComponent(po.po || po.tender || ''),
      priority: daysUntil(po.v2?.followUpDate || po.v2?.eligibilityDate) ?? Infinity,
      icon: ShieldCheck,
      tone: 'violet',
    }))
    const poReminders = getAtRiskPayOrders(payOrders, tenders).map((po) => ({
      id: 'po-' + po.id,
      title: po.po ? 'Pay order: ' + po.po : 'Pay order bid result',
      detail: 'Bid result pending near submission',
      href: '/pay-orders?search=' + encodeURIComponent(po.po || po.tender || ''),
      priority: daysUntil(tenderById.get(po.tenderRef)?.submissionDate) ?? Infinity,
      icon: Landmark,
      tone: 'blue',
    }))
    const taskReminders = todos.filter((todo) => !isTaskDone(todo) && daysUntil(todo.dueDate) !== null && daysUntil(todo.dueDate) <= 0)
      .map((todo) => ({
        id: 'task-' + todo.id,
        title: todo.text || 'Open task',
        detail: daysUntil(todo.dueDate) < 0 ? 'Task overdue' : 'Task due today',
        href: '/todo',
        priority: daysUntil(todo.dueDate),
        icon: FileText,
        tone: 'amber',
      }))
    return [...tenderReminders, ...securityReminders, ...poReminders, ...taskReminders]
      .sort((a, b) => a.priority - b.priority)
  }, [tenders, payOrders, todos])

  if (loading) return <div className="space-y-5"><MetricRowSkeleton count={5} /><Card className="h-80" /></div>
  if (error) return <LoadState title="Could not load dashboard" error={error} retry={loadDashboard} className="min-h-[70vh]" />

  return (
    <div className="dashboard-v3 min-w-0 space-y-4 pb-6">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tenders, project finances and follow-ups in one place.</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2" aria-label="Quick actions">
          {isAdmin && <>
            <Button asChild className="h-9 rounded-xl bg-blue-700 px-3 text-white shadow-sm hover:bg-blue-800"><Link to="/tenders?create=1"><Plus className="h-4 w-4" />New Tender</Link></Button>
            <Button asChild variant="outline" className="h-9 rounded-xl bg-card px-3 shadow-sm"><Link to="/pay-orders?create=1"><Plus className="h-4 w-4" />Pay Order</Link></Button>
            <Button asChild variant="outline" className="h-9 rounded-xl bg-card px-3 shadow-sm"><Link to="/expenses?create=1"><Plus className="h-4 w-4" />Expense</Link></Button>
          </>}
          <Button asChild variant="outline" className="h-9 rounded-xl bg-card px-3 shadow-sm"><Link to="/calendar"><CalendarDays className="h-4 w-4" />Calendar</Link></Button>
        </div>
      </header>

      <section aria-label="Financial overview" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <DashboardStatCard icon={ClipboardList} label="Total tenders" value={tenders.length} detail="All tender records" href="/tenders" />
        <DashboardStatCard icon={BriefcaseBusiness} label="Active projects" value={activeProjectCount} detail="Awarded, in progress or on hold" href="/tenders" tone="green" />
        <DashboardStatCard icon={FileText} label="Approved receivables" value={formatCurrency(summary.receivables)} detail="Approved less receipts and deductions" href="/reports" featured />
        <DashboardStatCard icon={Landmark} label="Held instruments" value={heldCount} detail="Pay orders with Held status" href="/pay-orders" />
        <DashboardStatCard icon={ShieldCheck} label="Known securities held" value={formatCurrency(summary.securities)} detail="Known funded cash less refunds" href="/pay-orders" tone="amber" />
      </section>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DashboardSection title="Active Projects" href="/tenders" linkLabel="View all projects" contentClassName="p-0 sm:p-4">
            {projects.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No active projects recorded.</p> : <>
              <div className="hidden min-w-0 overflow-x-auto sm:block" tabIndex={0} role="region" aria-label="Active projects table">
                <table className="w-full min-w-[660px] table-fixed text-left text-[13px] leading-[18px]">
                  <colgroup><col className="w-[31%]" /><col className="w-[16%]" /><col className="w-[17%]" /><col className="w-[18%]" /><col className="w-[18%]" /></colgroup>
                  <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>
                    <th className="px-2 py-2 font-medium">Project</th><th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 text-right font-medium">Contract</th><th className="px-2 py-2 text-right font-medium">Recorded Costs</th>
                    <th className="px-2 py-2 text-right font-medium">View Project</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {projects.map((project) => <tr key={project.id}>
                      <td className="px-2 py-2"><Link className="dashboard-project-name list-name hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-blue-300" title={project.name || 'Untitled project'} to={'/tenders/' + project.id}>{project.name || 'Untitled project'}</Link></td>
                      <td className="px-2 py-2"><StatusBadge status={project.status} className="gap-1 px-1.5 text-[11px]" /></td>
                      <td className="table-amount whitespace-nowrap px-2 py-2">{formatCurrency(project.financials.contract)}</td>
                      <td className="table-amount whitespace-nowrap px-2 py-2">{formatCurrency(project.financials.incurred)}</td>
                      <td className="px-2 py-2 text-right"><Button asChild size="sm" variant="outline" className="h-8 rounded-lg bg-card px-2 text-xs shadow-sm"><Link to={'/tenders/' + project.id}>View project</Link></Button></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div className="divide-y sm:hidden">
                {projects.map((project) => <Link key={project.id} to={'/tenders/' + project.id} className="block p-4 hover:bg-muted/40">
                  <div className="flex flex-wrap items-start justify-between gap-2"><span className="dashboard-project-name list-name min-w-0 flex-1" title={project.name || 'Untitled project'}>{project.name || 'Untitled project'}</span><StatusBadge status={project.status} /></div>
                  <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 text-xs"><div className="min-w-0"><span className="block text-muted-foreground">Contract</span><span className="block overflow-x-auto whitespace-nowrap font-medium tabular-nums">{formatCurrency(project.financials.contract)}</span></div><div className="min-w-0 text-right"><span className="block text-muted-foreground">Recorded costs</span><span className="block overflow-x-auto whitespace-nowrap font-medium tabular-nums">{formatCurrency(project.financials.incurred)}</span></div></div>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300">View project <ArrowRight className="h-3 w-3" /></span>
                </Link>)}
              </div>
            </>}
        </DashboardSection>

        <DashboardSection title="Action Required" description="Recorded deadlines and follow-ups" href="/calendar" linkLabel="View calendar" className="self-start" contentClassName="max-h-[360px] divide-y overflow-y-auto p-0">
            {attention.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No urgent follow-ups from current records.</p> :
              attention.map((item) => <Link key={item.id} to={item.href} className="flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
                <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' + (item.tone === 'violet' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' : item.tone === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300')}><item.icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="list-name block">{item.title}</span><span className="list-secondary block">{item.detail}</span></span>
                <span className="shrink-0 text-xs font-semibold text-blue-700 dark:text-blue-300">View</span>
              </Link>)}
        </DashboardSection>
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <DashboardSection title="Financial Position" description="Current V2 project totals" href="/reports" linkLabel="View reports">
          <dl className="divide-y">
            <div className="dashboard-financial-row pt-0"><dt className="text-muted-foreground">Known unbilled work</dt><dd className="dashboard-financial-value">{formatCurrency(summary.unbilled)}</dd></div>
            <div className="dashboard-financial-row"><dt className="text-muted-foreground">Recorded costs</dt><dd className="dashboard-financial-value">{formatCurrency(summary.costs)}</dd></div>
            <div className="dashboard-financial-row"><dt className="text-muted-foreground">Received on bills</dt><dd className="dashboard-financial-value">{formatCurrency(summary.received)}</dd></div>
            <div className="dashboard-financial-row"><dt className="text-muted-foreground">Approved gross bills</dt><dd className="dashboard-financial-value">{formatCurrency(summary.approvedGross)}</dd></div>
            <div className="dashboard-financial-row"><dt className="text-muted-foreground">Net payable</dt><dd className="dashboard-financial-value">{formatCurrency(summary.netPayable)}</dd></div>
            <div className="dashboard-financial-row"><dt className="text-muted-foreground">RM held (separate from pay orders)</dt><dd className="dashboard-financial-value">{formatCurrency(summary.retentionHeld)}</dd></div>
          </dl>
          {(summary.missingContractCount > 0 || summary.unknownBillBasisCount > 0 || summary.unknownReceiptCount > 0 || summary.unknownRetentionCount > 0) &&
            <div className="mt-3 rounded-xl border border-amber-200/90 bg-amber-50/70 p-3 text-xs leading-4 text-amber-950 shadow-[0_2px_8px_rgba(120,53,15,0.04)] dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-200" aria-label="Financial data limitations">
              <p className="mb-1.5 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Data limitations</p>
              <div className="space-y-1 border-l-2 border-amber-300/70 pl-2.5 dark:border-amber-800/70">
              {summary.missingContractCount > 0 && <p>{summary.missingContractCount} awarded project{summary.missingContractCount === 1 ? ' lacks' : 's lack'} a recorded contract amount and {summary.missingContractCount === 1 ? 'is' : 'are'} excluded from unbilled work.</p>}
              {summary.unknownBillBasisCount > 0 && <p>{summary.unknownBillBasisCount} project{summary.unknownBillBasisCount === 1 ? ' has' : 's have'} legacy bills with unverified gross/net basis and {summary.unknownBillBasisCount === 1 ? 'is' : 'are'} excluded from unbilled work.</p>}
              {summary.unknownReceiptCount > 0 && <p>{summary.unknownReceiptCount} approved bill{summary.unknownReceiptCount === 1 ? ' has' : 's have'} no recorded receipt history; outstanding remains unknown.</p>}
              {summary.unknownRetentionCount > 0 && <p>{summary.unknownRetentionCount} legacy RM deduction{summary.unknownRetentionCount === 1 ? ' has' : 's have'} no release history; held balance is excluded.</p>}
              </div>
            </div>}
          <p className="mt-3 text-xs leading-4 text-muted-foreground">Totals use the existing V2 calculations. Open reports for project-level detail.</p>
        </DashboardSection>
        <DashboardSection title="Security Instruments" description="Pay orders and guarantees" href="/pay-orders" linkLabel="View instruments" contentClassName="p-0">
          {payOrders.length === 0 ? <div className="p-4"><DashboardEmpty>No security instruments recorded.</DashboardEmpty></div> :
            <div className="divide-y">{payOrders.slice(0, 4).map((po) =>
              <Link key={po.id} to={po.po ? '/pay-orders?search=' + encodeURIComponent(po.po) : '/pay-orders'} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
                <span className="min-w-0"><span className="block truncate text-sm font-medium" title={po.po}>{po.po || 'Unnumbered instrument'}</span><span className="block text-xs text-muted-foreground">{po.bank || 'Bank not recorded'}</span></span>
                <span className="flex min-w-0 shrink-0 flex-col items-end gap-1"><span className="max-w-[9rem] overflow-x-auto whitespace-nowrap text-right text-[13px] font-semibold tabular-nums">{formatCurrency(po.amount)}</span><StatusBadge status={po.status} /></span>
              </Link>)}</div>}
        </DashboardSection>
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <DashboardSection title="Tender Pipeline" description="Recorded submission deadlines" href="/tenders" linkLabel="View all tenders" contentClassName="p-0">
          {pipeline.length === 0
            ? <div className="p-4"><DashboardEmpty>No open tender deadlines recorded.</DashboardEmpty></div>
            : <div className="divide-y">{pipeline.map((item) =>
                <Link key={item.id} to={'/tenders/' + item.id} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
                  <span className="min-w-0"><span className="list-name block" title={item.name}>{item.name || 'Untitled tender'}</span><span className="list-secondary block">Due {dateLabel(item.submissionDate)}</span></span>
                  <StatusBadge status={item.status} />
                </Link>)}</div>}
        </DashboardSection>
        <DashboardSection title="Receipt History" description="Dated V2 bill receipt entries on awarded projects">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Legacy receipts without transaction dates are excluded from this chart.</p>
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">Period
              <select value={receiptMonths} onChange={(event) => setReceiptMonths(Number(event.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Receipt history period">
                <option value={6}>Last 6 months</option><option value={12}>Last 12 months</option>
              </select>
            </label>
          </div>
          {hasDatedReceipts ? <div className="min-w-0">
            <div className="h-44 min-w-0" role="img" aria-label="Monthly recorded receipts chart">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={receiptSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.12} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'currentColor' }} />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: 'currentColor' }} tickFormatter={(value) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}m` : value >= 1000 ? `${Math.round(value / 1000)}k` : value} />
              <Tooltip formatter={(value) => [formatCurrency(value), 'Receipts']} contentStyle={{ backgroundColor: 'oklch(var(--popover))', borderColor: 'oklch(var(--border))', color: 'oklch(var(--popover-foreground))', borderRadius: '0.75rem' }} />
              <Bar dataKey="receipts" name="Receipts" fill="#326993" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart></ResponsiveContainer>
            </div>
            <ul className="sr-only">{receiptSeries.map((row) => <li key={row.key}>{row.month}: {formatCurrency(row.receipts)}</li>)}</ul>
          </div> : <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">No dated receipt entries in this period.</p>}
        </DashboardSection>
      </div>

      <DashboardSection title="Recent Activity" href="/activity" linkLabel="View all activity" contentClassName="p-0 sm:p-4">
          {activity.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No recent activity available.</p> :
            <>
            <div className="divide-y sm:hidden">
              {activity.map((log) => <Link key={log.id} to={activityLink(log, tenders, payOrders, expenses)} className="block min-w-0 p-4 hover:bg-muted/40">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2 py-1 font-medium">{activityTypeLabel(log.type)}</span><span className="shrink-0">{dateLabel(log.createdAt)}</span></div>
                <p className="mt-2 break-words text-sm font-medium">{activityTitle(log, payOrders)}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-xs capitalize text-blue-700 dark:text-blue-300">{log.action || 'Updated'} <ArrowRight className="h-3 w-3" /></span>
              </Link>)}
            </div>
            <div className="hidden min-w-0 overflow-x-auto sm:block">
                <table className="w-full min-w-[570px] text-left text-[13px] leading-[18px]">
                  <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">Date</th><th className="px-3 py-3 font-medium">Type</th><th className="px-3 py-3 font-medium">Record</th><th className="px-3 py-3 font-medium">Action</th><th className="px-3 py-3 text-right font-medium">Link</th></tr></thead>
                <tbody className="divide-y">{activity.map((log) => <tr key={log.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{dateLabel(log.createdAt)}</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{activityTypeLabel(log.type)}</span></td>
                  <td className="max-w-[300px] break-words px-3 py-3"><span className="block" title={activityTitle(log, payOrders)}>{activityTitle(log, payOrders)}</span></td>
                  <td className="px-3 py-3 capitalize text-muted-foreground">{log.action || 'Updated'}</td>
                  <td className="px-3 py-3 text-right"><Link to={activityLink(log, tenders, payOrders, expenses)} className="whitespace-nowrap font-medium text-blue-700 hover:underline dark:text-blue-300">View</Link></td>
                </tr>)}</tbody>
              </table>
            </div></>}
      </DashboardSection>
    </div>
  )
}
