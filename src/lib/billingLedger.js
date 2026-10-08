import { nullableNumber } from './data.js'

export const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const amount = (value) => nullableNumber(value) ?? 0
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

export function deductionRowAmount(row, approvedGross, contract = null) {
  const adjustment = nullableNumber(row.adjustment ?? 0)
  if (adjustment === null) return null
  if (row.method === 'fixed') {
    const fixed = nullableNumber(row.fixedAmount)
    return fixed === null ? null : money(fixed + adjustment)
  }
  const base = row.base === 'contract' ? nullableNumber(contract)
    : row.base === 'fixed' ? nullableNumber(row.baseAmount) : nullableNumber(approvedGross)
  const rate = nullableNumber(row.rate)
  if (base === null || rate === null) return null
  return money(money(base * rate / 100) + adjustment)
}

export function billLedger(bill = {}, contract = null) {
  const billing = bill.v2?.billing
  const cumulative = billing?.basis === 'cumulative'
  const previous = cumulative ? amount(billing.previousCertifiedGross) : 0
  const submittedGross = amount(bill.amount ?? bill.submittedAmount)
  const approvedValue = nullableNumber(bill.approvedAmount ?? bill.approved)
  const approvedStatus = ['Approved', 'Paid', 'Partially Paid'].includes(bill.status)
  const approvedGross = approvedStatus ? (approvedValue ?? submittedGross) : 0
  const submitted = bill.status === 'Draft' ? 0 : money(Math.max(submittedGross - previous, 0))
  const approved = approvedStatus ? money(Math.max(approvedGross - previous, 0)) : 0
  const rows = billing?.deductionRows
  const rowAmounts = Array.isArray(rows) ? rows.map((row) => deductionRowAmount(row, approved, contract)) : null
  const deductions = rowAmounts
    ? rowAmounts.includes(null) ? null : approvedStatus ? money(rowAmounts.reduce((sum, value) => sum + value, 0)) : 0
    : bill.v2?.deductions
      ? money(Object.values(bill.v2.deductions).reduce((sum, value) => sum + amount(value), 0))
      : money(amount(bill.deductions))
  const retention = rowAmounts
    ? approvedStatus ? money(rows.reduce((sum, row, index) => sum + (row.kind === 'RM' ? rowAmounts[index] ?? 0 : 0), 0)) : 0
    : amount(bill.v2?.deductions?.retention)
  const releases = billing?.retentionReleases || []
  const retentionReleased = money(releases.reduce((sum, event) => sum + amount(event.amount), 0))
  const receiptEvents = bill.v2?.receipts
  const known = Array.isArray(receiptEvents) || nullableNumber(bill.receivedAmount ?? bill.received ?? bill.paidAmount) !== null
  const received = Array.isArray(receiptEvents)
    ? money(receiptEvents.filter((event) => !event.status || event.status === 'Cleared').reduce((sum, event) => sum + amount(event.amount), 0))
    : known ? money(amount(bill.receivedAmount ?? bill.received ?? bill.paidAmount)) : null
  const pending = Array.isArray(receiptEvents)
    ? money(receiptEvents.filter((event) => event.status === 'Pending Clearance').reduce((sum, event) => sum + amount(event.amount), 0)) : 0
  const net = deductions === null ? null : money(Math.max(approved - deductions, 0))
  return { submitted, approved, deductions, net, received, pending,
    balance: net === null || received === null ? null : money(Math.max(net - received, 0)),
    retention, retentionReleased, retentionHeld: money(Math.max(retention - retentionReleased, 0)),
    grossBasisKnown: Boolean(billing && ['cumulative', 'incremental'].includes(billing.basis) && Array.isArray(billing.deductionRows)),
    receiptHistoryKnown: known, previousCertifiedGross: previous }
}

