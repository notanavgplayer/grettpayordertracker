import { isActionableTenderStatus } from './utils.js'

const DAY_MS = 86_400_000

export const DEFAULT_TENDER_REMINDER_PREFERENCES = Object.freeze({
  sevenDays: true,
  threeDays: true,
  oneDay: true,
  dueToday: true,
  overdue: true,
})

export function parseTenderDeadline(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    const date = value.toDate()
    if (Number.isNaN(date.getTime())) return null
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  }
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      return Number.isNaN(date.getTime()) ? null : date
    }
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function tenderDaysRemaining(value, now = new Date()) {
  const deadline = parseTenderDeadline(value)
  if (!deadline) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((deadline.getTime() - today.getTime()) / DAY_MS)
}

export function deadlineUrgency(days) {
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days === 0) return 'critical'
  if (days === 1) return 'very-urgent'
  if (days <= 3) return 'urgent'
  if (days <= 7) return 'attention'
  return 'upcoming'
}

export function deadlineLabel(days) {
  if (days === null) return 'No deadline'
  if (days < -1) return `${Math.abs(days)} days overdue`
  if (days === -1) return '1 day overdue'
  if (days === 0) return 'Due Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days remaining`
}

export function getTenderDeadline(tender = {}, now = new Date()) {
  if (!isActionableTenderStatus(tender.status)) return null
  const date = parseTenderDeadline(tender.submissionDate)
  if (!date) return null
  const days = tenderDaysRemaining(tender.submissionDate, now)
  return {
    date,
    dateValue: tender.submissionDate,
    days,
    urgency: deadlineUrgency(days),
    label: deadlineLabel(days),
    overdue: days < 0,
  }
}

export function getTenderReminderKey(days, preferences = DEFAULT_TENDER_REMINDER_PREFERENCES) {
  if (days < 0 && preferences.overdue !== false) return 'overdue'
  if (days === 0 && preferences.dueToday !== false) return 'due-today'
  if (days === 1 && preferences.oneDay !== false) return 'one-day'
  if (days >= 2 && days <= 3 && preferences.threeDays !== false) return 'three-days'
  if (days >= 2 && days <= 7 && preferences.sevenDays !== false) return 'seven-days'
  return null
}

export function getTenderReminderContent(tender, deadline) {
  const name = tender.name || 'Untitled tender'
  if (deadline.days < 0) return { title: 'Tender deadline passed', body: `${name} was due ${deadline.label.toLowerCase()}.` }
  if (deadline.days === 0) return { title: 'Tender due today', body: `${name} is due today.` }
  if (deadline.days === 1) return { title: 'Tender due tomorrow', body: `${name} must be submitted tomorrow.` }
  if (deadline.days <= 3) return { title: 'Tender due soon', body: `${name} is due in ${deadline.days} days.` }
  return { title: 'Tender deadline approaching', body: `${name} is due in ${deadline.days} days.` }
}

export function sortTenderDeadlines(tenders = [], now = new Date(), { includeOverdue = true } = {}) {
  return tenders
    .map((tender) => ({ tender, deadline: getTenderDeadline(tender, now) }))
    .filter(({ deadline }) => deadline && (includeOverdue || deadline.days >= 0))
    .sort((a, b) => {
      if (a.deadline.overdue !== b.deadline.overdue) return a.deadline.overdue ? -1 : 1
      if (a.deadline.overdue) return b.deadline.days - a.deadline.days
      return a.deadline.days - b.deadline.days
    })
}

export function matchesDeadlineFilter(deadline, filter) {
  if (!deadline) return false
  if (filter === 'today') return deadline.days === 0
  if (filter === 'three-days') return deadline.days >= 0 && deadline.days <= 3
  if (filter === 'seven-days') return deadline.days >= 0 && deadline.days <= 7
  if (filter === 'overdue') return deadline.days < 0
  return true
}
