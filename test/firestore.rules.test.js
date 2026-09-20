import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

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
