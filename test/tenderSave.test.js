import test from 'node:test'
import assert from 'node:assert/strict'
import { tenderFeeExpenseNeedsSync, tenderSaveErrorMessage } from '../src/lib/tenderSave.js'

test('contract or quote edits do not touch a stale tender-fee expense link', () => {
  const previous = { name: 'Fixture', nit: 'N-1', submissionDate: '2026-10-01', tenderFee: 2000,
    value: 1895000, quotedAmount: 2400000, awardWorkOrder: { contractValue: 2400000 }, tenderFeeExpenseId: 'missing-expense' }
  assert.equal(tenderFeeExpenseNeedsSync(previous, { ...previous, awardWorkOrder: { contractValue: 2400000 }, quotedAmount: 2400000 }), false)
  assert.equal(tenderFeeExpenseNeedsSync(previous, { ...previous, tenderFee: 2500 }), true)
})

test('save failures identify permission, missing link and offline causes without erasing entries', () => {
  assert.match(tenderSaveErrorMessage({ code: 'permission-denied' }), /admin access/)
  assert.match(tenderSaveErrorMessage({ code: 'not-found' }), /linked record/)
  assert.match(tenderSaveErrorMessage({ code: 'unavailable' }), /connection/)
})
