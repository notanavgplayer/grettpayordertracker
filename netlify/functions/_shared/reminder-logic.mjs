import crypto from 'node:crypto'

export function karachiDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function daysFromDateStrings(from, to) {
  const parse = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
  }
  const start = parse(from); const end = parse(to)
  return start === null || end === null ? null : Math.round((end - start) / 86_400_000)
}

// Tightest first. A threshold is due once `days <= maxDays`, so a missed daily
// run catches up on the next one instead of skipping that reminder for good.
// reminderDeliveries dedupes each (tender, due date, threshold, recipient), so
// returning an already-sent threshold again on later days sends nothing.
const EMAIL_THRESHOLDS = [
  { key: 'due-today', preference: 'dueToday', maxDays: 0 },
  { key: 'one-day', preference: 'oneDay', maxDays: 1 },
  { key: 'three-days', preference: 'threeDays', maxDays: 3 },
  { key: 'seven-days', preference: 'sevenDays', maxDays: 7 },
]

export function emailThreshold(days, preferences = {}) {
  if (!Number.isInteger(days) || days < 0) return null
  return EMAIL_THRESHOLDS.find((threshold) => days <= threshold.maxDays && preferences[threshold.preference] !== false)?.key ?? null
}

export function deliveryIdentity({ tenderId, dueDate, threshold, recipient }) {
  return crypto.createHash('sha256').update(`${tenderId}|${dueDate}|${threshold}|email|${String(recipient).toLowerCase()}`).digest('hex')
}
