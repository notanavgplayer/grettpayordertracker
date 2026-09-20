import { nullableNumber } from './data.js'

export function billAmounts(bill = {}) {
  const submitted = nullableNumber(bill.amount ?? bill.submittedAmount) ?? 0
  const approvedValue = nullableNumber(bill.approvedAmount ?? bill.approved)
  const approved = approvedValue ?? submitted
  const receivedValue = nullableNumber(bill.receivedAmount ?? bill.received ?? bill.paidAmount)
  const received = receivedValue ?? (bill.status === 'Paid' ? approved : 0)
  const deductions = nullableNumber(bill.deductions) ?? 0

  return {
    submitted,
    approved,
    received,
    deductions,
    balance: Math.max(approved - received, 0),
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
  return nullableNumber(tender.awardWorkOrder?.contractValue)
    ?? nullableNumber(tender.value)
    ?? nullableNumber(tender.quotedAmount)
    ?? 0
}
