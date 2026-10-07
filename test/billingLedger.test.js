import test from 'node:test'
import assert from 'node:assert/strict'
import { billLedger, deductionRowAmount, transitionReceipt, validateBillingLedger, validateCumulativeBill, validateProjectReceiptReferences } from '../src/lib/billingLedger.js'
import { calculatedBidSecurity } from '../src/lib/bidSecurity.js'

const row = (kind, rate) => ({ id: kind, kind, method: 'percentage', base: 'approved', rate, adjustment: 0 })
const base = { amount: 2400000, approvedAmount: 2400000, status: 'Approved',
  v2: { billing: { basis: 'incremental', previousCertifiedGross: 0, contractBasis: 2400000,
    deductionRows: [row('RM', 8), row('SRB', 5), row('Income Tax', 8)], retentionReleases: [] }, receipts: [] } }

test('Mustafabad synthetic gross, deductions, net, RM and bid security remain separate', () => {
  const result = billLedger(base, 2400000)
  assert.deepEqual([result.approved, result.deductions, result.net, result.retention, result.retentionHeld, result.received, result.balance],
    [2400000, 504000, 1896000, 192000, 192000, 0, 1896000])
  assert.equal(validateBillingLedger(base, 2400000), null)
  assert.equal(calculatedBidSecurity({ estimatedCost: 3000000, quotedAmount: 2400000 }, { basis: 'estimated', rate: 2 }), 60000)
  assert.equal(calculatedBidSecurity({ estimatedCost: 3000000, quotedAmount: 2400000 }, { basis: 'quoted', rate: 2 }), 48000)
})

test('cumulative certificate contributes only its increment and cannot precede earlier gross', () => {
  const second = { ...base, amount: 1100000, approvedAmount: 1000000,
    v2: { billing: { basis: 'cumulative', previousCertifiedGross: 400000, contractBasis: 2400000, deductionRows: [], retentionReleases: [] }, receipts: [] } }
  assert.equal(billLedger(second).approved, 600000)
  assert.equal(billLedger(second).submitted, 700000)
  assert.equal(validateBillingLedger(second), null)
  const first = { ...base, amount: 400000, approvedAmount: 400000, v2: { ...base.v2, billing: { ...base.v2.billing, deductionRows: [] } } }
  assert.equal(validateCumulativeBill(second, [first]), null)
  assert.match(validateCumulativeBill(second, []), /Previous certified/)
  assert.match(validateCumulativeBill(second, [{ status: 'Approved', amount: 400000 }]), /unverified/)
  assert.equal(validateCumulativeBill({ ...second, date: '2026-10-08' }, [first, { ...first, id: 'later', date: '2026-10-09' }]), null)
  assert.match(validateBillingLedger({ ...second, approvedAmount: 300000 }), /Previous certified/)
})

test('draft bill is not an approved receivable and cannot carry cash receipts', () => {
  const draft = { ...base, status: 'Draft' }
  assert.equal(billLedger(draft).approved, 0)
  assert.equal(billLedger(draft).submitted, 0)
  assert.match(validateBillingLedger({ ...draft, v2: { ...draft.v2, receipts: [{ id: 'r', date: '2026-10-08', amount: 1, account: 'Bank', reference: 'X', status: 'Cleared' }] } }), /Approve/)
})

test('pending and bounced cheque are not cleared cash; reversal retains status history', () => {
  const receipt = { id: 'r1', amount: 100000, date: '2026-10-08', account: 'Bank', reference: 'CHK-1', status: 'Pending Clearance' }
  const pending = { ...base, v2: { ...base.v2, receipts: [receipt] } }
  assert.equal(billLedger(pending).received, 0)
  assert.equal(billLedger(pending).pending, 100000)
  const cleared = { ...pending, v2: { ...pending.v2, receipts: [{ ...receipt, status: 'Cleared', history: [{ status: 'Pending Clearance', date: '2026-10-08' }, { status: 'Cleared', date: '2026-10-09' }] }] } }
  assert.equal(billLedger(cleared).received, 100000)
  const bounced = { ...cleared, v2: { ...cleared.v2, receipts: [{ ...cleared.v2.receipts[0], status: 'Bounced', history: [...cleared.v2.receipts[0].history, { status: 'Bounced', date: '2026-10-10' }] }] } }
  assert.equal(billLedger(bounced).received, 0)
  assert.equal(bounced.v2.receipts[0].history.length, 3)
  assert.throws(() => transitionReceipt({ ...receipt, status: 'Cleared' }, 'Bounced', '2026-10-10'), /reason/)
  const reversed = transitionReceipt({ ...receipt, status: 'Cleared' }, 'Bounced', '2026-10-10', 'Bank return memo')
  assert.equal(reversed.history[1].reason, 'Bank return memo')
})

test('partial RM release reduces held RM without changing bill net or cleared receipts', () => {
  const released = { ...base, v2: { ...base.v2, billing: { ...base.v2.billing, retentionReleases: [{ id: 'rm1', date: '2026-10-08', amount: 50000, account: 'Bank', reference: 'RM-1' }] } } }
  assert.deepEqual([billLedger(released).retentionHeld, billLedger(released).net, billLedger(released).received], [142000, 1896000, 0])
  assert.equal(validateBillingLedger(released, 2400000), null)
  assert.match(validateBillingLedger({ ...released, v2: { ...released.v2, billing: { ...released.v2.billing, retentionReleases: [{ ...released.v2.billing.retentionReleases[0], amount: 193000 }] } } }, 2400000), /exceed/)
  assert.match(validateBillingLedger({ ...released, v2: { ...released.v2, billing: { ...released.v2.billing, retentionReleases: [released.v2.billing.retentionReleases[0], { ...released.v2.billing.retentionReleases[0], id: 'rm2' }] } } }, 2400000), /Duplicate RM release/)
})

test('rounding is per deduction row and duplicate or excess allocations are rejected', () => {
  assert.equal(deductionRowAmount({ ...row('SRB', 5), rate: 5 }, 33.33), 1.67)
  const receipt = { id: 'r1', amount: 100, date: '2026-10-08', account: 'Bank', reference: 'A', status: 'Cleared' }
  const withReceipts = { ...base, v2: { ...base.v2, receipts: [receipt, { ...receipt, id: 'r2' }] } }
  assert.match(validateBillingLedger(withReceipts, 2400000), /Duplicate receipt/)
  assert.match(validateBillingLedger({ ...base, v2: { ...base.v2, receipts: [{ ...receipt, amount: 2000000 }] } }, 2400000), /exceed/)
  assert.match(validateBillingLedger({ ...base, approvedAmount: '' }, 2400000), /Approved gross/)
  assert.match(validateProjectReceiptReferences({ ...base, v2: { ...base.v2, receipts: [receipt] } }, [{ v2: { receipts: [{ ...receipt, id: 'other' }] } }]), /already allocated/)
})
