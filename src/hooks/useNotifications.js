import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { daysUntil, formatCurrency, isActionableTenderStatus, isTaskDone, sortByField } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { getTenderDeadline, getTenderReminderContent, getTenderReminderKey } from '@/lib/tenderDeadlines'
import { useTenderReminderSettings } from '@/hooks/useTenderReminderSettings'

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
  const [error, setError] = useState('')
  useEffect(() => {
    const collectionRef = collection(db, name)
    const source = limitN
      ? query(collectionRef, orderBy(orderField, orderDir), limit(limitN))
      : collectionRef
    const unsub = onSnapshot(
      source,
      (snap) => {
        const records = sortByField(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          orderField,
          orderDir,
        )
        setData(records)
        setError('')
      },
      (readError) => {
        console.error(`Notification source ${name} failed`, readError)
        setError('Some notifications could not be loaded. Check your connection or permissions.')
      },
    )
    return unsub
  }, [name, orderField, orderDir, limitN])
  return { data, error }
}

export function useNotifications() {
  const { user } = useAuth()
  const reminderState = useTenderReminderSettings()
  const tenderState = useCollectionLive('tenders', 'createdAt')
  const todoState = useCollectionLive('todos', 'createdAt')
  const eventState = useCollectionLive('calendarEvents', 'createdAt')
  const payOrderState = useCollectionLive('payOrders', 'createdAt')
  const activityState = useCollectionLive('activityLog', 'createdAt', 'desc', 5)
  const tenders = tenderState.data
  const todos = todoState.data
  const events = eventState.data
  const payOrders = payOrderState.data
  const activity = activityState.data
  const error = tenderState.error || todoState.error || eventState.error || payOrderState.error || activityState.error

  const { readIds, preferences, browserEnabled } = reminderState

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
        const deadline = getTenderDeadline(tender)
        const reminderKey = deadline ? getTenderReminderKey(deadline.days, preferences) : null
        if (deadline && reminderKey) {
          const content = getTenderReminderContent(tender, deadline)
          out.push({
            id: `tender-deadline:${tender.id}:${deadline.dateValue}:${reminderKey}`,
            kind: 'tender-deadline',
            severity: deadline.days <= 1 ? 'high' : 'normal',
            title: content.title,
            subtitle: content.body,
            sortKey: deadline.days,
            to: `/tenders/${tender.id}`,
          })
        }

        const openingDays = daysUntil(tender.openingDate)
        if (openingDays !== null && openingDays >= 0 && openingDays <= 7) {
          out.push({
            id: `tender:${tender.id}:openingDate:${tender.openingDate}`,
            kind: 'tender',
            severity: openingDays <= 1 ? 'high' : 'normal',
            title: `Tender opening: ${fmtDue(openingDays)}`,
            subtitle: tender.name || '(untitled tender)',
            sortKey: openingDays + 0.5,
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
  }, [tenders, todos, events, payOrders, activity, preferences])

  useEffect(() => {
    if (!browserEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const key = `grett-browser-notifications:${user?.uid || 'anonymous'}`
    let delivered = []
    try { delivered = JSON.parse(localStorage.getItem(key) || '[]') } catch {}
    const deliveredSet = new Set(delivered)
    const pending = items.filter((item) => item.kind === 'tender-deadline' && !readIds.has(item.id) && !deliveredSet.has(item.id))
    for (const item of pending) {
      new Notification(item.title, { body: item.subtitle, tag: item.id })
      deliveredSet.add(item.id)
    }
    try { localStorage.setItem(key, JSON.stringify(Array.from(deliveredSet).slice(-200))) } catch {}
  }, [browserEnabled, items, readIds, user?.uid])

  const unreadCount = useMemo(
    () => items.filter((i) => !readIds.has(i.id) && i.kind !== 'activity').length,
    [items, readIds],
  )

  const markAllRead = () => {
    reminderState.markAllRead(items.map((item) => item.id))
  }

  const markRead = (id) => {
    reminderState.markRead(id)
  }

  return { items, unreadCount, readIds, markAllRead, markRead, error }
}
