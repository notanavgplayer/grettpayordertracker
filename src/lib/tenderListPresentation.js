import { nullableNumber } from './data.js'
import { parseTenderDeadline } from './tenderDeadlines.js'

export function validTenderSubmissionDate(value) {
  const date = parseTenderDeadline(value)
  if (!date) return false
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const recorded = value.slice(0, 10)
    const normalized = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return recorded === normalized
  }
  return true
}

// Labels the first actually recorded amount without equating estimates, bids and contracts.
export function tenderListAmount(tender = {}) {
  const contractStage = ['Awarded', 'Won', 'In Progress', 'Completed'].includes(tender.status)
  const candidates = contractStage
    ? [
        [tender.v2?.revisedContractValue, 'Revised contract'],
        [tender.awardWorkOrder?.contractValue, 'Awarded contract'],
        [tender.value, 'Recorded tender value'],
        [tender.quotedAmount, 'Quoted bid'],
        [tender.estimatedCost, 'Estimate'],
      ]
    : [
        [tender.quotedAmount, 'Quoted bid'],
        [tender.estimatedCost, 'Estimate'],
        [tender.value, 'Recorded tender value'],
      ]
  for (const [raw, label] of candidates) {
    const amount = nullableNumber(raw)
    if (amount !== null) return { amount, label }
  }
  return { amount: null, label: 'Amount not recorded' }
}
