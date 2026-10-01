import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { AlertTriangle, ArrowRight, CalendarDays, FileText, Landmark, Plus, ReceiptText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import KpiCard from '@/components/shared/KpiCard'
import LoadState from '@/components/shared/LoadState'
import { MetricRowSkeleton } from '@/components/shared/LoadingSkeletons'
import StatusBadge from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

function activityTitle(log) {
  const title = String(log.title || '').trim()
  if (title && !/^\d+$/.test(title)) return title
  const type = log.type === 'payOrder' ? 'Pay order' : log.type === 'todo' ? 'Task' : log.type || 'Record'
  return type.charAt(0).toUpperCase() + type.slice(1) + ' ' + (log.action || 'updated').toLowerCase()
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

function metricCard(icon, label, value, helper, tone, href) {
  return (
    <Link key={label} to={href} className="block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <KpiCard icon={icon} label={label} value={formatCurrency(value)} helper={helper} tone={tone}
        className="border-border/80 transition-colors hover:border-emerald-500/40 hover:bg-muted/20"
        contentClassName="gap-3 sm:flex-col lg:flex-row"
        valueClassName="font-sans text-xl tracking-tight sm:text-2xl" />
    </Link>
  )
}

function SectionTitle({ title, href, linkLabel }) {
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
      <CardTitle className="min-w-0 border-l-4 border-emerald-600 pl-3 text-base font-semibold">{title}</CardTitle>
      <Link to={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-300 sm:text-sm">
        {linkLabel}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </CardHeader>
  )
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
      receivables: financials.reduce((sum, row) => sum + row.outstanding, 0),
      unbilled: financials.reduce((sum, row) => sum + row.unbilled, 0),
      costs: expenses.filter((expense) => wonIds.has(expense.tenderRef || expense.tenderId))
        .reduce((sum, expense) => sum + expenseAmounts(expense).incurred, 0),
      securities: payOrders.filter((po) => !['Forfeited', 'Encashed'].includes(po.status))
        .reduce((sum, po) => sum + (securityAmounts(po).remaining ?? 0), 0),
    }
  }, [tenders, expenses, payOrders])

  const projects = useMemo(() => tenders.filter((tender) => PROJECT_STATES.has(tender.status))
    .map((tender) => ({ ...tender, financials: projectFinancials(tender, expenses) }))
    .sort((a, b) => a.name?.localeCompare(b.name || '') || 0).slice(0, 5), [tenders, expenses])

  const attention = useMemo(() => {
    const tenderReminders = tenders.filter((tender) => isActionableTenderStatus(tender.status))
      .map((tender) => ({ tender, days: daysUntil(tender.submissionDate) }))
      .filter(({ days }) => days !== null && days <= 7)
      .sort((a, b) => a.days - b.days)
      .map(({ tender, days }) => ({
        id: 'tender-' + tender.id,
        title: tender.name || 'Tender deadline',
        detail: days < 0 ? 'Submission overdue' : days === 0 ? 'Submission due today' : 'Submission due in ' + days + ' days',
        href: '/tenders/' + tender.id,
        icon: AlertTriangle,
        tone: 'amber',
      }))
    const securityReminders = getSecurityFollowUps(payOrders, tenders).map((po) => ({
      id: 'security-' + po.id,
      title: po.po ? 'Security: ' + po.po : 'Security follow-up',
      detail: po.v2?.followUpDate ? 'Scheduled refund follow-up' : 'Held security on a completed project',
      href: '/pay-orders?search=' + encodeURIComponent(po.po || po.tender || ''),
      icon: ShieldCheck,
      tone: 'violet',
    }))
    const poReminders = getAtRiskPayOrders(payOrders, tenders).map((po) => ({
      id: 'po-' + po.id,
      title: po.po ? 'Pay order: ' + po.po : 'Pay order bid result',
      detail: 'Bid result pending near submission',
      href: '/pay-orders?search=' + encodeURIComponent(po.po || po.tender || ''),
      icon: Landmark,
      tone: 'blue',
    }))
    const taskReminders = todos.filter((todo) => !isTaskDone(todo) && daysUntil(todo.dueDate) !== null && daysUntil(todo.dueDate) <= 0)
      .map((todo) => ({
        id: 'task-' + todo.id,
        title: todo.text || 'Open task',
        detail: daysUntil(todo.dueDate) < 0 ? 'Task overdue' : 'Task due today',
        href: '/todo',
        icon: FileText,
        tone: 'amber',
      }))
    return [...tenderReminders, ...securityReminders, ...poReminders, ...taskReminders].slice(0, 4)
  }, [tenders, payOrders, todos])

  if (loading) return <div className="space-y-5"><MetricRowSkeleton count={4} /><Card className="h-80" /></div>
  if (error) return <LoadState title="Could not load dashboard" error={error} retry={loadDashboard} className="min-h-[70vh]" />

  return (
    <div className="min-w-0 space-y-5 pb-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Projects, payments and follow-ups at a glance.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {isAdmin && <>
            <Button asChild className="h-10 bg-emerald-700 text-white hover:bg-emerald-800"><Link to="/tenders?create=1"><Plus className="h-4 w-4" />New Tender</Link></Button>
            <Button asChild className="h-10 bg-emerald-700 text-white hover:bg-emerald-800"><Link to="/pay-orders?create=1"><Plus className="h-4 w-4" />Pay Order</Link></Button>
            <Button asChild className="h-10 bg-emerald-700 text-white hover:bg-emerald-800"><Link to="/expenses?create=1"><Plus className="h-4 w-4" />Expense</Link></Button>
          </>}
          <Button asChild variant="outline" className="h-10"><Link to="/calendar"><CalendarDays className="h-4 w-4" />Calendar</Link></Button>
        </div>
      </header>

      <section aria-label="Financial overview" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {metricCard(FileText, 'Approved Receivables', summary.receivables, 'Approved bills less receipts and deductions', 'emerald', '/reports')}
        {metricCard(FileText, 'Unbilled Work', summary.unbilled, 'Remaining contract value not yet billed', 'blue', '/reports')}
        {metricCard(ReceiptText, 'Recorded Costs', summary.costs, 'Incurred costs on awarded projects', 'amber', '/expenses')}
        {metricCard(ShieldCheck, 'Securities Held', summary.securities, 'Known funded cash less refunds', 'violet', '/pay-orders')}
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
        <Card className="min-w-0 overflow-hidden">
          <SectionTitle title="Active Projects" href="/tenders" linkLabel="View all projects" />
          <CardContent className="p-0 sm:p-4">
            {projects.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No active projects recorded.</p> : <>
              <div className="hidden min-w-0 overflow-x-auto 2xl:block">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>
                    <th className="px-3 py-3 font-semibold">Project</th><th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 text-right font-semibold">Contract</th><th className="px-3 py-3 text-right font-semibold">Costs</th>
                    <th className="px-3 py-3 text-right font-semibold">Action</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {projects.map((project) => <tr key={project.id}>
                      <td className="max-w-[250px] px-3 py-3 font-medium"><Link className="hover:text-emerald-700 hover:underline dark:hover:text-emerald-300" to={'/tenders/' + project.id}>{project.name || 'Untitled project'}</Link></td>
                      <td className="px-3 py-3"><StatusBadge status={project.status} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatCurrency(project.financials.contract)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatCurrency(project.financials.incurred)}</td>
                      <td className="px-3 py-3 text-right"><Button asChild size="sm" variant="outline"><Link to={'/tenders/' + project.id}>View project</Link></Button></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div className="divide-y 2xl:hidden">
                {projects.map((project) => <Link key={project.id} to={'/tenders/' + project.id} className="block p-4 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3"><span className="min-w-0 font-semibold">{project.name || 'Untitled project'}</span><StatusBadge status={project.status} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="block text-muted-foreground">Contract</span><span className="block overflow-x-auto whitespace-nowrap font-medium tabular-nums">{formatCurrency(project.financials.contract)}</span></div><div><span className="block text-muted-foreground">Recorded costs</span><span className="block overflow-x-auto whitespace-nowrap font-medium tabular-nums">{formatCurrency(project.financials.incurred)}</span></div></div>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">View project <ArrowRight className="h-3 w-3" /></span>
                </Link>)}
              </div>
            </>}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <SectionTitle title="Action Required" href="/calendar" linkLabel="View calendar" />
          <CardContent className="divide-y p-0">
            {attention.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No urgent follow-ups from current records.</p> :
              attention.map((item) => <Link key={item.id} to={item.href} className="flex min-w-0 items-center gap-3 p-4 transition-colors hover:bg-muted/40">
                <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' + (item.tone === 'violet' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' : item.tone === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300')}><item.icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="block text-xs text-muted-foreground">{item.detail}</span></span>
                <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-300">View</span>
              </Link>)}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <SectionTitle title="Recent Activity" href="/activity" linkLabel="View all activity" />
        <CardContent className="p-0 sm:p-4">
          {activity.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No recent activity available.</p> :
            <>
            <div className="divide-y sm:hidden">
              {activity.map((log) => <Link key={log.id} to={activityLink(log, tenders, payOrders, expenses)} className="block min-w-0 p-4 hover:bg-muted/40">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2 py-1 font-medium">{log.type || 'Activity'}</span><span className="shrink-0">{dateLabel(log.createdAt)}</span></div>
                <p className="mt-2 break-words text-sm font-medium">{activityTitle(log)}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-xs capitalize text-emerald-700 dark:text-emerald-300">{log.action || 'Updated'} <ArrowRight className="h-3 w-3" /></span>
              </Link>)}
            </div>
            <div className="hidden min-w-0 overflow-x-auto sm:block">
              <table className="w-full min-w-[570px] text-left text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-semibold">Date</th><th className="px-3 py-3 font-semibold">Type</th><th className="px-3 py-3 font-semibold">Record</th><th className="px-3 py-3 font-semibold">Action</th><th className="px-3 py-3 text-right font-semibold">Link</th></tr></thead>
                <tbody className="divide-y">{activity.map((log) => <tr key={log.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{dateLabel(log.createdAt)}</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{log.type || 'Activity'}</span></td>
                  <td className="max-w-[300px] px-3 py-3"><span className="block truncate" title={activityTitle(log)}>{activityTitle(log)}</span></td>
                  <td className="px-3 py-3 capitalize text-muted-foreground">{log.action || 'Updated'}</td>
                  <td className="px-3 py-3 text-right"><Link to={activityLink(log, tenders, payOrders, expenses)} className="whitespace-nowrap font-medium text-emerald-700 hover:underline dark:text-emerald-300">View</Link></td>
                </tr>)}</tbody>
              </table>
            </div></>}
        </CardContent>
      </Card>
    </div>
  )
}
