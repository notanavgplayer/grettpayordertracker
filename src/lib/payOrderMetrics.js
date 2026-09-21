import { daysUntil } from './utils.js'

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
