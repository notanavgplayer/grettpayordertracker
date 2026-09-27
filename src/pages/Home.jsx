import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Banknote,
  CalendarCheck,
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronRight,
  Clock,
  FolderOpen,
  FileStack,
  FileText,
  Landmark,
  ListTodo,
  MapPin,
  Plus,
  ReceiptText,
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
import KpiCard from '@/components/shared/KpiCard'
import LoadState from '@/components/shared/LoadState'
import { MetricRowSkeleton } from '@/components/shared/LoadingSkeletons'
import StatusBadge from '@/components/shared/StatusBadge'
import DeadlineBadge from '@/components/shared/DeadlineBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import {
  cn,
  daysUntil,
  formatCurrency,
  getTenderDisplayStatus,
  isActionableTenderStatus,
  isTaskDone,
  shouldShowTaskOverdue,
  sortByField,
} from '@/lib/utils'
import { tenderBillTotals, tenderContractValue, projectFinancials, expenseAmounts, securityAmounts, billAmounts } from '@/lib/financials'
import { getAtRiskPayOrders, getSecurityFollowUps } from '@/lib/payOrderMetrics'
import { sortTenderDeadlines } from '@/lib/tenderDeadlines'

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
  const kpiTone = tone === 'warning' ? 'amber' : tone === 'danger' ? 'rose' : tone === 'info' ? 'blue' : 'emerald'

  const card = (
    <KpiCard
      className={cn('transition-all', colors.card)}
      icon={Icon}
      label={title}
      value={value}
      helper={helper}
      tone={kpiTone}
      badge={trend ? <span className="inline-flex items-center gap-1">{TrendIcon && <TrendIcon className="h-3 w-3" aria-hidden="true" />}{trend}</span> : null}
    />
  )

  return href ? <Link to={href} className="block h-full">{card}</Link> : card
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfLocalDay(value = new Date()) {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isSameLocalDay(value, compareTo = new Date()) {
  const date = startOfLocalDay(value)
  const target = startOfLocalDay(compareTo)
  return Boolean(date && target && date.getTime() === target.getTime())
}

function isBeforeToday(value) {
  const date = startOfLocalDay(value)
  const today = startOfLocalDay()
  return Boolean(date && today && date.getTime() < today.getTime())
}

function toMillis(value) {
  const date = toDate(value)
  return date ? date.getTime() : 0
}

function formatDashboardDate(value) {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function DashboardSectionHeader({ title, description, action }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

function AttentionItem({ icon: Icon, type, title, description, dueDate, status, priority, tone = 'warning', onClick }) {
  const toneClass = {
    danger: 'border-rose-200 bg-rose-50/70 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300',
    warning: 'border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300',
    info: 'border-blue-200 bg-blue-50/70 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300',
    success: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300',
  }[tone]
  const priorityClass = tone === 'danger'
    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'

  const content = (
    <>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', toneClass)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mb-1 flex flex-wrap items-center gap-2">
          {type && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{type}</span>}
          {priority && <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', priorityClass)}>{priority}</span>}
        </span>
        <span className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{title}</span>
        {description && <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {dueDate && <span>{dueDate}</span>}
          {status && <span className="rounded-full bg-muted/70 px-2 py-0.5 font-medium">{status}</span>}
        </span>
      </span>
      <span className="ml-auto shrink-0 self-end text-xs font-semibold text-emerald-700 dark:text-emerald-300 sm:self-start">
        View
      </span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full min-w-0 items-start gap-3 rounded-xl border bg-background p-3.5 text-left transition-colors hover:border-emerald-200 dark:hover:border-emerald-900/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {content}
      </button>
    )
  }

  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border bg-background p-3.5">
      {content}
    </div>
  )
}

function FinanceLine({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums', tone === 'danger' ? 'text-rose-700 dark:text-rose-300' : tone === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground')}>
        {value}
      </span>
    </div>
  )
}

function FinanceMetricCard({ icon: Icon, label, value, helper, tone = 'default' }) {
  const kpiTone = tone === 'danger' ? 'rose' : tone === 'warning' ? 'amber' : tone === 'success' ? 'emerald' : 'slate'
  return <KpiCard icon={Icon} label={label} value={value} helper={helper} tone={kpiTone} valueClassName="text-base sm:text-lg" />
}

function activityTone(type) {
  const normalized = String(type || '').toLowerCase()
  if (normalized.includes('pay')) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (normalized.includes('document')) return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
  if (normalized.includes('expense')) return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
  if (normalized.includes('bill')) return 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300'
  if (normalized.includes('visit')) return 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300'
  if (normalized.includes('task')) return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
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
        getDocs(collection(db, 'tenders')),
        getDocs(collection(db, 'payOrders')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'todos')),
      ])
      setTenders(sortByField(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })), 'createdAt', 'desc'))
      setPayOrders(sortByField(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })), 'createdAt', 'desc'))
      setExpenses(sortByField(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })), 'createdAt', 'desc'))
      setTodos(sortByField(tOSnap.docs.map((d) => ({ id: d.id, ...d.data() })), 'createdAt', 'desc'))
    } catch (e) {
      console.error('Dashboard load failed', e)
      const message = e?.code === 'permission-denied'
        ? "You don't have permission to load dashboard data."
        : e?.code === 'unavailable'
          ? 'The dashboard could not reach the server. Check your connection and try again.'
          : 'The dashboard could not be loaded. Please try again.'
      setError(message)
      toast.error(message)
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
  const atRisk = getAtRiskPayOrders(payOrders, tenders)
  const securityFollowUps = getSecurityFollowUps(payOrders, tenders)
  const openTodos = todos.filter((t) => !isTaskDone(t))
  const wonTenderIds = new Set(wonTenders.map((t) => t.id))

  const tenderFinancials = wonTenders.reduce((totals, tender) => {
    const contractValue = tenderContractValue(tender)
    const totalReceived = tenderBillTotals(tender).totalReceived
    return {
      contractValue: totals.contractValue + contractValue,
      totalReceived: totals.totalReceived + totalReceived,
    }
  }, { contractValue: 0, totalReceived: 0 })

  const totalExpenses = expenses
    .filter((expense) => expense.tenderRef && wonTenderIds.has(expense.tenderRef))
    .reduce((sum, expense) => sum + expenseAmounts(expense).incurred, 0)
  const projectMetrics = wonTenders.map((tender) => projectFinancials(tender, expenses))
  const receivable = projectMetrics.reduce((sum, metric) => sum + metric.outstanding, 0)
  const unbilled = projectMetrics.reduce((sum, metric) => sum + metric.unbilled, 0)
  const forecastReady = projectMetrics.length > 0 && projectMetrics.every((metric) => metric.profit !== null)
  const forecastProfit = forecastReady ? projectMetrics.reduce((sum, metric) => sum + metric.profit, 0) : null
  const unassignedExpenses = expenses.filter((expense) => !expense.tenderRef && !expense.tenderId)
    .reduce((sum, expense) => sum + expenseAmounts(expense).incurred, 0)
  const payOrdersHeld = payOrders
    .filter((p) => !['Forfeited', 'Encashed'].includes(p.status))
    .reduce((sum, p) => sum + (securityAmounts(p).remaining ?? 0), 0)
  const unknownSecurityFunding = payOrders.filter((p) => p.v2?.instrument === 'guarantee' && securityAmounts(p).funded === null).length
  const actionableTenderDeadlines = tenders.filter((t) => isActionableTenderStatus(t.status))

  const allDeadlineRows = sortTenderDeadlines(actionableTenderDeadlines)
  const allDeadlines = allDeadlineRows
    .slice(0, 5)
    .map(({ tender, deadline }) => ({ ...tender, daysLeft: deadline.days, deadline }))

  const urgentAlerts = actionableTenderDeadlines
    .filter((t) => t.submissionDate)
    .map((t) => ({ ...t, daysLeft: daysUntil(t.submissionDate) }))
    .filter((t) => t.daysLeft !== null && t.daysLeft >= -1 && t.daysLeft <= 2)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const urgentDeadlineLabel = (daysLeft) => {
    if (daysLeft < 0) return 'Overdue'
    if (daysLeft === 0) return 'Due Today'
    if (daysLeft === 1) return 'Due Tomorrow'
    return `Due in ${daysLeft} days`
  }

  const urgentHeading = urgentAlerts.some((t) => t.daysLeft < 0)
    ? `${urgentAlerts.length} urgent deadline${urgentAlerts.length > 1 ? 's' : ''} need attention`
    : urgentAlerts.every((t) => t.daysLeft === 0)
    ? `${urgentAlerts.length} urgent deadline${urgentAlerts.length > 1 ? 's' : ''} today`
    : `${urgentAlerts.length} upcoming deadline${urgentAlerts.length > 1 ? 's' : ''}`

  const tenderStatusData = Object.keys(TENDER_STATUS_COLORS).map((status) => ({
    status,
    count: tenders.filter((t) => t.status === status).length,
  }))

  const poStatusData = Object.keys(PO_STATUS_COLORS)
    .map((name) => ({ name, value: payOrders.filter((p) => p.status === name).length }))
    .filter((d) => d.value > 0)

  const toggleTodo = async (todo) => {
    const nextDone = !isTaskDone(todo)
    try {
      await updateDoc(doc(db, 'todos', todo.id), { done: nextDone })
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: nextDone } : t)))
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
  const dueSoonCount = actionableTenderDeadlines
    .map((t) => daysUntil(t.submissionDate))
    .filter((days) => days !== null && days >= 0 && days <= 7).length
  const overdueActiveTenders = actionableTenderDeadlines
    .filter((t) => t.submissionDate && isBeforeToday(t.submissionDate))
    .map((t) => ({ ...t, daysLeft: daysUntil(t.submissionDate) }))
  const todaysSubmissions = actionableTenderDeadlines
    .filter((t) => t.submissionDate && isSameLocalDay(t.submissionDate))
    .map((t) => ({ ...t, attentionType: 'Submission due today' }))
  const todaysOpenings = tenders
    .filter((t) => t.openingDate && isSameLocalDay(t.openingDate))
    .map((t) => ({ ...t, attentionType: 'Bid opening today' }))
  const todaysTasks = openTodos
    .filter((todo) => todo.dueDate && isSameLocalDay(todo.dueDate))
  const pendingBillFollowups = wonTenders.flatMap((tender) => [
    ...asArray(tender.bills).map((bill, index) => ({ ...bill, billType: 'Bill', tender, index })),
    ...asArray(tender.raBills).map((bill, index) => ({ ...bill, billType: 'RA Bill', tender, index })),
  ]).filter((bill) => {
    const status = String(bill.status || '').toLowerCase()
    return status && !['paid', 'completed', 'closed', 'rejected'].includes(status)
  })
  const actionRequiredItems = [
    ...overdueActiveTenders.slice(0, 3).map((t) => ({
      id: `overdue-${t.id}`,
      icon: AlertTriangle,
      type: 'Tender',
      title: t.name || 'Untitled tender',
      description: `${t.agency || 'Tender'} submission is overdue.`,
      dueDate: formatDashboardDate(t.submissionDate),
      status: getTenderDisplayStatus(t),
      priority: 'Overdue',
      tone: 'danger',
      onClick: () => navigate(`/tenders/${t.id}`),
    })),
    ...todaysSubmissions.slice(0, 3).map((t) => ({
      id: `submission-${t.id}`,
      icon: Clock,
      type: 'Submission',
      title: t.name || 'Untitled tender',
      description: `${t.agency || 'Tender'} requires submission today.`,
      dueDate: formatDashboardDate(t.submissionDate),
      status: getTenderDisplayStatus(t),
      priority: 'Today',
      tone: 'warning',
      onClick: () => navigate(`/tenders/${t.id}`),
    })),
    ...todaysOpenings.slice(0, 2).map((t) => ({
      id: `opening-${t.id}`,
      icon: CalendarCheck,
      type: 'Opening',
      title: t.name || 'Untitled tender',
      description: `${t.agency || 'Tender'} bid opening is scheduled today.`,
      dueDate: formatDashboardDate(t.openingDate),
      status: getTenderDisplayStatus(t),
      priority: 'Today',
      tone: 'info',
      onClick: () => navigate(`/tenders/${t.id}`),
    })),
    ...atRisk.slice(0, 2).map((po) => ({
      id: `po-${po.id}`,
      icon: Landmark,
      type: 'Pay Order',
      title: po.poNumber ? `Pay order #${po.poNumber}` : 'Pay order needs action',
      description: po.bank ? `${po.bank} is awaiting bid result.` : 'Submitted pay order is awaiting bid result.',
      dueDate: po.submittedDate ? formatDashboardDate(po.submittedDate) : null,
      status: po.bidResult || po.status || 'Awaiting',
      priority: 'Due Soon',
      tone: 'warning',
      onClick: () => navigate('/pay-orders'),
    })),
    ...securityFollowUps.slice(0, 3).map((po) => ({
      id: `security-${po.id}`,
      icon: Landmark,
      type: 'Security review',
      title: po.po ? `Pay order ${po.po}` : 'Security follow-up',
      description: po.v2?.followUpDate ? 'Scheduled refund follow-up' : 'Completed project still has held security; check eligibility.',
      dueDate: po.v2?.followUpDate ? formatDashboardDate(po.v2.followUpDate) : null,
      status: po.status || 'Held',
      priority: 'Review',
      tone: 'warning',
      onClick: () => navigate('/pay-orders'),
    })),
    ...todaysTasks.slice(0, 3).map((todo) => ({
      id: `task-${todo.id}`,
      icon: CheckSquare,
      type: 'Task',
      title: todo.text || 'Task due today',
      description: todo.tenderName || todo.notes || 'Open task due today.',
      dueDate: formatDashboardDate(todo.dueDate),
      status: todo.priority ? `${todo.priority} priority` : 'Open',
      priority: 'Today',
      tone: 'info',
      onClick: () => navigate('/todo'),
    })),
    ...pendingBillFollowups.slice(0, 2).map((bill) => ({
      id: `bill-${bill.tender.id}-${bill.billType}-${bill.id || bill.index}`,
      icon: ReceiptText,
      type: bill.billType,
      title: bill.billNo || bill.number || `${bill.billType} follow-up`,
      description: bill.tender.name || 'Tender billing follow-up',
      dueDate: bill.date ? formatDashboardDate(bill.date) : null,
      status: bill.status || 'Pending',
      priority: 'Due Soon',
      tone: 'success',
      onClick: () => navigate(`/tenders/${bill.tender.id}`),
    })),
  ].slice(0, 6)

  const totalQuoted = tenders.reduce((sum, tender) => sum + (Number(tender.quotedAmount) || Number(tender.value) || 0), 0)
  const totalBilled = wonTenders.reduce((sum, tender) => {
    const bills = Array.isArray(tender.bills) ? tender.bills : []
    const raBills = Array.isArray(tender.raBills) ? tender.raBills : []
    return sum + [...bills, ...raBills].reduce((billSum, bill) => billSum + billAmounts(bill).approved, 0)
  }, 0)
  const billingProgress = tenderFinancials.contractValue > 0
    ? Math.min(100, Math.round((totalBilled / tenderFinancials.contractValue) * 100))
    : null
  const pendingBillsAmount = pendingBillFollowups.reduce((sum, bill) => (
    sum + billAmounts(bill).approved
  ), 0)
  const receivableTenders = wonTenders
    .map((tender) => {
      const balance = projectFinancials(tender, expenses).outstanding
      return { id: tender.id, name: tender.name || 'Untitled tender', agency: tender.agency, balance }
    })
    .filter((item) => item.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 3)

  const recentActivity = [
    ...tenders.map((t) => ({
      id: `tender-${t.id}`,
      type: 'Tender',
      title: t.name || 'Tender updated',
      description: t.agency || 'Tender record',
      date: t.updatedAt || t.createdAt,
      href: `/tenders/${t.id}`,
      icon: FileText,
      actor: t.updatedBy || t.createdBy || t.ownerName,
    })),
    ...payOrders.map((po) => ({
      id: `po-${po.id}`,
      type: 'Pay Order',
      title: po.poNumber ? `Pay order #${po.poNumber}` : 'Pay order updated',
      description: po.bank || po.status || 'Pay order record',
      date: po.updatedAt || po.createdAt,
      href: '/pay-orders',
      icon: Landmark,
      actor: po.updatedBy || po.createdBy,
    })),
    ...expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      type: 'Expense',
      title: expense.title || expense.description || 'Expense added',
      description: formatCurrency(expense.amount),
      date: expense.updatedAt || expense.createdAt || expense.date,
      href: '/expenses',
      icon: ReceiptText,
      actor: expense.updatedBy || expense.createdBy,
    })),
    ...tenders.flatMap((tender) => [...asArray(tender.bills), ...asArray(tender.raBills)].map((bill, index) => ({
      id: `bill-activity-${tender.id}-${bill.id || index}`,
      type: bill.type || 'Bill',
      title: bill.billNo || bill.number || 'Bill updated',
      description: tender.name || 'Billing record',
      date: bill.updatedAt || bill.createdAt || bill.date,
      href: `/tenders/${tender.id}`,
      icon: ReceiptText,
      actor: bill.updatedBy || bill.createdBy,
    })),
    ...tenders.flatMap((tender) => asArray(tender.siteVisits).map((visit, index) => ({
      id: `visit-${tender.id}-${visit.id || index}`,
      type: 'Site Visit',
      title: visit.location || tender.name || 'Site visit added',
      description: tender.name || 'Project activity',
      date: visit.updatedAt || visit.createdAt || visit.visitDate || visit.date,
      href: `/tenders/${tender.id}`,
      icon: MapPin,
      actor: visit.updatedBy || visit.createdBy,
    }))),
    ...tenders.flatMap((tender) => asArray(tender.documents).map((documentItem, index) => ({
      id: `document-${tender.id}-${documentItem.id || index}`,
      type: 'Document',
      title: documentItem.title || documentItem.name || 'Document uploaded',
      description: tender.name || 'Tender document',
      date: documentItem.updatedAt || documentItem.uploadedAt || documentItem.createdAt,
      href: `/tenders/${tender.id}`,
      icon: FolderOpen,
      actor: documentItem.uploadedBy || documentItem.updatedBy || documentItem.createdBy,
    }))),
    ...todos.map((todo) => ({
      id: `task-activity-${todo.id}`,
      type: 'Task',
      title: todo.text || 'Task updated',
      description: todo.tenderName || todo.status || 'Task record',
      date: todo.updatedAt || todo.createdAt || todo.dueDate,
      href: '/todo',
      icon: CheckSquare,
      actor: todo.updatedBy || todo.createdBy,
    }))),
  ]
    .filter((item) => toMillis(item.date) > 0)
    .sort((a, b) => toMillis(b.date) - toMillis(a.date))
    .slice(0, 6)

  const quickLinks = [
    { label: 'Tenders', description: 'Manage tender pipeline', href: '/tenders', icon: FileStack, count: tenders.length },
    { label: 'Pay Orders', description: 'Track pay order status', href: '/pay-orders', icon: Landmark, count: payOrders.length },
    { label: 'Documents', description: 'Browse tender documents', href: '/documents', icon: FolderOpen, count: tenders.reduce((sum, tender) => sum + asArray(tender.documents).length, 0) },
    { label: 'Calendar', description: 'View deadlines and events', href: '/calendar', icon: CalendarIcon, count: dueSoonCount },
    { label: 'To-Do', description: 'Manage pending tasks', href: '/todo', icon: ListTodo, count: openTodos.length },
    { label: 'Expenses', description: 'Track project spending', href: '/expenses', icon: ReceiptText, count: expenses.length },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Daily control center</p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[32px]">
              Dashboard
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Track tenders, deadlines, pay orders, payments, and project activity.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{greeting}, {firstName}. Today is {todayLabel}.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button asChild className="h-10 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
              <Link to="/tenders?create=1"><Plus className="h-4 w-4" /> New Tender</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-xl">
              <Link to="/pay-orders"><Plus className="h-4 w-4" /> Pay Order</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-xl">
              <Link to="/expenses"><Plus className="h-4 w-4" /> Expense</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-xl">
              <Link to="/calendar"><CalendarIcon className="h-4 w-4" /> Calendar</Link>
            </Button>
          </div>
        </div>
      </section>

      {urgentAlerts.length > 0 && !alertDismissed && (
        <section className="relative overflow-hidden rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-900/70 dark:bg-amber-950/20 sm:p-5">
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
                    {urgentHeading}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-amber-900/75 dark:text-amber-100/75">
                    These tenders are due soon. Take action to stay on track.
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
                    className="flex min-w-0 items-start gap-3 rounded-xl border border-amber-200/80 bg-white/85 p-3.5 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-900/60 dark:bg-background/70 dark:hover:bg-amber-950/30"
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
                        {urgentDeadlineLabel(t.daysLeft)}
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

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <DashboardMetric icon={FileStack} title="Active Tenders" value={activeTenders.length} href="/tenders" tone="primary" helper="Open pipeline" trend={activeTenders.length > 0 ? String(activeTenders.length) : null} trendPositive={activeTenders.length > 0} />
        <DashboardMetric icon={Clock} title="Due Soon" value={dueSoonCount} href="/calendar" tone={dueSoonCount > 0 ? 'warning' : 'success'} helper="Next 7 days" trend={dueSoonCount === 0 ? 'Clear' : String(dueSoonCount)} trendPositive={dueSoonCount === 0} />
        <DashboardMetric icon={Landmark} title="Securities" value={payOrders.length} href="/pay-orders" tone={securityFollowUps.length ? 'warning' : 'info'} helper={`${securityFollowUps.length} refund follow-ups · ${atRisk.length} bid results`} trend={securityFollowUps.length > 0 ? String(securityFollowUps.length) : '0'} trendPositive={securityFollowUps.length === 0} />
        <DashboardMetric icon={Banknote} title="Approved bills outstanding" value={formatCurrency(receivable)} href="/reports" tone="info" helper="Approved less receipts and deductions" trendPositive={receivable === 0} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-xl border">
          <CardHeader className="pb-3">
            <DashboardSectionHeader
              title="Action Required"
              description="Items that need attention today or soon."
              action={(
                <Link to="/calendar">
                  <Button variant="outline" size="sm" className="h-9 rounded-lg">
                    Calendar <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            />
          </CardHeader>
          <CardContent className="pt-0">
            {actionRequiredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-4 text-center">
                <p className="text-sm font-semibold text-foreground">All clear</p>
                <p className="mt-1 text-xs text-muted-foreground">{securityFollowUps.length ? `${securityFollowUps.length} security refund follow-up(s) need review.` : 'No urgent tender deadlines, tasks, or scheduled security follow-ups.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {actionRequiredItems.map((item) => (
                  <AttentionItem key={item.id} {...item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-xl border">
          <CardHeader className="pb-3">
            <DashboardSectionHeader title="Financial Snapshot" description="Receivables, payments, expenses, and pending finance actions." />
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Approved bills outstanding</p>
                  <p className="mt-2 max-w-full overflow-x-auto whitespace-nowrap text-2xl font-semibold leading-tight text-emerald-950 tabular-nums dark:text-emerald-100 sm:text-3xl">
                    {formatCurrency(receivable)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-800/75 dark:text-emerald-100/70">
                    {formatCurrency(unbilled)} remains unbilled. Received {formatCurrency(tenderFinancials.totalReceived)} against {formatCurrency(tenderFinancials.contractValue)} contract value.
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white/75 px-3 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-background/60 dark:text-emerald-300">
                  {billingProgress === null ? '—' : `${billingProgress}% billed`}
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${billingProgress ?? 0}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FinanceMetricCard icon={FileStack} label="Quoted / Contract" value={formatCurrency(totalQuoted)} helper="Quoted total across tenders" />
              <FinanceMetricCard icon={ReceiptText} label="Project costs recorded" value={formatCurrency(totalExpenses)} helper={`Unassigned entries: ${formatCurrency(unassignedExpenses)}`} tone={totalExpenses > 0 ? 'warning' : 'success'} />
              <FinanceMetricCard icon={Banknote} label="Total Billed" value={formatCurrency(totalBilled)} helper={billingProgress === null ? 'No contract baseline' : `${billingProgress}% of contract value`} tone="success" />
              <FinanceMetricCard icon={Landmark} label="Known cash tied in securities" value={formatCurrency(payOrdersHeld)} helper={`${unknownSecurityFunding} guarantees have unknown funded margin`} tone={payOrdersHeld > 0 || unknownSecurityFunding > 0 ? 'warning' : 'success'} />
              <FinanceMetricCard icon={ReceiptText} label="Pending Bills" value={formatCurrency(pendingBillsAmount)} helper={`${pendingBillFollowups.length} bill follow-up${pendingBillFollowups.length === 1 ? '' : 's'}`} tone={pendingBillsAmount > 0 ? 'warning' : 'success'} />
              <FinanceMetricCard icon={Banknote} label="Forecast profit" value={forecastProfit === null ? 'Forecast incomplete' : formatCurrency(forecastProfit)} helper="Needs remaining-cost forecasts for every awarded project" tone={forecastProfit === null ? 'warning' : forecastProfit >= 0 ? 'success' : 'danger'} />
            </div>

            {receivableTenders.length > 0 && (
              <div className="rounded-xl border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">Receivable follow-ups</p>
                  <Link to="/tenders" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300">
                    View all
                  </Link>
                </div>
                <div className="mt-3 space-y-2">
                  {receivableTenders.map((item) => (
                    <Link
                      key={item.id}
                      to={`/tenders/${item.id}`}
                      className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
                        {item.agency && <span className="block truncate text-xs text-muted-foreground">{item.agency}</span>}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{formatCurrency(item.balance)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="rounded-xl border xl:col-span-3">
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

        <Card className="rounded-xl border xl:col-span-2">
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
        <Card className="overflow-hidden rounded-xl border">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock size={16} className="text-muted-foreground" />
                Upcoming Tenders
              </CardTitle>
              <CardDescription>Nearest submission deadlines requiring attention</CardDescription>
            </div>
            <Link to="/tenders?deadline=all">
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                View all upcoming <ChevronRight size={14} />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {allDeadlines.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">No upcoming deadlines</p>
                <p className="mt-1 text-xs text-muted-foreground">Upcoming tender submissions will appear here.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 px-3 pb-3 md:hidden">
                  {allDeadlines.map((t) => {
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => navigate(`/tenders/${t.id}`)}
                        className="w-full rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <FileStack size={17} aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{t.name || 'Untitled'}</p>
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.agency || '—'}</p>
                            {(t.nit || t.ref) && (
                              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{t.nit || t.ref}</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                            Submission
                          </span>
                          <StatusBadge status={getTenderDisplayStatus(t)} />
                          <DeadlineBadge tender={t} deadline={t.deadline} />
                          <span className="text-xs text-muted-foreground">{formatDashboardDate(t.submissionDate)}</span>
                        </div>

                        <div className="mt-3 flex items-center justify-end border-t pt-3">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            View Details <ChevronRight size={14} aria-hidden="true" />
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tender</TableHead>
                      <TableHead className="hidden md:table-cell">Agency</TableHead>
                      <TableHead className="hidden lg:table-cell">Type</TableHead>
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
                        <TableCell className="hidden text-muted-foreground lg:table-cell">Submission</TableCell>
                        <TableCell><StatusBadge status={getTenderDisplayStatus(t)} /></TableCell>
                        <TableCell className="text-right">
                          <DeadlineBadge tender={t} deadline={t.deadline} className="justify-center" />
                          <p className="mt-1 text-xs text-muted-foreground">{formatDashboardDate(t.submissionDate)}</p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-xl border">
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
                  const overdue = shouldShowTaskOverdue(todo)
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
                          {todo.dueDate ? `Due ${formatDashboardDate(todo.dueDate)}` : 'No due date'}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        id={`home-todo-${todo.id}`}
                        checked={isTaskDone(todo)}
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

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-xl border">
          <CardHeader className="pb-3">
            <DashboardSectionHeader title="Quick Links" description="Jump to important modules." />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {quickLinks.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className="flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{item.label}</span>
                    <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{item.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {item.count !== undefined && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{item.count}</span>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        <Card className="rounded-xl border">
          <CardHeader className="pb-3">
            <DashboardSectionHeader title="Recent Activity" description="Latest tender, pay order, document, expense, bill, and site visit updates." />
          </CardHeader>
          <CardContent className="pt-0">
            {recentActivity.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-foreground">No recent activity</p>
                <p className="mt-1 text-xs text-muted-foreground">Updates will appear here as tenders, pay orders, documents, and site visits are changed.</p>
              </div>
            ) : (
              <ul className="relative space-y-3 before:absolute before:bottom-3 before:left-[17px] before:top-3 before:w-px before:bg-border">
                {recentActivity.map((item) => {
                  const Icon = item.icon
                  const badgeClass = activityTone(item.type)
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.href}
                        className="relative flex min-w-0 items-start gap-3 rounded-xl border bg-background p-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <span className={cn('z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', badgeClass)}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{item.title}</span>
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', badgeClass)}>{item.type}</span>
                          </span>
                          <span className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.description}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDashboardDate(item.date)}</span>
                            {item.actor && <span>by {item.actor}</span>}
                          </span>
                        </span>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Link>
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
