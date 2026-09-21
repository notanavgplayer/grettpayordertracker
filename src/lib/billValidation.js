import { nonNegativeNumber } from './data.js'

const BILL_AMOUNT_FIELDS = [
  ['amount', 'Submitted amount', 'bill-amount'],
  ['approvedAmount', 'Approved amount', 'bill-approved-amount'],
  ['receivedAmount', 'Received amount', 'bill-received-amount'],
  ['deductions', 'Deductions', 'bill-deductions'],
]

export function getInvalidBillAmount(form = {}, idPrefix = 'bill') {
  const invalid = BILL_AMOUNT_FIELDS.find(([key]) => form[key] !== '' && nonNegativeNumber(form[key]) === null)
  return invalid ? { key: invalid[0], label: invalid[1], id: invalid[2].replace(/^bill/, idPrefix) } : null
}
