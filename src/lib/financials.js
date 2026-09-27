import { nullableNumber } from './data.js'

export function billAmounts(bill = {}) {
  const submitted = nullableNumber(bill.amount ?? bill.submittedAmount) ?? 0
  const approvedValue = nullableNumber(bill.approvedAmount ?? bill.approved)
  const approved = approvedValue ?? (['Approved', 'Paid'].includes(bill.status) ? submitted : 0)
  const receivedValue = nullableNumber(bill.receivedAmount ?? bill.received ?? bill.paidAmount)
  const received = Array.isArray(bill.v2?.receipts)
    ? bill.v2.receipts.reduce((sum, event) => sum + (nullableNumber(event.amount) ?? 0), 0)
    : receivedValue ?? (bill.status === 'Paid' ? approved : 0)
  const deductions = bill.v2?.deductions
    ? Object.values(bill.v2.deductions).reduce((sum, value) => sum + (nullableNumber(value) ?? 0), 0)
    : nullableNumber(bill.deductions) ?? 0

  return {
    submitted,
    approved,
    received,
    deductions,
    balance: Math.max(approved - received - deductions, 0),
  }
}

export function billDate(bill = {}) {
  return bill.paid || bill.submitted || bill.date || bill.submittedDate || ''
}

export function billNumber(bill = {}) {
  return bill.no || bill.billNo || ''
}

export function sumReceived(items = []) {
  return items.reduce((total, item) => total + billAmounts(item).received, 0)
}

export function tenderBillTotals(tender = {}, { combineBillTypes = true } = {}) {
  const billsReceived = sumReceived(tender.bills || [])
  const raBillsReceived = sumReceived(tender.raBills || [])
  return {
    billsReceived,
    raBillsReceived,
    // The application historically combines these two ledgers. Keep that
    // behavior explicit until the business confirms whether they overlap.
    totalReceived: combineBillTypes ? billsReceived + raBillsReceived : Math.max(billsReceived, raBillsReceived),
  }
}

export function tenderContractValue(tender = {}) {
  return nullableNumber(tender.v2?.revisedContractValue)
    ?? nullableNumber(tender.awardWorkOrder?.contractValue)
    ?? nullableNumber(tender.value)
    ?? 0
}

export const projectId = (record = {}) => record.tenderRef || record.tenderId || ''

export function expenseAmounts(expense = {}) {
  const amount = nullableNumber(expense.amount) ?? 0
  const kind = expense.v2?.kind || 'cost'
  const incurred = ['cost', 'overhead'].includes(kind) ? amount : 0
  const payments = expense.v2?.payments
  const paid = Array.isArray(payments)
    ? payments.reduce((sum, event) => sum + (nullableNumber(event.amount) ?? 0), 0)
    : null
  const payable = !['cost', 'overhead'].includes(kind) ? 0 : paid === null ? null : Math.max(amount - paid, 0)
  return { incurred, paid, payable, kind }
}

export function projectFinancials(tender = {}, expenses = []) {
  const rows = expenses.filter((expense) => projectId(expense) === tender.id)
  const costs = rows.map(expenseAmounts)
  const incurred = costs.reduce((sum, item) => sum + item.incurred, 0)
  const knownPaid = costs.filter((item) => item.paid !== null).reduce((sum, item) => sum + (item.kind === 'owner-funding' ? -item.paid : item.paid), 0)
  const paidCostsKnown = costs.filter((item) => ['cost', 'overhead'].includes(item.kind)).reduce((sum, item) => sum + (item.paid ?? 0), 0)
  const paid = costs.some((item) => item.paid === null) ? null : knownPaid
  const payable = costs.some((item) => item.payable === null) ? null : costs.reduce((sum, item) => sum + (item.payable ?? 0), 0)
  const knownPayable = costs.reduce((sum, item) => sum + (item.payable ?? 0), 0)
  const unknownPaymentCount = costs.filter((item) => item.payable === null).length
  const bills = [...(tender.bills || []), ...(tender.raBills || [])].map(billAmounts)
  const submitted = bills.reduce((sum, item) => sum + item.submitted, 0)
  const received = bills.reduce((sum, item) => sum + item.received, 0)
  const outstanding = bills.reduce((sum, item) => sum + item.balance, 0)
  const retention = [...(tender.bills || []), ...(tender.raBills || [])].reduce((sum, bill) => sum + (nullableNumber(bill.v2?.deductions?.retention) ?? 0), 0)
  const contract = tenderContractValue(tender)
  const remaining = nullableNumber(tender.v2?.forecastRemaining)
  const finalCost = remaining === null ? null : incurred + remaining
  const profit = finalCost === null ? null : contract - finalCost
  return { contract, incurred, paid, paidCostsKnown, payable, knownPayable, unknownPaymentCount, submitted, received, outstanding, retention,
    unbilled: Math.max(contract - submitted, 0), remaining, finalCost, profit,
    margin: profit === null || contract <= 0 ? null : profit / contract * 100,
    cash: paid === null ? null : received - paid,
    unallocated: rows.filter((row) => !row.v2?.boqItemId).reduce((sum, row) => sum + expenseAmounts(row).incurred, 0) }
}

export function securityAmounts(po = {}) {
  const guarantee = po.v2?.instrument === 'guarantee'
  const funded = guarantee ? nullableNumber(po.v2?.fundedCash) : nullableNumber(po.v2?.fundedCash) ?? nullableNumber(po.amount) ?? 0
  const refunded = (po.v2?.refunds || []).reduce((sum, event) => sum + (nullableNumber(event.amount) ?? 0), 0)
  return { funded, refunded, remaining: ['Encashed', 'Forfeited'].includes(po.status) ? 0 : funded === null ? null : Math.max(funded - refunded, 0),
    exposure: guarantee && !['Released', 'Forfeited', 'Encashed'].includes(po.status) ? nullableNumber(po.amount) ?? 0 : 0 }
}

export function executionState(tender = {}) {
  return ['Completed', 'In Progress', 'On Hold'].includes(tender.status) ? tender.status : tender.awardWorkOrder?.awardStatus || tender.status || 'Pending'
}

export function validateEvents(events, limit) {
  if (!Array.isArray(events)) return 'Transaction list is invalid.'
  const ids = new Set()
  for (const event of events) {
    if (!event.id || ids.has(event.id)) return 'Each transaction needs a unique ID.'
    ids.add(event.id)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date || '') || Number.isNaN(Date.parse(event.date))) return 'Each transaction needs a valid date.'
    if (nullableNumber(event.amount) === null || Number(event.amount) <= 0) return 'Each transaction amount must be positive.'
    if (!event.account?.trim() || !event.reference?.trim()) return 'Each transaction needs an account and reference.'
  }
  if (events.reduce((sum, event) => sum + Number(event.amount), 0) > limit + 0.001) return 'Transactions exceed the available amount.'
  return null
}

export function validateBillLedger(bill = {}) {
  const approved = nullableNumber(bill.approvedAmount) ?? (['Approved', 'Paid'].includes(bill.status) ? nullableNumber(bill.amount) ?? 0 : 0)
  const deductions = bill.v2?.deductions
    ? Object.values(bill.v2.deductions).reduce((sum, value) => sum + (nullableNumber(value) ?? 0), 0)
    : nullableNumber(bill.deductions) ?? 0
  if (deductions < 0 || deductions > approved) return 'Deductions exceed the approved bill.'
  if (bill.v2?.receipts) return validateEvents(bill.v2.receipts, approved - deductions)
  if ((nullableNumber(bill.receivedAmount) ?? 0) > approved - deductions) return 'Received amount exceeds the approved bill after deductions.'
  return null
}
