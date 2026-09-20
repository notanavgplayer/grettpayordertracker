import test from 'node:test'
import assert from 'node:assert/strict'
import { stripUndefined, nullableNumber, safeHttpUrl, serializeBackupValue } from '../src/lib/data.js'
import { billAmounts, billDate, billNumber, tenderBillTotals } from '../src/lib/financials.js'
import { csvCell, safeSpreadsheetText } from '../src/lib/csv.js'
import { formatDate } from '../src/lib/utils.js'

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
