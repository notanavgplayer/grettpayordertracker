import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
}

export function formatCurrency(amount) {
  if (!amount && amount !== 0) return '—'
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCurrencyPrecise(amount, maxDecimals) {
  if (amount === null || amount === undefined || amount === '') return '—'
  const numeric = Number(amount)
  if (Number.isNaN(numeric)) return amount
  const decimalPart = String(amount).includes('.') ? String(amount).split('.')[1] : ''
  const fractionDigits = maxDecimals === undefined
    ? decimalPart.length
    : Math.min(decimalPart.length, maxDecimals)

  return `Rs ${new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numeric)}`
}

export function calculateTenderFinancials(tender = {}) {
  const estimatedCost = tender.estimatedCost === '' || tender.estimatedCost === null || tender.estimatedCost === undefined
    ? null
    : Number(tender.estimatedCost)
  const quotedAmount = tender.quotedAmount === '' || tender.quotedAmount === null || tender.quotedAmount === undefined
    ? null
    : Number(tender.quotedAmount)
  const hasEstimate = Number.isFinite(estimatedCost)
  const hasQuote = Number.isFinite(quotedAmount)
  const canCompare = hasEstimate && hasQuote

  if (!canCompare) {
    return {
      estimatedCost: hasEstimate ? estimatedCost : null,
      quotedAmount: hasQuote ? quotedAmount : null,
      difference: null,
      percentage: null,
      positionLabel: '—',
      direction: 'none',
    }
  }

  const rawDifference = estimatedCost - quotedAmount
  const direction = rawDifference > 0 ? 'below' : rawDifference < 0 ? 'above' : 'at'
  const positionLabel = direction === 'below'
    ? 'Below Estimate'
    : direction === 'above'
      ? 'Above Estimate'
      : 'At Estimate'
  const percentage = estimatedCost !== 0 ? (Math.abs(rawDifference) / Math.abs(estimatedCost)) * 100 : null

  return {
    estimatedCost,
    quotedAmount,
    difference: Math.abs(rawDifference),
    percentage,
    positionLabel,
    direction,
  }
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  let value = dateStr
  if (typeof value?.toDate === 'function') value = value.toDate()
  else if (typeof value === 'object' && Number.isFinite(value?.seconds)) value = new Date(value.seconds * 1000)
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = parseDateAtStartOfDay(dateStr)
  if (!target) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
}

export function isTaskDone(task = {}) {
  const status = String(task.status || '').toLowerCase()
  return task.done === true || task.completed === true || status === 'done' || status === 'completed'
}

const ACTIONABLE_TENDER_STATUSES = new Set(['draft', 'bidding', 'pending'])
const CLOSED_TENDER_STATUSES = new Set([
  'in progress',
  'submitted',
  'completed',
  'won',
  'lost',
  'cancelled',
  'canceled',
  'rejected',
  'closed',
  'awarded',
])

export function isActionableTenderStatus(status) {
  return ACTIONABLE_TENDER_STATUSES.has(String(status || '').trim().toLowerCase())
}

export function isClosedTenderStatus(status) {
  return CLOSED_TENDER_STATUSES.has(String(status || '').trim().toLowerCase())
}

export function shouldShowTenderOverdue(tender = {}) {
  if (!isActionableTenderStatus(tender.status) || isClosedTenderStatus(tender.status)) return false
  const days = daysUntil(tender.submissionDate)
  return days !== null && days < 0
}

export function getTenderDisplayStatus(tender = {}) {
  if (shouldShowTenderOverdue(tender)) return 'Overdue'
  const status = String(tender.status || '').trim()
  if (status.toLowerCase() === 'overdue') {
    return tender.actualStatus || tender.baseStatus || tender.previousStatus || 'Bidding'
  }
  return status || 'Bidding'
}

export function shouldShowTaskOverdue(task = {}) {
  if (isTaskDone(task)) return false
  const days = daysUntil(task.dueDate || task.due)
  return days !== null && days < 0
}

function parseDateAtStartOfDay(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    const d = value.toDate()
    d.setHours(0, 0, 0, 0)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    }
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function normalizeSortValue(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (typeof value === 'number') return value

  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const time = Date.parse(text)
    if (!Number.isNaN(time)) return time
  }

  return text.toLowerCase()
}

export function sortByField(records = [], field = 'createdAt', dir = 'desc') {
  const direction = dir === 'asc' ? 1 : -1
  return [...records].sort((a, b) => {
    const left = normalizeSortValue(a?.[field])
    const right = normalizeSortValue(b?.[field])

    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    if (left > right) return direction
    if (left < right) return -direction
    return 0
  })
}

export function getInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function truncate(str, max = 60) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

export function toLocaleDateInputValue(dateStr) {
  if (!dateStr) return ''
  return dateStr.slice(0, 10)
}

export const PO_STATUSES = ['Pending', 'Submitted', 'Held', 'Returned', 'Released', 'Encashed', 'Forfeited']
export const PO_PURPOSES = ['Bid Security', 'Tender Fee', 'Performance Guarantee', 'Mobilization', 'Other']
export const BID_RESULTS = ['N/A', 'Awaiting', 'Won', 'Lost', 'Cancelled']
export const TENDER_STATUSES = ['Bidding', 'Submitted', 'Awarded', 'In Progress', 'Completed', 'Lost', 'Cancelled']
export const CONTACT_CATEGORIES = ['Agency Officer', 'Consultant', 'Supplier', 'Subcontractor', 'Other']
export const EXPENSE_CATEGORIES = [
  'Fuel / Transport',
  'Printing & Documentation',
  'Courier / Postage',
  'Site Visit Costs',
  'Tender Fees',
  'Office Supplies',
  'Labour / Daily Wages',
  'Equipment & Tools',
  'Food & Entertainment',
  'Miscellaneous',
]
export const BANKS = ['HBL', 'UBL', 'NBP', 'MCB', 'ABL', 'Meezan', 'Faysal', 'Bank Al-Habib', 'Silk Bank', 'Other']
