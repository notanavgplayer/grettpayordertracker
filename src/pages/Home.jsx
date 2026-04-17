import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { daysUntil, formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import MetricCard from '@/components/shared/MetricCard'
import { MetricRowSkeleton } from '@/components/shared/LoadingSkeletons'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FileStack, FileText, CheckSquare, Trophy, AlertTriangle,
  Clock, ChevronRight, X, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

export default function Home() {
  const { displayName } = useAuth()
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
  const atRisk = payOrders.filter((p) => p.status === 'Submitted')
  const openTodos = todos.filter((t) => !t.done)

  const upcomingDeadlines = activeTenders
    .filter((t) => t.submissionDate)
    .map((t) => ({ ...t, daysLeft: daysUntil(t.submissionDate) }))
    .filter((t) => t.daysLeft !== null && t.daysLeft <= 7 && t.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const allDeadlines = activeTenders
    .filter((t) => t.submissionDate)
    .map((t) => ({ ...t, daysLeft: daysUntil(t.submissionDate) }))
    .filter((t) => t.daysLeft !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8)

  const urgentAlerts = upcomingDeadlines.filter((t) => t.daysLeft <= 2)

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
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <MetricRowSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[0, 1, 2, 3, 4].map((r) => (
                  <div key={r} className="flex items-center justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={`${greeting}, ${displayName.split(' ')[0]}`}
        description="Here's what's happening with your projects today."
      />

      {/* Urgent alerts */}
      {urgentAlerts.length > 0 && !alertDismissed && (
        <div className="relative rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4">
          <button
            onClick={() => setAlertDismissed(true)}
            className="absolute right-3 top-3 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {urgentAlerts.length} urgent deadline{urgentAlerts.length > 1 ? 's' : ''}
              </p>
              <ul className="mt-1 space-y-0.5">
                {urgentAlerts.map((t) => (
                  <li key={t.id} className="text-sm text-amber-700 dark:text-amber-400">
                    <Link to={`/tenders/${t.id}`} className="hover:underline font-medium">{t.name || 'Untitled'}</Link>
                    {' — '}
                    {t.daysLeft === 0 ? 'due TODAY' : t.daysLeft === 1 ? 'due TOMORROW' : `in ${t.daysLeft} days`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={FileStack} title="Active Tenders"   value={activeTenders.length}   href="/tenders"     mono={false} />
        <MetricCard icon={FileText}  title="POs At Risk"      value={atRisk.length}          href="/pay-orders"  mono={false} />
        <MetricCard icon={CheckSquare} title="Open Tasks"     value={openTodos.length}       href="/todo"        mono={false} />
        <MetricCard icon={Trophy}    title="Awarded Tenders"  value={awardedTenders.length}  href="/tenders"     mono={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming deadlines */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Upcoming Submissions
              </CardTitle>
              <Link to="/tenders">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  View all <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {allDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No upcoming deadlines</p>
            ) : (
              allDeadlines.map((t) => (
                <Link key={t.id} to={`/tenders/${t.id}`}>
                  <div className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{t.name || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.agency || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <StatusBadge status={t.status} />
                      <span className={`text-xs font-semibold ${
                        t.daysLeft <= 1 ? 'text-red-600 dark:text-red-400' :
                        t.daysLeft <= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                      }`}>
                        {t.daysLeft === 0 ? 'Today' : t.daysLeft === 1 ? 'Tomorrow' : `${t.daysLeft}d`}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Open Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
                Open Tasks
              </CardTitle>
              <Link to="/todo">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  View all <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            {openTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">All tasks complete!</p>
            ) : (
              openTodos.slice(0, 7).map((todo) => (
                <div key={todo.id} className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => toggleTodo(todo)}
                    className="mt-0.5 h-4 w-4 rounded border-border cursor-pointer accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-tight">{todo.text}</p>
                    {todo.dueDate && (
                      <p className={`text-xs mt-0.5 ${daysUntil(todo.dueDate) < 0 ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`}>
                        Due {formatDate(todo.dueDate)}
                      </p>
                    )}
                  </div>
                  <PriorityDot priority={todo.priority} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PriorityDot({ priority }) {
  const colors = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-green-500' }
  if (!priority || priority === 'none') return null
  return <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${colors[priority] || 'bg-gray-400'}`} />
}
