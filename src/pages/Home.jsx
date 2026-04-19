import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { daysUntil, formatDate } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import StatusBadge from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import MetricCard from '@/components/shared/MetricCard'
import { MetricRowSkeleton } from '@/components/shared/LoadingSkeletons'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FileStack, FileText, CheckSquare, Trophy, AlertTriangle,
  Clock, ChevronRight, X, Calendar as CalendarIcon,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { toast } from 'sonner'

const TENDER_STATUS_COLORS = {
  Bidding: 'oklch(var(--chart-2))',
  Submitted: 'oklch(var(--chart-3))',
  Awarded: 'oklch(var(--chart-1))',
  Lost: 'oklch(var(--chart-5))',
  Cancelled: 'oklch(var(--chart-4))',
}

const PO_STATUS_COLORS = {
  Pending: 'oklch(var(--chart-3))',
  Submitted: 'oklch(var(--chart-2))',
  Returned: 'oklch(var(--chart-4))',
  Encashed: 'oklch(var(--chart-1))',
  Forfeited: 'oklch(var(--chart-5))',
}

export default function Home() {
  const { displayName } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenders, setTenders] = useState([])
  const [payOrders, setPayOrders] = useState([])
  const [todos, setTodos] = useState([])
  const [alertDismissed, setAlertDismissed] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [tSnap, pSnap, tOSnap] = await Promise.all([
          getDocs(query(collection(db, 'tenders'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'payOrders'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'todos'), orderBy('createdAt', 'desc'))),
        ])
        setTenders(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setPayOrders(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setTodos(tOSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } catch (e) {
        toast.error('Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const activeTenders = tenders.filter((t) => !['Awarded', 'Lost', 'Cancelled'].includes(t.status))
  const awardedTenders = tenders.filter((t) => t.status === 'Awarded')
  const atRisk = payOrders.filter((p) => p.status === 'Submitted' && p.bidResult === 'Awaiting')
  const openTodos = todos.filter((t) => !t.done)

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

  const tenderStatusData = Object.keys(TENDER_STATUS_COLORS).map((s) => ({
    status: s,
    count: tenders.filter((t) => t.status === s).length,
  }))

  const poStatusData = Object.keys(PO_STATUS_COLORS)
    .map((s) => ({ name: s, value: payOrders.filter((p) => p.status === s).length }))
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 h-72" />
          <Card className="h-72" />
        </div>
      </div>
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${(displayName || 'there').split(' ')[0]}`}
        description="Here's what's happening with your projects today."
      />

      {/* Urgent alerts */}
      {urgentAlerts.length > 0 && !alertDismissed && (
        <div className="relative rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <button
            onClick={() => setAlertDismissed(true)}
            aria-label="Dismiss urgent deadline alerts"
            className="absolute right-3 top-3 text-amber-700 dark:text-amber-300 hover:opacity-70"
          >
            <X size={16} />
          </button>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {urgentAlerts.length} urgent deadline{urgentAlerts.length > 1 ? 's' : ''}
              </p>
              <ul className="mt-1 space-y-0.5">
                {urgentAlerts.map((t) => (
                  <li key={t.id} className="text-sm text-amber-800/90 dark:text-amber-200/90">
                    <Link to={`/tenders/${t.id}`} className="hover:underline font-medium">
                      {t.name || 'Untitled'}
                    </Link>
                    {' — '}
                    {t.daysLeft === 0 ? 'due TODAY' : t.daysLeft === 1 ? 'due TOMORROW' : `in ${t.daysLeft} days`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Row 1: KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={FileStack} title="Active Tenders" value={activeTenders.length}
          href="/tenders" tone="primary" delta="Bidding or submitted" deltaPositive={null}
        />
        <MetricCard
          icon={FileText} title="POs At Risk" value={atRisk.length}
          href="/pay-orders" tone="warning" delta="Submitted, bid pending"
          deltaPositive={atRisk.length === 0 ? true : null}
        />
        <MetricCard
          icon={CheckSquare} title="Open Tasks" value={openTodos.length}
          href="/todo" tone="info" delta={openTodos.length === 0 ? 'All tasks done!' : 'Remaining'}
          deltaPositive={openTodos.length === 0 ? true : null}
        />
        <MetricCard
          icon={Trophy} title="Awarded Tenders" value={awardedTenders.length}
          href="/tenders" tone="success" delta="Won bids"
          deltaPositive={awardedTenders.length > 0 ? true : null}
        />
      </div>

      {/* Row 2: 2/3 chart + 1/3 donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tenders by Status</CardTitle>
            <CardDescription>Pipeline breakdown across all tenders</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tenderStatusData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <XAxis
                    dataKey="status"
                    stroke="oklch(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="oklch(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <RTooltip
                    cursor={{ fill: 'oklch(var(--muted) / 0.5)' }}
                    contentStyle={{
                      background: 'oklch(var(--popover))',
                      border: '1px solid oklch(var(--border))',
                      borderRadius: 'calc(var(--radius) - 2px)',
                      fontSize: 12,
                      color: 'oklch(var(--popover-foreground))',
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {tenderStatusData.map((d) => (
                      <Cell key={d.status} fill={TENDER_STATUS_COLORS[d.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pay Orders</CardTitle>
            <CardDescription>Current status distribution</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {poStatusData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No pay orders yet</p>
            ) : (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={poStatusData} dataKey="value" nameKey="name"
                        innerRadius={38} outerRadius={64} paddingAngle={2} strokeWidth={0}
                      >
                        {poStatusData.map((d) => (
                          <Cell key={d.name} fill={PO_STATUS_COLORS[d.name]} />
                        ))}
                      </Pie>
                      <RTooltip
                        contentStyle={{
                          background: 'oklch(var(--popover))',
                          border: '1px solid oklch(var(--border))',
                          borderRadius: 'calc(var(--radius) - 2px)',
                          fontSize: 12,
                          color: 'oklch(var(--popover-foreground))',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-4 space-y-2">
                  {poStatusData.map((d) => (
                    <li key={d.name} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ background: PO_STATUS_COLORS[d.name] }}
                        aria-hidden
                      />
                      <span className="text-foreground">{d.name}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Upcoming deadlines */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
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
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/tenders/${t.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <FileStack size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate">{t.name || 'Untitled'}</p>
                          <p className="text-xs text-muted-foreground md:hidden truncate">{t.agency || '—'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[240px]">
                      {t.agency || '—'}
                    </TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={
                        t.daysLeft <= 1 ? 'font-semibold text-rose-600 dark:text-rose-400'
                        : t.daysLeft <= 3 ? 'font-semibold text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                      }>
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

      {/* Row 4: Recent activity — open tasks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
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
        <CardContent className="pt-0">
          {openTodos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">All tasks complete!</p>
          ) : (
            <ul className="divide-y divide-border -my-2">
              {openTodos.slice(0, 7).map((todo) => {
                const overdue = todo.dueDate && daysUntil(todo.dueDate) < 0
                const iconTone = overdue
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : todo.priority === 'high'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-primary/10 text-primary'
                return (
                  <li key={todo.id} className="flex items-center gap-3 py-2.5">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${iconTone}`}>
                      {overdue ? <AlertTriangle size={16} /> : <CalendarIcon size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-tight truncate">{todo.text}</p>
                      {todo.dueDate && (
                        <p className={`text-xs mt-0.5 ${overdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                          Due {formatDate(todo.dueDate)}
                        </p>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      id={`home-todo-${todo.id}`}
                      checked={todo.done}
                      onChange={() => toggleTodo(todo)}
                      aria-label={`Mark task complete: ${todo.text}`}
                      className="h-4 w-4 rounded border-border cursor-pointer accent-primary flex-shrink-0"
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
