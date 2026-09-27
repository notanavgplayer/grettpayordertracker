import test from 'node:test'
import assert from 'node:assert/strict'
import { stripUndefined, nullableNumber, nonNegativeNumber, safeHttpUrl, serializeBackupValue } from '../src/lib/data.js'
import { billAmounts, billDate, billNumber, tenderBillTotals, projectFinancials, expenseAmounts, securityAmounts, executionState, validateEvents, validateBillLedger } from '../src/lib/financials.js'
import { reviewV2Backup, applyV2Patches } from '../src/lib/migrationReview.js'
import { getSecurityFollowUps } from '../src/lib/payOrderMetrics.js'
import { csvCell, safeSpreadsheetText } from '../src/lib/csv.js'
import { formatDate } from '../src/lib/utils.js'
import {
  deadlineLabel,
  getTenderDeadline,
  getTenderReminderKey,
  matchesDeadlineFilter,
  sortTenderDeadlines,
  tenderDaysRemaining,
} from '../src/lib/tenderDeadlines.js'

test('stripUndefined preserves non-plain SDK-style values', () => {
  class TimestampLike { constructor(seconds) { this.seconds = seconds } }
  const timestamp = new TimestampLike(10)
  const result = stripUndefined({ timestamp, nested: { missing: undefined, kept: 0 } })
  assert.equal(result.timestamp, timestamp)
  assert.deepEqual(result.nested, { kept: 0 })
})

test('nullableNumber distinguishes empty from zero', () => {
  assert.equal(nullableNumber(''), null)
  assert.equal(nullableNumber(null), null)
  assert.equal(nullableNumber('0'), 0)
  assert.equal(nullableNumber('invalid'), null)
})

test('nonNegativeNumber rejects blank, invalid, and negative financial input', () => {
  assert.equal(nonNegativeNumber(''), null)
  assert.equal(nonNegativeNumber('invalid'), null)
  assert.equal(nonNegativeNumber('-1'), null)
  assert.equal(nonNegativeNumber('0'), 0)
  assert.equal(nonNegativeNumber('12.50'), 12.5)
})

test('bill amounts use approved and received values consistently', () => {
  assert.deepEqual(
    billAmounts({ amount: 100, approvedAmount: 80, receivedAmount: 30, status: 'Partially Paid' }),
    { submitted: 100, approved: 80, received: 30, deductions: 0, balance: 50 }
  )
  assert.equal(billAmounts({ amount: 100, approvedAmount: 80, status: 'Paid' }).received, 80)
  assert.equal(billAmounts({ amount: 100, approvedAmount: 0, receivedAmount: 0 }).approved, 0)
})

test('bill normalization supports current and legacy fields', () => {
  assert.equal(billNumber({ billNo: 'B-1' }), 'B-1')
  assert.equal(billDate({ submittedDate: '2026-01-02' }), '2026-01-02')
  assert.equal(tenderBillTotals({ bills: [{ amount: 10, status: 'Paid' }], raBills: [{ receivedAmount: 5 }] }).totalReceived, 15)
})

test('an unbilled project is not an approved receivable or a completed profit forecast', () => {
  const tender = { id: 'p1', status: 'In Progress', value: 7302671, bills: [] }
  const costs = [{ tenderRef: 'p1', amount: 578260 }]
  const totals = projectFinancials(tender, costs)
  assert.equal(totals.unbilled, 7302671)
  assert.equal(totals.outstanding, 0)
  assert.equal(totals.profit, null)
  assert.equal(totals.cash, null)
  assert.equal(totals.incurred, 578260)
})

