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

export function emailThreshold(days, preferences = {}) {
  if (days === 7 && preferences.sevenDays !== false) return 'seven-days'
  if (days === 3 && preferences.threeDays !== false) return 'three-days'
  if (days === 1 && preferences.oneDay !== false) return 'one-day'
  if (days === 0 && preferences.dueToday !== false) return 'due-today'
  return null
}

export function deliveryIdentity({ tenderId, dueDate, threshold, recipient }) {
  return crypto.createHash('sha256').update(`${tenderId}|${dueDate}|${threshold}|email|${String(recipient).toLowerCase()}`).digest('hex')
}
