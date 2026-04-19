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

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
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
export const PO_PURPOSES = ['Tender Fee', 'Bid Security', 'Performance Guarantee', 'Other']
export const BID_RESULTS = ['N/A', 'Awaiting', 'Won', 'Lost', 'Cancelled']
export const TENDER_STATUSES = ['Bidding', 'Submitted', 'Awarded', 'Lost', 'Cancelled']
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
