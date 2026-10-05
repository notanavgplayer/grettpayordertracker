import { isActionableTenderStatus, isTaskDone } from './utils.js'

const KARACHI = 'Asia/Karachi'
const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: KARACHI, year: 'numeric', month: '2-digit', day: '2-digit',
})

export function validDateOnly(value) {
  if (typeof value !== 'string') return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(value)
  if (!match) return ''
  const [, year, month, day] = match
  const parsed = new Date(Date.UTC(+year, +month - 1, +day))
  return parsed.getUTCFullYear() === +year && parsed.getUTCMonth() === +month - 1 && parsed.getUTCDate() === +day
    ? `${year}-${month}-${day}` : ''
}

export function todayInKarachi(now = new Date()) {
  const parts = Object.fromEntries(dateParts.formatToParts(now).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function calendarDate(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const date = validDateOnly(value)
    if (!date) return ''
    // Stored date-only values are calendar days, not UTC instants.
    if (!/[T ]\d{2}:\d{2}/.test(value) || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return date
    const instant = new Date(value)
    return Number.isNaN(instant.getTime()) ? '' : todayInKarachi(instant)
  }
  const instant = typeof value?.toDate === 'function' ? value.toDate()
    : Number.isFinite(value?.seconds) ? new Date(value.seconds * 1000)
      : value instanceof Date ? value : null
  return instant && !Number.isNaN(instant.getTime()) ? todayInKarachi(instant) : ''
}

export function shiftDate(date, days) {
  const valid = validDateOnly(date)
  if (!valid) return ''
  const shifted = new Date(`${valid}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

export function dayDistance(from, to) {
  const a = validDateOnly(from), b = validDateOnly(to)
  return a && b ? (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000 : null
}

export function taskDue(task) { return calendarDate(task.dueDate || task.due) }
export function taskTitle(task) { return task.text || task.title || task.taskName || 'Untitled task' }
export function taskOverdue(task, today = todayInKarachi()) {
  const due = taskDue(task)
  return !isTaskDone(task) && !!due && due < today
}

const priorityRank = { high: 0, medium: 1, low: 2 }
export function filterTasks(tasks, { status = 'Open', search = '', priority = 'All', project = 'All', today = todayInKarachi() } = {}) {
  const query = search.trim().toLowerCase()
  return tasks.filter((task) => {
    const done = isTaskDone(task), due = taskDue(task)
    const matchesStatus = status === 'All' || (status === 'Open' && !done)
      || (status === 'Today' && !done && due === today)
      || (status === 'Upcoming' && !done && due > today)
      || (status === 'Overdue' && taskOverdue(task, today))
      || (status === 'Completed' && done)
      || (status === 'No Due Date' && !done && !due)
    return matchesStatus && (!query || `${taskTitle(task)} ${task.project || ''} ${task.category || ''}`.toLowerCase().includes(query))
      && (priority === 'All' || String(task.priority || '').toLowerCase() === priority.toLowerCase())
      && (project === 'All' || (task.project || '') === project)
  }).sort((a, b) => {
    if (isTaskDone(a) !== isTaskDone(b)) return isTaskDone(a) ? 1 : -1
    const ad = taskDue(a), bd = taskDue(b)
    if (!!ad !== !!bd) return ad ? -1 : 1
    if (ad !== bd) return ad.localeCompare(bd)
    return (priorityRank[String(a.priority || '').toLowerCase()] ?? 3) - (priorityRank[String(b.priority || '').toLowerCase()] ?? 3)
  })
}

function firstDate(record, keys) {
  for (const key of keys) {
    const date = calendarDate(record?.[key])
    if (date) return date
  }
  return ''
}

function firstDatedField(record, keys) {
  for (const key of keys) {
    const date = calendarDate(record?.[key])
    if (date) return { date, key }
  }
  return null
}

export function deriveCalendarEvents({ tenders = [], payOrders = [], todos = [], customEvents = [], today = todayInKarachi() }) {
  const events = []
  const push = (event) => { if (event.date) events.push(event) }
  for (const tender of tenders) {
    const name = tender.name || tender.title || 'Untitled tender'
    const base = { source: name, sourceType: 'tender', entityId: tender.id, link: `/tenders/${tender.id}` }
    const submission = calendarDate(tender.submissionDate)
    push({ ...base, id: `submission-${tender.id}`, date: submission, title: name,
      description: tender.agency || tender.nit || 'Tender submission', kind: 'submission',
      actionable: isActionableTenderStatus(tender.status),
      type: submission < today && isActionableTenderStatus(tender.status) ? 'overdue' : 'submission' })
    push({ ...base, id: `opening-${tender.id}`, date: calendarDate(tender.openingDate), title: `${name} opening`,
      description: tender.agency || tender.nit || 'Bid opening', kind: 'opening', type: 'opening' })
    const visits = Array.isArray(tender.siteVisits) ? tender.siteVisits : []
    const nestedDates = new Set(visits.map((visit) => firstDate(visit, ['date', 'visitDate', 'siteVisitDate'])).filter(Boolean))
    const topVisit = firstDate(tender, ['siteVisitDate', 'visitDate', 'siteVisit'])
    if (topVisit && !nestedDates.has(topVisit)) push({ ...base, id: `site-visit-${tender.id}`, date: topVisit,
      title: name, description: 'Site visit', kind: 'siteVisit', type: 'siteVisit' })
    visits.forEach((visit, index) => push({ ...base, id: `site-visit-${tender.id}-${visit.id || index}`,
      date: firstDate(visit, ['date', 'visitDate', 'siteVisitDate']), title: visit.location || name,
      description: visit.purpose || visit.workCompleted || 'Site visit', kind: 'siteVisit', type: 'siteVisit' }))
    ;(Array.isArray(tender.raBills) ? tender.raBills : []).forEach((bill, index) => {
      const recorded = firstDatedField(bill, ['dueDate', 'paymentDueDate', 'followUpDate', 'paid', 'submitted', 'date'])
      push({ ...base, id: `ra-${tender.id}-${bill.id || index}`, date: recorded?.date,
        title: bill.no ? `RA bill ${bill.no}` : `${name} RA bill`, description: name,
        kind: recorded && ['paid', 'submitted', 'date'].includes(recorded.key) ? 'billActivity' : 'payment',
        type: recorded && ['paid', 'submitted', 'date'].includes(recorded.key) ? 'billActivity' : 'payment' })
    })
  }
  for (const po of payOrders) {
    const date = firstDate(po.v2, ['followUpDate']) || firstDate(po, ['followUpDate', 'nextFollowUpDate'])
    push({ id: `pay-order-${po.id}`, date, title: po.po ? `PO #${po.po}` : 'Pay order follow-up',
      description: po.tender || po.bank || 'Pay order', source: po.tender || po.bank || 'Pay order',
      sourceType: 'payOrder', entityId: po.id, link: po.po ? `/pay-orders?search=${encodeURIComponent(po.po)}` : '/pay-orders', kind: 'payOrder', type: 'payOrder' })
    const activity = firstDatedField(po, ['returnDate', 'releaseDate', 'released', 'submitted', 'date'])
    if (activity && activity.date !== date) push({ id: `pay-order-activity-${po.id}`, date: activity.date,
      title: po.po ? `PO #${po.po}` : 'Pay order',
      description: ({ returnDate: 'Return date recorded', releaseDate: 'Release date recorded', released: 'Release date recorded', submitted: 'Submission date recorded', date: 'Instrument date recorded' })[activity.key],
      source: po.tender || po.bank || 'Pay order', sourceType: 'payOrder', entityId: po.id,
      link: po.po ? `/pay-orders?search=${encodeURIComponent(po.po)}` : '/pay-orders',
      kind: 'instrumentActivity', type: 'instrumentActivity' })
  }
  for (const task of todos) {
    if (isTaskDone(task)) continue
    const date = taskDue(task)
    push({ id: `task-${task.id}`, date, title: taskTitle(task), description: task.project || task.category || 'Task',
      source: task.project || 'To-Do', sourceType: 'task', entityId: task.id, link: `/todo?task=${encodeURIComponent(task.id)}`,
      kind: 'task', type: date < today ? 'overdue' : 'task' })
  }
  for (const event of customEvents) {
    push({ id: `custom-${event.id}`, date: calendarDate(event.date), title: event.title || 'Custom event',
      description: event.notes || event.eventType || 'Event', source: 'Manual event', sourceType: 'custom',
      entityId: event.id, raw: event, kind: 'custom', type: /site/i.test(event.eventType || '') ? 'siteVisit' : 'custom' })
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
