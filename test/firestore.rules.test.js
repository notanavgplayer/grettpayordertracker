import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { billAmounts, expenseAmounts, securityAmounts } from '../src/lib/financials.js'

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
let environment

before(async () => {
  if (!emulatorHost) return
  environment = await initializeTestEnvironment({
    projectId: 'grett-rules-test',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/admin'), { role: 'admin', email: 'admin@example.test' })
    await setDoc(doc(context.firestore(), 'users/viewer'), { role: 'viewer', email: 'viewer@example.test' })
  })
})

after(async () => environment?.cleanup())

test('rules accept the current tender form payload', { skip: !emulatorHost }, async () => {
  const db = environment.authenticatedContext('admin', { admin: true }).firestore()
  await assertSucceeds(setDoc(doc(db, 'tenders/tender-1'), {
    name: 'Bridge works', nit: 'NIT-1', agency: 'Agency', value: 0,
    estimatedCost: null, quotedAmount: 0, tenderFee: 0, bidSecurity: 0,
    status: 'Bidding', submissionDate: '', openingDate: '', notes: '',
    checklist: [], bills: [], raBills: [], documents: [], siteVisits: [], statusHistory: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
  await assertSucceeds(updateDoc(doc(db, 'tenders/tender-1'), {
    grossValue: 0,
    netValue: null,
    documents: [{ id: 'doc-1', name: 'plan.pdf', storagePath: 'tender-1/doc-1/plan.pdf' }],
    updatedAt: serverTimestamp(),
  }))
})

test('legacy tender fields may be preserved but cannot be changed or expanded', { skip: !emulatorHost }, async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'tenders/legacy-tender'), {
      name: 'Legacy', value: 1, tenderFee: 0, obsoleteField: 'preserved',
    })
  })
  const db = environment.authenticatedContext('admin').firestore()
  await assertSucceeds(updateDoc(doc(db, 'tenders/legacy-tender'), { notes: 'Allowed edit' }))
  await assertFails(updateDoc(doc(db, 'tenders/legacy-tender'), { obsoleteField: 'changed' }))
  await assertFails(updateDoc(doc(db, 'tenders/legacy-tender'), { unexpectedField: true }))
})

test('current viewer role overrides a stale admin token claim', { skip: !emulatorHost }, async () => {
  const db = environment.authenticatedContext('viewer', { admin: true }).firestore()
  await assertFails(setDoc(doc(db, 'contacts/contact-1'), { name: 'Blocked' }))
})

test('rules reject invalid negative nested-independent values and permit narrow legacy task migration', { skip: !emulatorHost }, async () => {
  const db = environment.authenticatedContext('admin', { admin: true }).firestore()
  await assertFails(setDoc(doc(db, 'expenses/expense-1'), { description: 'Invalid', amount: -1 }))
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'todos/legacy'), { title: 'Legacy', completed: true })
  })
  await assertSucceeds(updateDoc(doc(db, 'todos/legacy'), { done: false }))
  assert.ok(true)
})

test('users can persist only their own notification state', { skip: !emulatorHost }, async () => {
  const viewerDb = environment.authenticatedContext('viewer').firestore()
  await assertSucceeds(setDoc(doc(viewerDb, 'notificationState/viewer'), {
    readIds: ['tender-deadline:t1:2026-09-29:seven-days'],
    preferences: { sevenDays: true, threeDays: true },
    browserEnabled: false,
    updatedAt: serverTimestamp(),
  }))
  await assertFails(setDoc(doc(viewerDb, 'notificationState/admin'), { readIds: [] }))
  await assertFails(setDoc(doc(viewerDb, 'notificationState/viewer'), { readIds: [], unexpected: true }))
})

