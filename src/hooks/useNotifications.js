import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { daysUntil, formatCurrency, isActionableTenderStatus, isTaskDone, sortByField } from '@/lib/utils'

const READ_KEY = 'grett-notifications-read'

function loadRead() {
  try {
    const raw = localStorage.getItem(READ_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function saveRead(set) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

function fmtDue(days) {
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days}d`
}

function fmtCompleted(days) {
  if (days === 0) return 'Completed today.'
  if (days < 0) return `Completed ${Math.abs(days)}d ago.`
  return `Completes in ${days}d.`
}

function timeAgo(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function typeLabel(type) {
  if (type === 'payOrder') return 'Pay order'
  if (type === 'todo') return 'Task'
  if (type === 'tender') return 'Tender'
  if (type === 'expense') return 'Expense'
  if (type === 'contact') return 'Contact'
  return 'Activity'
}

function groupActivityEntries(entries) {
  const groups = new Map()

  for (const entry of entries) {
    const label = typeLabel(entry.type)
    const action = entry.action || 'updated'
    const title = entry.title || '(untitled)'
    const entityKey = entry.entityId || title
    const key = `${entry.type || 'activity'}:${action}:${entityKey}`
    const existing = groups.get(key)

    if (existing) {
      existing.count += 1
      continue
    }

    groups.set(key, {
      ...entry,
      label,
      action,
      title,
      count: 1,
    })
  }

  return Array.from(groups.values())
}

function useCollectionLive(name, orderField, orderDir = 'desc', limitN) {
  const [data, setData] = useState([])
  useEffect(() => {
    const collectionRef = collection(db, name)
    const unsub = onSnapshot(
      collectionRef,
      (snap) => {
        const records = sortByField(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          orderField,
          orderDir,
        )
        setData(limitN ? records.slice(0, limitN) : records)
      },
      () => setData([]),
    )
    return unsub
  }, [name, orderField, orderDir, limitN])
  return data
}

export function useNotifications() {
  const tenders = useCollectionLive('tenders', 'createdAt')
  const todos = useCollectionLive('todos', 'createdAt')
  const events = useCollectionLive('calendarEvents', 'createdAt')
  const payOrders = useCollectionLive('payOrders', 'createdAt')
  const activity = useCollectionLive('activityLog', 'createdAt', 'desc', 5)

  const [readIds, setReadIds] = useState(() => loadRead())

  const items = useMemo(() => {
    const out = []

    for (const tender of tenders) {
      if (tender.status === 'Completed' && tender.completionDate) {
        const completedDays = daysUntil(tender.completionDate)
        if (completedDays !== null && completedDays <= 0 && completedDays >= -7) {
          const expectedProfit = tender.completionSnapshot?.expectedProfit ?? tender.completionSnapshot?.projectedProfit
          const cashPosition = tender.completionSnapshot?.cashPosition ?? tender.completionSnapshot?.realizedProfit
          const completedText = fmtCompleted(completedDays)
          const subtitle = expectedProfit == null
            ? completedText
            : cashPosition == null
              ? `${completedText} Expected profit: ${formatCurrency(expectedProfit)}.`
              : `${completedText} Expected profit: ${formatCurrency(expectedProfit)}. Cash position: ${formatCurrency(cashPosition)}.`

          out.push({
            id: `tender:${tender.id}:completed:${tender.completionDate}`,
            kind: 'tender',
            severity: 'normal',
            title: `Tender completed: ${tender.name || '(untitled tender)'}`,
            subtitle,
            sortKey: -50 + completedDays,
            to: `/tenders/${tender.id}`,
          })
        }
      }

      if (isActionableTenderStatus(tender.status)) {
        for (const [field, label] of [
          ['submissionDate', 'Tender submission'],
          ['openingDate', 'Tender opening'],
        ]) {
          const days = daysUntil(tender[field])
          if (days === null) continue
          if (days < -1 || days > 7) continue
          out.push({
            id: `tender:${tender.id}:${field}`,
            kind: 'tender',
            severity: days <= 1 ? 'high' : 'normal',
            title: `${label}: ${fmtDue(days)}`,
            subtitle: tender.name || '(untitled tender)',
            sortKey: days,
            to: `/tenders/${tender.id}`,
          })
        }
      }
    }

    for (const event of events) {
      const days = daysUntil(event.date)
      if (days === null) continue
      if (days < 0 || days > 7) continue
      out.push({
        id: `event:${event.id}`,
        kind: 'event',
        severity: days <= 1 ? 'high' : 'normal',
        title: `${event.eventType || 'Event'}: ${fmtDue(days)}`,
        subtitle: event.title || '(untitled event)',
        sortKey: days,
        to: '/calendar',
      })
    }

    for (const todo of todos) {
      if (isTaskDone(todo)) continue
      const days = daysUntil(todo.dueDate || todo.due)
      if (days === null) continue
      if (days > 3) continue
      out.push({
        id: `todo:${todo.id}`,
        kind: 'todo',
        severity: days <= 0 ? 'high' : 'normal',
        title: `Task due: ${fmtDue(days)}`,
        subtitle: todo.text || '(untitled todo)',
        sortKey: days,
        to: '/todo',
      })
    }

    for (const payOrder of payOrders) {
      if (payOrder.status !== 'Submitted') continue
      const days = daysUntil(payOrder.submitted)
      if (days === null) continue
      const ageDays = -days
      if (ageDays < 14) continue
      out.push({
        id: `payorder:${payOrder.id}:stale`,
        kind: 'payorder',
        severity: 'high',
        title: `Pay order still pending: ${payOrder.po || '(no PO#)'}`,
        subtitle: `${payOrder.purpose || 'Purpose not set'}${payOrder.amount ? ` for ${formatCurrency(payOrder.amount)}` : ''}. Submitted ${ageDays}d ago${payOrder.tender ? ` for ${payOrder.tender}` : ''}.`,
        sortKey: -100,
        to: '/pay-orders',
      })
    }

    for (const entry of groupActivityEntries(activity)) {
      const subtitle = [timeAgo(entry.createdAt), entry.by ? `by ${entry.by}` : null].filter(Boolean).join(' - ')
      const title = entry.count > 1
        ? `${entry.label} ${entry.title} ${entry.action} ${entry.count} times`
        : `${entry.label} ${entry.action}: ${entry.title}`
      out.push({
        id: entry.count > 1 ? `activity-group:${entry.type || 'activity'}:${entry.action}:${entry.entityId || entry.title}` : `activity:${entry.id}`,
        kind: 'activity',
        severity: 'low',
        title,
        subtitle,
        sortKey: 1000,
        to: '/activity',
      })
    }

    out.sort((a, b) => a.sortKey - b.sortKey)
    return out
  }, [tenders, todos, events, payOrders, activity])

  const unreadCount = useMemo(
    () => items.filter((i) => !readIds.has(i.id) && i.kind !== 'activity').length,
    [items, readIds],
  )

  const markAllRead = () => {
    const next = new Set(readIds)
    for (const item of items) next.add(item.id)
    setReadIds(next)
    saveRead(next)
  }

  const markRead = (id) => {
    if (readIds.has(id)) return
    const next = new Set(readIds)
    next.add(id)
    setReadIds(next)
    saveRead(next)
  }

  return { items, unreadCount, readIds, markAllRead, markRead }
}
