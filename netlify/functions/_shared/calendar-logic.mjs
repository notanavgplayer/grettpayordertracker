export const DEFAULT_THRESHOLDS = Object.freeze({ sevenDays: true, threeDays: true, oneDay: true, dueToday: true })
const ACTIVE_STATUSES = new Set(['draft', 'bidding', 'pending'])

export function isEligibleTender(tender = {}) {
  return ACTIVE_STATUSES.has(String(tender.status || '').trim().toLowerCase()) && /^\d{4}-\d{2}-\d{2}/.test(String(tender.submissionDate || ''))
}

export function calendarMappingId(uid, tenderId) { return `${uid}__${tenderId}` }

export function intendedCalendarOperation(mapping) { return mapping?.eventId ? 'update' : 'create' }

export function reminderMinutes(settings = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(settings.calendarThresholds || {}) }
  return [thresholds.sevenDays && 10080, thresholds.threeDays && 4320, thresholds.oneDay && 1440, thresholds.dueToday && 0].filter((value) => value !== false)
}

export function eventFromTender(tenderId, tender, settings = {}, siteUrl = 'https://grettpayordertracker.netlify.app') {
  const baseUrl = String(siteUrl).replace(/\/$/, '')
  const date = String(tender.submissionDate).slice(0, 10)
  const end = new Date(`${date}T12:00:00+05:00`); end.setDate(end.getDate() + 1)
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  const lines = [tender.agency && `Department: ${tender.agency}`, tender.nit && `Tender No: ${tender.nit}`, tender.value != null && `Estimated Amount: PKR ${Number(tender.value).toLocaleString('en-PK')}`, `Submission Deadline: ${date}`, `Tender Status: ${tender.status || 'Bidding'}`, `${baseUrl}/tenders/${encodeURIComponent(tenderId)}`].filter(Boolean)
  return { summary: `Tender Deadline — ${tender.name || 'Untitled tender'}`, description: lines.join('\n'), visibility: 'private', transparency: 'transparent', start: { date }, end: { date: endDate }, reminders: { useDefault: false, overrides: reminderMinutes(settings).map((minutes) => ({ method: 'popup', minutes })) }, extendedProperties: { private: { app: 'grett-pay-order-tracker', tenderId } } }
}