test('synthetic payment, bill receipt and partial refund events persist in the emulator', { skip: !emulatorHost }, async () => {
  const db = environment.authenticatedContext('admin').firestore()
  const expense = doc(db, 'expenses/workflow-expense')
  const tender = doc(db, 'tenders/workflow-tender')
  const payOrder = doc(db, 'payOrders/workflow-po')

  await assertSucceeds(setDoc(expense, {
    description: 'Synthetic supplier invoice', amount: 300, tenderRef: 'workflow-tender',
    v2: { kind: 'cost', payee: 'Test supplier', payments: [] },
  }))
  await assertSucceeds(updateDoc(expense, {
    'v2.payments': [{ id: 'pay-1', date: '2026-09-27', amount: 120, account: 'Test bank', reference: 'PAY-1' }],
  }))
  const savedExpense = (await assertSucceeds(getDoc(expense))).data()
  assert.equal(expenseAmounts(savedExpense).paid, 120)
  assert.equal(expenseAmounts(savedExpense).payable, 180)

  await assertSucceeds(setDoc(tender, { name: 'Synthetic project', value: 1000, bills: [{ id: 'bill-1', amount: 500, approvedAmount: 450, v2: { deductions: { retention: 30 }, receipts: [] } }] }))
  await assertSucceeds(updateDoc(tender, { bills: [{ id: 'bill-1', amount: 500, approvedAmount: 450, v2: { deductions: { retention: 30 }, receipts: [{ id: 'rec-1', date: '2026-09-27', amount: 100, account: 'Test bank', reference: 'REC-1' }] } }] }))
  const savedTender = (await assertSucceeds(getDoc(tender))).data()
  const savedAmounts = billAmounts(savedTender.bills[0])
  assert.deepEqual([savedAmounts.submitted, savedAmounts.approved, savedAmounts.received, savedAmounts.deductions, savedAmounts.balance], [500, 450, 100, 30, 320])

  await assertSucceeds(setDoc(payOrder, { po: 'TEST-PO-1', amount: 61000, status: 'Held', tenderRef: 'workflow-tender', v2: { instrument: 'pay-order', refunds: [] } }))
  await assertSucceeds(updateDoc(payOrder, { 'v2.refunds': [{ id: 'ref-1', date: '2026-09-27', amount: 10000, account: 'Test bank', reference: 'REF-1' }] }))
  const savedPayOrder = (await assertSucceeds(getDoc(payOrder))).data()
  assert.deepEqual(securityAmounts(savedPayOrder), { funded: 61000, refunded: 10000, remaining: 51000, exposure: 0 })
})

test('admin tender edit survives a stale fee-expense link while viewer remains blocked', { skip: !emulatorHost }, async () => {
  const adminDb = environment.authenticatedContext('admin').firestore()
  const viewerDb = environment.authenticatedContext('viewer').firestore()
  const tenderRef = doc(adminDb, 'tenders/stale-fee-link')
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'tenders/stale-fee-link'), {
      name: 'Disposable work order', value: 1895000, estimatedCost: 3000000, quotedAmount: 2400000,
      awardWorkOrder: { contractValue: 2400000 }, tenderFee: 2000, tenderFeeExpenseId: 'missing-expense', status: 'Completed',
    })
  })
  const broken = writeBatch(adminDb)
  broken.update(doc(adminDb, 'expenses/missing-expense'), { amount: 2000 })
  broken.update(tenderRef, { notes: 'Disposable edit' })
  // The missing expense is evaluated by the update rule and denied before
  // Firestore can report a missing-document error for the batch.
  await assertFails(broken.commit())

  const valid = writeBatch(adminDb)
  valid.update(tenderRef, { awardWorkOrder: { contractValue: 2400000 }, quotedAmount: 2400000, updatedAt: serverTimestamp() })
  await assertSucceeds(valid.commit())
  const saved = (await assertSucceeds(getDoc(tenderRef))).data()
  assert.deepEqual([saved.value, saved.quotedAmount, saved.awardWorkOrder.contractValue, saved.tenderFeeExpenseId],
    [1895000, 2400000, 2400000, 'missing-expense'])
  await assertFails(updateDoc(doc(viewerDb, 'tenders/stale-fee-link'), { quotedAmount: 1 }))
})

test('admin can persist additive bill clearance and RM release history while viewer cannot write', { skip: !emulatorHost }, async () => {
  const adminDb = environment.authenticatedContext('admin').firestore()
  const viewerDb = environment.authenticatedContext('viewer', { admin: true }).firestore()
  const bill = { id: 'bill-v2', no: 'RA-2', amount: 1000, approvedAmount: 1000, status: 'Approved',
    v2: { billing: { basis: 'incremental', previousCertifiedGross: 0, contractBasis: 2000,
      deductionRows: [{ id: 'rm', kind: 'RM', method: 'percentage', base: 'approved', rate: 8, adjustment: 0 }],
      retentionReleases: [{ id: 'release-1', date: '2026-10-08', amount: 30, account: 'Bank', reference: 'RM-1' }] },
    receipts: [{ id: 'receipt-1', date: '2026-10-08', amount: 400, account: 'Bank', reference: 'CHQ-1', method: 'Cheque', status: 'Pending Clearance', history: [{ status: 'Pending Clearance', date: '2026-10-08' }] }] } }
  const target = doc(adminDb, 'tenders/workflow-v2')
  await assertSucceeds(setDoc(target, { name: 'Synthetic V2 project', value: 0, bills: [bill], raBills: [] }))
  const saved = (await assertSucceeds(getDoc(target))).data()
  assert.deepEqual([billAmounts(saved.bills[0]).pending, billAmounts(saved.bills[0]).retentionHeld], [400, 50])
  await assertFails(updateDoc(doc(viewerDb, 'tenders/workflow-v2'), { bills: [] }))
})