export function billDisplayStatus(bill = {}) {
  if (!['Approved', 'Paid', 'Partially Paid'].includes(bill.status)) return bill.status || 'Draft'
  if (!bill.v2?.billing) return bill.status || 'Approved'
  const ledger = billLedger(bill, nullableNumber(bill.v2.billing.contractBasis))
  if (ledger.net === null || ledger.received === null) return 'Approved'
  if (ledger.net > 0 && ledger.received >= ledger.net) return 'Paid'
  if (ledger.received > 0) return 'Partially Paid'
  if (ledger.pending > 0) return 'Pending Clearance'
  return 'Approved'
}

export function validateBillingLedger(bill, contract = null) {
  const billing = bill.v2?.billing
  if (!billing) return null
  if (!['incremental', 'cumulative'].includes(billing.basis)) return 'Choose an incremental or cumulative gross basis.'
  if (['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && nullableNumber(bill.approvedAmount) === null) return 'Approved gross amount is required.'
  for (const field of ['amount', 'approvedAmount']) {
    const value = bill[field]
    if (value !== '' && value != null && (nullableNumber(value) === null || Number(value) < 0)) return `${field} must be a non-negative amount.`
  }
  if (billing.basis === 'cumulative' && (nullableNumber(billing.previousCertifiedGross) === null || Number(billing.previousCertifiedGross) < 0
    || (['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && Number(billing.previousCertifiedGross) > Number(bill.approvedAmount)))) return 'Previous certified gross cannot exceed cumulative approved gross.'
  if (billing.basis === 'cumulative' && amount(bill.amount) < amount(billing.previousCertifiedGross)) return 'Cumulative submitted gross cannot be below previous certified gross.'
  const ledger = billLedger(bill, contract)
  const rows = billing.deductionRows
  if (!Array.isArray(rows)) return 'Deduction rows are invalid.'
  const ids = new Set()
  for (const [index, row] of rows.entries()) {
    const label = `Deduction ${index + 1}`
    if (!row.id || ids.has(row.id)) return 'Deduction rows need unique IDs.'
    ids.add(row.id)
    if (!['RM', 'SRB', 'Income Tax', 'Other'].includes(row.kind)) return 'Choose a deduction type.'
    if (!['percentage', 'fixed'].includes(row.method)) return 'Choose a deduction method.'
    if (row.method === 'percentage' && !['approved', 'contract', 'fixed'].includes(row.base)) return 'Choose an explicit deduction base.'
    if (row.method === 'percentage' && (nullableNumber(row.rate) === null || Number(row.rate) < 0 || Number(row.rate) > 100)) return `${label}: enter a rate from 0 to 100%.`
    if (row.method === 'fixed' && (nullableNumber(row.fixedAmount) === null || Number(row.fixedAmount) < 0)) return `${label}: enter a non-negative fixed amount.`
    if (row.method === 'percentage' && row.base === 'contract' && nullableNumber(contract) === null) return `${label}: contract amount is missing. Choose another calculation base or record the contract.`
    if (row.base === 'fixed' && row.method === 'percentage' && (nullableNumber(row.baseAmount) === null || Number(row.baseAmount) < 0)) return `${label}: enter a non-negative documented base amount.`
    if (nullableNumber(row.adjustment ?? 0) === null) return `${label}: enter a valid adjustment amount.`
    if (Number(row.adjustment || 0) !== 0 && !row.reason?.trim()) return `${label}: explain the adjustment.`
    const calculated = deductionRowAmount(row, ledger.approved, contract)
    if (calculated === null || calculated < 0) return `${label}: calculated deduction must be non-negative.`
  }
  if (ledger.deductions === null || ledger.deductions > ledger.approved) return 'Deductions exceed the approved bill.'
  const receipts = bill.v2?.receipts || []
  if (receipts.length && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status)) return 'Approve the bill before recording receipts.'
  const receiptIds = new Set()
  const references = new Set()
  let allocated = 0
  for (const receipt of receipts) {
    if (!receipt.id || receiptIds.has(receipt.id)) return 'Receipt IDs must be unique.'
    receiptIds.add(receipt.id)
    if (receipt.status && !['Pending Clearance', 'Cleared', 'Bounced', 'Cancelled'].includes(receipt.status)) return 'Choose a receipt clearance status.'
    if (!validDate(receipt.date)) return 'Receipt needs a valid date.'
    if (nullableNumber(receipt.amount) === null || Number(receipt.amount) <= 0 || !receipt.reference?.trim() || !receipt.account?.trim()) return 'Receipt needs a positive amount, bank/account and reference.'
    const key = `${receipt.account.trim().toLowerCase()}|${receipt.reference.trim().toLowerCase()}`
    if (references.has(key)) return 'Duplicate receipt account and reference.'
    references.add(key)
    if (['Pending Clearance', 'Cleared'].includes(receipt.status)) allocated = money(allocated + Number(receipt.amount))
  }
  if (allocated > ledger.net) return 'Active receipts exceed net payable.'
  const releaseIds = new Set()
  const releaseReferences = new Set()
  if (billing.retentionReleases?.length && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status)) return 'Approve the bill before recording RM releases.'
  for (const release of billing.retentionReleases || []) {
    if (!release.id || releaseIds.has(release.id)) return 'Retention release IDs must be unique.'
    releaseIds.add(release.id)
    if (!validDate(release.date)
      || nullableNumber(release.amount) === null || Number(release.amount) <= 0 || !release.reference?.trim()) return 'Retention release needs date, positive amount and reference.'
    const key = `${String(release.account || '').trim().toLowerCase()}|${release.reference.trim().toLowerCase()}`
    if (releaseReferences.has(key)) return 'Duplicate RM release account and reference.'
    releaseReferences.add(key)
  }
  if (ledger.retentionReleased > ledger.retention) return 'Retention releases exceed RM withheld.'
  return null
}

export function validateCumulativeBill(bill, otherBills = []) {
  if (bill.v2?.billing?.basis !== 'cumulative') return null
  const currentDate = bill.date || bill.submitted || ''
  const earlierBills = otherBills.filter((item) => !currentDate || !(item.date || item.submitted) || (item.date || item.submitted) <= currentDate)
  if (earlierBills.some((item) => ['Approved', 'Paid', 'Partially Paid'].includes(item.status) && !item.v2?.billing)) return 'Earlier bill gross basis is unverified; reconcile it before a cumulative certificate.'
  const prior = money(earlierBills.reduce((sum, item) => sum + billLedger(item, nullableNumber(item.v2?.billing?.contractBasis)).approved, 0))
  return money(bill.v2.billing.previousCertifiedGross) === prior ? null : `Previous certified gross must match earlier approved bills (${prior}).`
}

export function validateProjectReceiptReferences(bill, otherBills = []) {
  const references = new Set(otherBills.flatMap((item) => item.v2?.receipts || [])
    .map((receipt) => `${String(receipt.account || '').trim().toLowerCase()}|${String(receipt.reference || '').trim().toLowerCase()}`))
  return (bill.v2?.receipts || []).some((receipt) => references.has(`${String(receipt.account || '').trim().toLowerCase()}|${String(receipt.reference || '').trim().toLowerCase()}`))
    ? 'Receipt account and reference are already allocated to another bill.' : null
}

export function transitionReceipt(receipt, status, date, reason = '') {
  const current = receipt.status || 'Cleared'
  if (current === status) return receipt
  const allowed = current === 'Pending Clearance' ? ['Cleared', 'Bounced', 'Cancelled']
    : current === 'Cleared' ? ['Bounced', 'Cancelled'] : []
  if (!allowed.includes(status)) throw new Error('This receipt status cannot be changed again.')
  if (['Bounced', 'Cancelled'].includes(status) && !reason.trim()) throw new Error('Reversal reason is required.')
  return { ...receipt, status, history: [...(receipt.history || [{ status: current, date: receipt.date }]), { status, date, reason: reason.trim() }] }
}
