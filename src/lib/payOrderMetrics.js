import { daysUntil } from './utils.js'
import { securityAmounts } from './financials.js'

export function isPendingBidResult(value) {
  const result = String(value || '').trim().toLowerCase()
  return result === '' || result === 'n/a' || result === 'awaiting' || result === 'pending'
}

export function getAtRiskPayOrders(payOrders = [], tenders = [], windowDays = 7) {
  const tendersById = new Map(tenders.map((tender) => [tender.id, tender]))
  return payOrders.filter((payOrder) => {
    if (!isPendingBidResult(payOrder.bidResult)) return false
    const days = daysUntil(tendersById.get(payOrder.tenderRef)?.submissionDate)
    return days !== null && days >= 0 && days <= windowDays
  })
}

export function getSecurityFollowUps(payOrders = [], tenders = [], today = new Date().toISOString().slice(0, 10)) {
  const completed = new Set(tenders.filter((tender) => tender.status === 'Completed').map((tender) => tender.id))
  return payOrders.filter((po) => {
    const remaining = securityAmounts(po).remaining
    if (remaining === null || remaining <= 0 || ['Forfeited', 'Encashed'].includes(po.status)) return false
    const next = po.v2?.followUpDate || po.v2?.eligibilityDate
    return Boolean((next && next <= today) || (['Held', 'Returned', 'Released'].includes(po.status) && completed.has(po.tenderRef) && !next))
  })
}
