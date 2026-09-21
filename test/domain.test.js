import test from 'node:test'
import assert from 'node:assert/strict'
import { stripUndefined, nullableNumber, nonNegativeNumber, safeHttpUrl, serializeBackupValue } from '../src/lib/data.js'
import { billAmounts, billDate, billNumber, tenderBillTotals } from '../src/lib/financials.js'
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
