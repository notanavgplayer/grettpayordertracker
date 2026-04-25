import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'

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

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function daysFromToday(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  const ms = d.getTime() - startOfToday().getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function fmtDue(days) {
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days}d`
}

function useCollectionLive(name, orderField, orderDir = 'desc', limitN) {
  const [data, setData] = useState([])
  useEffect(() => {
    let q = query(collection(db, name), orderBy(orderField, orderDir))
    if (limitN) q = query(collection(db, name), orderBy(orderField, orderDir), limit(limitN))
    const unsub = onSnapshot(
      q,
      (snap) => setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
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
    const today = startOfToday()

    // Tender submission/opening within next 7 days (or overdue up to 1 day)
    for (const t of tenders) {
      for (const [field, label] of [
        ['submissionDate', 'Tender submission'],
        ['openingDate', 'Tender opening'],
      ]) {
        const days = daysFromToday(t[field])
        if (days === null) continue
        if (days < -1 || days > 7) continue
        out.push({
          id: `tender:${t.id}:${field}`,
          kind: 'tender',
          severity: days <= 1 ? 'high' : 'normal',
          title: t.name || '(untitled tender)',
          subtitle: `${label} — ${fmtDue(days)}`,
          sortKey: days,
          to: `/tenders/${t.id}`,
        })
      }
    }

    // Calendar events within next 7 days
    for (const e of events) {
      const days = daysFromToday(e.date)
      if (days === null) continue
      if (days < 0 || days > 7) continue
      out.push({
        id: `event:${e.id}`,
        kind: 'event',
        severity: days <= 1 ? 'high' : 'normal',
        title: e.title || '(untitled event)',
        subtitle: `${e.eventType || 'Event'} — ${fmtDue(days)}`,
        sortKey: days,
        to: '/calendar',
      })
    }

    // Open todos due within 3 days (or overdue)
    for (const t of todos) {
      if (t.done) continue
      const days = daysFromToday(t.dueDate)
      if (days === null) continue
      if (days > 3) continue
      out.push({
        id: `todo:${t.id}`,
        kind: 'todo',
        severity: days <= 0 ? 'high' : 'normal',
        title: t.text || '(untitled todo)',
        subtitle: `Due ${fmtDue(days)}`,
        sortKey: days,
        to: '/todo',
      })
    }

    // Pay orders stuck in 'Submitted' for >14 days
    for (const p of payOrders) {
      if (p.status !== 'Submitted') continue
      const days = daysFromToday(p.submitted)
      if (days === null) continue
      const ageDays = -days
      if (ageDays < 14) continue
      out.push({
        id: `payorder:${p.id}:stale`,
        kind: 'payorder',
        severity: 'high',
        title: p.po || '(no PO#)',
        subtitle: `Submitted ${ageDays}d ago — still pending`,
        sortKey: -100,
        to: '/pay-orders',
      })
    }

    // Recent activity (last 5)
    for (const a of activity) {
      const ts = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : null
      const ageMs = ts ? Date.now() - ts.getTime() : null
      const ageHours = ageMs != null ? Math.round(ageMs / 3600000) : null
      out.push({
        id: `activity:${a.id}`,
        kind: 'activity',
        severity: 'low',
        title: `${a.action || 'updated'} ${a.title || ''}`.trim(),
        subtitle: ageHours == null
          ? (a.by || 'system')
          : ageHours < 1
            ? 'Just now'
            : ageHours < 24
              ? `${ageHours}h ago`
              : `${Math.round(ageHours / 24)}d ago`,
        sortKey: 1000,
        to: '/activity',
      })
    }

    // Sort: highest priority (lowest sortKey = soonest) first
    out.sort((a, b) => a.sortKey - b.sortKey)
    return out
  }, [tenders, todos, events, payOrders, activity])

  const unreadCount = useMemo(
    () => items.filter((i) => !readIds.has(i.id) && i.kind !== 'activity').length,
    [items, readIds],
  )

  const markAllRead = () => {
    const next = new Set(readIds)
    for (const i of items) next.add(i.id)
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
