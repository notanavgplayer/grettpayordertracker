import { useState, useMemo } from 'react'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { daysUntil, formatDate } from '@/lib/utils'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Loader2, CheckSquare } from 'lucide-react'
import { toast } from 'sonner'

const PRIORITY_STYLES = {
  high: { badge: 'destructive', dot: 'bg-red-500' },
  medium: { badge: 'pending', dot: 'bg-amber-500' },
  low: { badge: 'returned', dot: 'bg-green-500' },
  none: { badge: 'secondary', dot: 'bg-gray-400' },
}

const FILTERS = ['All', 'Open', 'Done', 'High Priority', 'Overdue']

export default function Todo() {
  const { data: todos, loading } = useCollection('todos', 'createdAt', 'desc')
  const { add, remove } = useFirestoreCRUD('todos')
  const { isAdmin } = useAuth()

  const [text, setText] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [filter, setFilter] = useState('Open')
  const [deleteId, setDeleteId] = useState(null)
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!text.trim()) return
    setAdding(true)
    try {
      await add({ text: text.trim(), priority, dueDate: dueDate || '', done: false })
      setText('')
      setDueDate('')
      setPriority('medium')
    } finally { setAdding(false) }
  }

  const toggleDone = async (todo) => {
    await updateDoc(doc(db, 'todos', todo.id), { done: !todo.done })
  }

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return todos.filter((t) => {
      switch (filter) {
        case 'Open': return !t.done
        case 'Done': return t.done
        case 'High Priority': return !t.done && t.priority === 'high'
        case 'Overdue': return !t.done && t.dueDate && t.dueDate < today
        default: return true
      }
    })
  }, [todos, filter])

  const open = todos.filter((t) => !t.done).length
  const done = todos.filter((t) => t.done).length

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <PageHeader title="To-Do" description="Track tasks and follow-ups" />

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span><strong className="text-foreground">{open}</strong> open</span>
        <span><strong className="text-foreground">{done}</strong> done</span>
      </div>

      {/* Add task input */}
      {isAdmin && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="New task…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="flex-1"
              />
              <div className="flex gap-2">
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['high', 'medium', 'low', 'none'].map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-36" />
                <Button onClick={handleAdd} disabled={adding || !text.trim()}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks" description={filter === 'Open' ? "You're all caught up!" : "No tasks match this filter."} />
      ) : (
        <div className="space-y-2">
          {filtered.map((todo) => {
            const days = todo.dueDate ? daysUntil(todo.dueDate) : null
            const overdue = days !== null && days < 0
            const ps = PRIORITY_STYLES[todo.priority] || PRIORITY_STYLES.none
            return (
              <div
                key={todo.id}
                className={`flex items-start gap-3 rounded-lg border p-3.5 transition-colors ${overdue && !todo.done ? 'border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800' : 'border-border bg-card hover:bg-accent/40'}`}
              >
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleDone(todo)}
                  className="mt-0.5 h-4 w-4 rounded border-border cursor-pointer accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${todo.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{todo.text}</p>
                  {todo.dueDate && (
                    <p className={`text-xs mt-0.5 ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {overdue ? `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}` : `Due ${formatDate(todo.dueDate)}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {todo.priority && todo.priority !== 'none' && (
                    <span className={`h-2 w-2 rounded-full ${ps.dot}`} title={todo.priority} />
                  )}
                  {isAdmin && (
                    <Button variant="ghost" size="icon-sm" className="text-destructive opacity-0 group-hover:opacity-100 hover:opacity-100" onClick={() => setDeleteId(todo.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={async () => { await remove(deleteId); toast.success('Task deleted'); setDeleteId(null) }} title="Delete task" description="This task will be permanently deleted." />
    </div>
  )
}