test('unpaid and partial supplier costs change payable and cash once; BOQ allocation does not add cost', () => {
  const tender = { id: 'p1', value: 1000, v2: { forecastRemaining: 200 }, bills: [{ amount: 400, approvedAmount: 350, v2: { receipts: [{ amount: 100 }] } }] }
  const costs = [{ tenderRef: 'p1', amount: 300, v2: { kind: 'cost', boqItemId: 'b1', payments: [{ amount: 120 }] } }]
  const totals = projectFinancials(tender, costs)
  assert.equal(totals.incurred, 300)
  assert.equal(totals.unallocated, 0)
  assert.equal(totals.payable, 180)
  assert.equal(totals.paid, 120)
  assert.equal(totals.cash, -20)
  assert.equal(totals.profit, 500)
  assert.equal(totals.outstanding, 250)
  assert.equal(expenseAmounts({ amount: 50, v2: { kind: 'deposit', payments: [] } }).incurred, 0)
})

test('bill receipts and deductions remain traceable without changing the aggregate twice', () => {
  const bill = { amount: 500, approvedAmount: 450, receivedAmount: 400, deductions: 5,
    v2: { receipts: [{ id: 'a', date: '2026-09-26', amount: 100, account: 'Bank', reference: 'R1' }, { id: 'b', date: '2026-09-27', amount: 150, account: 'Bank', reference: 'R2' }], deductions: { retention: 20, tax: 10 } } }
  assert.deepEqual(billAmounts(bill), { submitted: 500, approved: 450, received: 250, deductions: 30, balance: 170 })
  assert.equal(validateBillLedger(bill), null)
  assert.match(validateBillLedger({ ...bill, v2: { receipts: [{ id: 'a', date: '2026-09-27', amount: 500, account: 'Bank', reference: 'R' }] } }), /exceed/)
})

test('partial security refunds reduce blocked cash while guarantees retain face exposure', () => {
  const po = { amount: 1000, status: 'Held', v2: { instrument: 'guarantee', fundedCash: 100, refunds: [{ amount: 40 }] } }
  assert.deepEqual(securityAmounts(po), { funded: 100, refunded: 40, remaining: 60, exposure: 1000 })
  assert.equal(securityAmounts({ ...po, status: 'Encashed' }).remaining, 0)
  assert.equal(validateEvents([{ id: 'r1', date: '2026-09-27', amount: 60, account: 'Bank', reference: 'TX' }], 60), null)
  assert.match(validateEvents([{ id: 'r1', date: '2026-09-27', amount: 61, account: 'Bank', reference: 'TX' }], 60), /exceed/)
})

test('completed held securities enter a review queue without claiming legal refund eligibility', () => {
  const tenders = [{ id: 'done', status: 'Completed' }, { id: 'live', status: 'In Progress' }]
  const payOrders = [
    { id: 'a', tenderRef: 'done', amount: 60, status: 'Held' },
    { id: 'b', tenderRef: 'live', amount: 60, status: 'Held' },
    { id: 'c', amount: 60, status: 'Held', v2: { followUpDate: '2026-09-27' } },
  ]
  assert.deepEqual(getSecurityFollowUps(payOrders, tenders, '2026-09-27').map((po) => po.id), ['a', 'c'])
})

test('completed execution wins over stale work order state and migration review is read only', () => {
  const tender = { id: 'p1', status: 'Completed', completionDate: '2026-09-27', awardWorkOrder: { awardStatus: 'In Progress' } }
  assert.equal(executionState(tender), 'Completed')
  const backup = { tenders: [tender], payOrders: [], expenses: [] }
  const before = structuredClone(backup)
  const report = reviewV2Backup(backup)
  assert.equal(report.patches.length, 1)
  assert.equal(report.patches[0].forward.awardWorkOrder.awardStatus, 'Completed')
  assert.deepEqual(backup, before)
  const migrated = applyV2Patches(backup, report)
  assert.equal(migrated.tenders[0].awardWorkOrder.awardStatus, 'Completed')
  assert.deepEqual(applyV2Patches(migrated, report, 'inverse'), backup)
})

