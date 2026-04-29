import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Banknote,
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronRight,
  Clock,
  FileStack,
  FileText,
  Landmark,
  MapPin,
  Trophy,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'

import ChartTooltip from '@/components/shared/ChartTooltip'
import LoadState from '@/components/shared/LoadState'
import { MetricRowSkeleton } from '@/components/shared/LoadingSkeletons'
import StatusBadge from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { cn, daysUntil, formatCurrency, formatDate } from '@/lib/utils'

const TENDER_STATUS_COLORS = {
  Bidding: '#d97706',
  Submitted: '#2563eb',
  Awarded: '#0d9488',
  'In Progress': '#7c3aed',
  Completed: '#16a34a',
  Lost: '#dc2626',
  Cancelled: '#64748b',
}

const PO_STATUS_COLORS = {
  Pending: 'oklch(var(--chart-3))',
  Submitted: 'oklch(var(--chart-2))',
  Returned: 'oklch(var(--chart-4))',
  Encashed: 'oklch(var(--chart-1))',
  Forfeited: 'oklch(var(--chart-5))',
}

const METRIC_TONES = {
  primary: {
    card: 'hover:border-emerald-200 hover:shadow-md dark:hover:border-emerald-900/70',
    icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  success: {
    card: 'hover:border-emerald-200 hover:shadow-md dark:hover:border-emerald-900/70',
    icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    card: 'hover:border-amber-200 hover:shadow-md dark:hover:border-amber-900/70',
    icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  danger: {
    card: 'hover:border-rose-200 hover:shadow-md dark:hover:border-rose-900/70',
    icon: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  info: {
    card: 'hover:border-blue-200 hover:shadow-md dark:hover:border-blue-900/70',
    icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
}

function DashboardMetric({ title, value, icon: Icon, helper, href, tone = 'primary', trend, trendPositive }) {
  const colors = METRIC_TONES[tone] ?? METRIC_TONES.primary
  const TrendIcon = trendPositive === true ? ArrowUp : trendPositive === false ? ArrowDown : null
  const helperColor = trendPositive === true
    ? 'text-emerald-600 dark:text-emerald-400'
    : trendPositive === false
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-muted-foreground'

  const card = (
    <Card className={cn('h-full rounded-xl border bg-card shadow-sm transition-all', colors.card)}>
      <CardContent className="flex h-full items-start gap-4 p-4 sm:p-5">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', colors.icon)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {title}
            </p>
            {trend && (
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', colors.chip)}>
                {TrendIcon && <TrendIcon className="h-3 w-3" aria-hidden="true" />}
                {trend}
              </span>
            )}
          </div>
          <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            {value}
          </p>
          {helper && (
            <p className={cn('mt-2 flex items-center gap-1 text-xs leading-5', helperColor)}>
              {!trend && TrendIcon && <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {helper}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )

  return href ? <Link to={href} className="block h-full">{card}</Link> : card
}

export default function Home() {
  const { displayName } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenders, setTenders] = useState([])
  const [payOrders, setPayOrders] = useState([])
  const [expenses, setExpenses] = useState([])
  const [todos, setTodos] = useState([])
  const [alertDismissed, setAlertDismissed] = useState(false)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tSnap, pSnap, eSnap, tOSnap] = await Promise.all([
        getDocs(query(collection(db, 'tenders'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'payOrders'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'todos'), orderBy('createdAt', 'desc'))),
      ])
      setTenders(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setPayOrders(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setExpenses(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setTodos(tOSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {
      setError(e?.message || 'Failed to load dashboard data.')
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const activeTenders = tenders.filter((t) => !['Completed', 'Lost', 'Cancelled'].includes(t.status))
  const inProgressTenders = tenders.filter((t) => t.status === 'In Progress')
  const wonTenders = tenders.filter((t) => ['Awarded', 'In Progress', 'Completed'].includes(t.status))
  const atRisk = payOrders.filter((p) => p.status === 'Submitted' && p.bidResult === 'Awaiting')
  const openTodos = todos.filter((t) => !t.done)
  const wonTenderIds = new Set(wonTenders.map((t) => t.id))

  const tenderFinancials = wonTenders.reduce((totals, tender) => {
    const contractValue = Number(tender.value) || 0
    const billPaid = (tender.bills || [])
      .filter((b) => b.status === 'Paid')
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
    const raBillPaid = (tender.raBills || [])
      .filter((b) => b.status === 'Paid')
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
    const totalReceived = billPaid + raBillPaid
    return {
      contractValue: totals.contractValue + contractValue,
      totalReceived: totals.totalReceived + totalReceived,
    }
  }, { contractValue: 0, totalReceived: 0 })

  const totalExpenses = expenses
    .filter((expense) => expense.tenderRef && wonTenderIds.has(expense.tenderRef))
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0)
  const expectedProfit = tenderFinancials.contractValue - totalExpenses
  const cashPosition = tenderFinancials.totalReceived - totalExpenses
  const receivable = Math.max(tenderFinancials.contractValue - tenderFinancials.totalReceived, 0)
  const payOrdersHeld = payOrders
    .filter((p) => ['Held', 'Submitted', 'Pending'].includes(p.status))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  const allDeadlines = activeTenders
    .filter((t) => t.submissionDate)
    .map((t) => ({ ...t, daysLeft: daysUntil(t.submissionDate) }))
    .filter((t) => t.daysLeft !== null && t.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 6)

  const urgentAlerts = activeTenders
    .filter((t) => t.submissionDate)
    .map((t) => ({ ...t, daysLeft: daysUntil(t.submissionDate) }))
    .filter((t) => t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 2)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const tenderStatusData = Object.keys(TENDER_STATUS_COLORS).map((status) => ({
    status,
    count: tenders.filter((t) => t.status === status).length,
  }))

  const poStatusData = Object.keys(PO_STATUS_COLORS)
    .map((name) => ({ name, value: payOrders.filter((p) => p.status === name).length }))
    .filter((d) => d.value > 0)

  const toggleTodo = async (todo) => {
    try {
      await updateDoc(doc(db, 'todos', todo.id), { done: !todo.done })
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)))
    } catch {
      toast.error('Failed to update task')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <MetricRowSkeleton count={4} />
        <MetricRowSkeleton count={4} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="h-72 lg:col-span-2" />
          <Card className="h-72" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <LoadState
        title="Could not load dashboard"
        error={error}
        retry={loadDashboard}
        className="min-h-[70vh]"
      />
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (displayName || 'there').split(' ')[0]
  const todayLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-5 lg:space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[30px]">
            {greeting}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's what's happening with your projects today.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="hidden items-center gap-2 rounded-lg border bg-background px-3 py-2 text-muted-foreground shadow-sm sm:flex">
            <CalendarIcon className="h-4 w-4" aria-hidden="true" />
            {todayLabel}
          </div>
          <Button variant="outline" size="sm" className="h-9 rounded-lg">
            This Week <ChevronRight className="h-4 w-4 rotate-90" aria-hidden="true" />
          </Button>
        </div>
      </section>

      {urgentAlerts.length > 0 && !alertDismissed && (
        <section className="relative overflow-hidden rounded-2xl border border-amber-300/70 bg-amber-50/70 p-4 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/20 sm:p-5">
          <button
            onClick={() => setAlertDismissed(true)}
            aria-label="Dismiss urgent deadline alerts"
            className="absolute right-3 top-3 rounded-md p-1 text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950/50 sm:right-4 sm:top-4"
          >
            <X size={16} />
          </button>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 pr-8 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold leading-tight text-amber-950 dark:text-amber-100 sm:text-base">
                    {urgentAlerts.length} urgent deadline{urgentAlerts.length > 1 ? 's' : ''} today
                  </p>
                  <p className="mt-1 text-sm leading-5 text-amber-900/75 dark:text-amber-100/75">
                    These tenders are due today. Take action to stay on track.
                  </p>
                </div>
              </div>
              <Link to="/calendar" className="hidden shrink-0 sm:block">
                <Button variant="outline" size="sm" className="h-10 border-amber-300 bg-white/80 px-5 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-background/60 dark:text-amber-100">
                  View all deadlines
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {urgentAlerts.slice(0, 3).map((t, index) => {
                const secondary = t.location || t.area || t.agency || t.department
                return (
                  <Link
                    key={t.id}
                    to={`/tenders/${t.id}`}
                    className="flex min-w-0 items-start gap-3 rounded-xl border border-amber-200/80 bg-white/85 p-3.5 shadow-sm transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-900/60 dark:bg-background/70 dark:hover:bg-amber-950/30"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-semibold leading-5 text-foreground sm:truncate sm:whitespace-nowrap">
                        {t.name || 'Untitled'}
                      </span>
                      {secondary && (
                        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="line-clamp-2 sm:truncate">{secondary}</span>
                        </span>
                      )}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {t.daysLeft === 0 ? 'Due Today' : t.daysLeft === 1 ? 'Due Tomorrow' : `Due in ${t.daysLeft} days`}
                      </span>
                      <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
                    </span>
                  </Link>
                )
              })}
            </div>

            <Link to="/calendar" className="shrink-0 sm:hidden">
              <Button variant="outline" size="sm" className="h-11 w-full border-amber-300 bg-white/80 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-background/60 dark:text-amber-100">
                View all deadlines
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetric icon={FileStack} title="Active Tenders" value={activeTenders.length} href="/tenders" tone="primary" helper="Bidding, submitted, awarded, or in progress" trend={activeTenders.length > 0 ? String(activeTenders.length) : null} trendPositive={activeTenders.length > 0} />
        <DashboardMetric icon={FileText} title="Pay Orders at Risk" value={atRisk.length} href="/pay-orders" tone="warning" helper="Submitted, bid pending" trend={atRisk.length === 0 ? 'Clear' : String(atRisk.length)} trendPositive={atRisk.length === 0} />
        <DashboardMetric icon={CheckSquare} title="Open Tasks" value={openTodos.length} href="/todo" tone="info" helper={openTodos.length === 0 ? 'All tasks done' : 'Remaining'} trend={openTodos.length > 0 ? String(openTodos.length) : '0'} trendPositive={openTodos.length === 0} />
        <DashboardMetric icon={Trophy} title="Won Tenders" value={wonTenders.length} href="/tenders" tone="success" helper={`${inProgressTenders.length} in progress`} trend={wonTenders.length > 0 ? String(wonTenders.length) : null} trendPositive={wonTenders.length > 0} />
        <DashboardMetric icon={TrendingUp} title="Expected Profit" value={formatCurrency(expectedProfit)} href="/tenders" tone={expectedProfit >= 0 ? 'success' : 'danger'} helper="Won tenders only" trendPositive={expectedProfit >= 0} />
        <DashboardMetric icon={WalletCards} title="Cash Position" value={formatCurrency(cashPosition)} href="/tenders" tone={cashPosition >= 0 ? 'success' : 'danger'} helper="Won tenders only" trendPositive={cashPosition >= 0} />
        <DashboardMetric icon={Banknote} title="Receivable" value={formatCurrency(receivable)} href="/tenders" tone="info" helper="Won tenders only" trendPositive={receivable === 0} />
        <DashboardMetric icon={Landmark} title="PO Exposure" value={formatCurrency(payOrdersHeld)} href="/pay-orders" tone={payOrdersHeld > 0 ? 'warning' : 'success'} helper="Pending, submitted, or held" trendPositive={payOrdersHeld === 0} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="rounded-xl border shadow-sm xl:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Tender Pipeline</CardTitle>
              <CardDescription>Pipeline breakdown across all tenders</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs">
              All Tenders <ChevronRight className="h-3.5 w-3.5 rotate-90" aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tenderStatusData} margin={{ top: 18, right: 8, left: -12, bottom: 0 }}>
                  <XAxis dataKey="status" stroke="oklch(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="oklch(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RTooltip cursor={{ fill: 'oklch(var(--muted) / 0.45)' }} content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={44}>
                    {tenderStatusData.map((d) => (
                      <Cell key={d.status} fill={TENDER_STATUS_COLORS[d.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border shadow-sm xl:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Pay Order Status</CardTitle>
              <CardDescription>Current status distribution</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs">
              All Time <ChevronRight className="h-3.5 w-3.5 rotate-90" aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {poStatusData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No pay orders yet</p>
            ) : (
              <div className="grid min-h-[18rem] grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_0.95fr] xl:grid-cols-1 2xl:grid-cols-[1fr_0.95fr]">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={poStatusData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2} strokeWidth={0}>
                        {poStatusData.map((d) => (
                          <Cell key={d.name} fill={PO_STATUS_COLORS[d.name]} />
                        ))}
                      </Pie>
                      <RTooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-3">
                  {poStatusData.map((d) => (
                    <li key={d.name} className="flex items-center gap-3 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PO_STATUS_COLORS[d.name] }} aria-hidden="true" />
                      <span className="text-foreground">{d.name}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-xl border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock size={16} className="text-muted-foreground" />
                Upcoming Submissions
              </CardTitle>
              <CardDescription>Next tenders due for submission</CardDescription>
            </div>
            <Link to="/tenders">
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                View all <ChevronRight size={14} />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {allDeadlines.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No upcoming deadlines</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tender</TableHead>
                    <TableHead className="hidden md:table-cell">Agency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allDeadlines.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/tenders/${t.id}`)}>
                      <TableCell className="font-medium">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <FileStack size={16} aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm leading-5">{t.name || 'Untitled'}</p>
                            <p className="truncate text-xs text-muted-foreground md:hidden">{t.agency || '-'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-[220px] truncate text-muted-foreground md:table-cell">{t.agency || '-'}</TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={t.daysLeft <= 1 ? 'font-semibold text-rose-600 dark:text-rose-400' : t.daysLeft <= 3 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
                          {t.daysLeft === 0 ? 'Today' : t.daysLeft === 1 ? 'Tomorrow' : `${t.daysLeft}d`}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-xl border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare size={16} className="text-muted-foreground" />
                Open Tasks
              </CardTitle>
              <CardDescription>Items awaiting action</CardDescription>
            </div>
            <Link to="/todo">
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                View all <ChevronRight size={14} />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {openTodos.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">All tasks complete!</p>
            ) : (
              <ul className="divide-y divide-border">
                {openTodos.slice(0, 7).map((todo) => {
                  const overdue = todo.dueDate && daysUntil(todo.dueDate) < 0
                  const iconTone = overdue
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : todo.priority === 'high'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-primary/10 text-primary'
                  return (
                    <li key={todo.id} className="flex items-center gap-3 px-4 py-3.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
                        {overdue ? <AlertTriangle size={16} /> : <CalendarIcon size={16} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight text-foreground">{todo.text}</p>
                        <p className={`mt-1 text-xs ${overdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                          {todo.dueDate ? `Due ${formatDate(todo.dueDate)}` : 'No due date'}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        id={`home-todo-${todo.id}`}
                        checked={todo.done}
                        onChange={() => toggleTodo(todo)}
                        aria-label={`Mark task complete: ${todo.text}`}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