test('formatDate accepts Firestore-style timestamps and always returns text', () => {
  const value = { toDate: () => new Date('2026-01-02T00:00:00Z') }
  assert.match(formatDate(value), /02 Jan 2026/)
  assert.equal(typeof formatDate({ unexpected: true }), 'string')
})

test('CSV text neutralizes formulas while numeric values remain numeric', () => {
  assert.equal(safeSpreadsheetText('=1+1'), "'=1+1")
  assert.equal(csvCell(-12, { numeric: true }), '"-12"')
  assert.equal(csvCell('-12'), '"\'-12"')
})

test('safeHttpUrl rejects executable protocols', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), '')
  assert.match(safeHttpUrl('https://example.com/a'), /^https:\/\/example\.com/)
})

test('backup serialization preserves timestamp type information', () => {
  const timestamp = { seconds: 12, nanoseconds: 34, toDate: () => new Date(12000) }
  assert.deepEqual(serializeBackupValue({ createdAt: timestamp }), {
    createdAt: { __type: 'firestore-timestamp', seconds: 12, nanoseconds: 34 },
  })
})

test('tender deadlines use local calendar days without timezone drift', () => {
  const now = new Date(2026, 8, 22, 23, 30)
  assert.equal(tenderDaysRemaining('2026-09-22', now), 0)
  assert.equal(tenderDaysRemaining('2026-09-23', now), 1)
  assert.equal(tenderDaysRemaining('2026-09-24', now), 2)
  assert.equal(tenderDaysRemaining('2026-09-25', now), 3)
  assert.equal(tenderDaysRemaining('2026-09-29', now), 7)
  assert.equal(tenderDaysRemaining('2026-10-02', now), 10)
  assert.equal(tenderDaysRemaining('2026-09-21', now), -1)
  assert.equal(deadlineLabel(-2), '2 days overdue')
})

test('reminder thresholds are exact and deduplication keys change with the deadline', () => {
  assert.equal(getTenderReminderKey(7), 'seven-days')
  assert.equal(getTenderReminderKey(3), 'three-days')
  assert.equal(getTenderReminderKey(2), 'three-days')
  assert.equal(getTenderReminderKey(1), 'one-day')
  assert.equal(getTenderReminderKey(0), 'due-today')
  assert.equal(getTenderReminderKey(-20), 'overdue')
  assert.equal(getTenderReminderKey(6), 'seven-days')
  const first = `tender-deadline:t1:2026-09-29:${getTenderReminderKey(7)}`
  const changed = `tender-deadline:t1:2026-10-01:${getTenderReminderKey(7)}`
  assert.notEqual(first, changed)
})

test('closed tenders are excluded and deadline filters classify active tenders', () => {
  const now = new Date(2026, 8, 22)
  const active = getTenderDeadline({ status: 'Bidding', submissionDate: '2026-09-25' }, now)
  assert.equal(active.days, 3)
  assert.equal(matchesDeadlineFilter(active, 'three-days'), true)
  assert.equal(matchesDeadlineFilter(active, 'today'), false)
  assert.equal(getTenderDeadline({ status: 'Submitted', submissionDate: '2026-09-25' }, now), null)
  assert.equal(getTenderDeadline({ status: 'Cancelled', submissionDate: '2026-09-21' }, now), null)
  assert.equal(getTenderDeadline({ status: 'Bidding', submissionDate: 'invalid' }, now), null)
})

test('upcoming tender sorting prioritizes overdue attention then nearest future deadline', () => {
  const now = new Date(2026, 8, 22)
  const rows = sortTenderDeadlines([
    { id: 'ten', status: 'Bidding', submissionDate: '2026-10-02' },
    { id: 'tomorrow', status: 'Pending', submissionDate: '2026-09-23' },
    { id: 'overdue', status: 'Draft', submissionDate: '2026-09-21' },
  ], now)
  assert.deepEqual(rows.map(({ tender }) => tender.id), ['overdue', 'tomorrow', 'ten'])
})
