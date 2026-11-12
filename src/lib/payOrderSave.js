import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'

// Pay order numbers are unique, case- and whitespace-insensitively. Each number
// owns one poNumbers/{key} index doc, written in the same transaction as the pay
// order. firestore.rules rejects a second claim on a key, so two racing saves of
// the same number cannot both commit.

export const DUPLICATE_PO_NUMBER = 'duplicate-po-number'
export const DUPLICATE_PO_MESSAGE = 'This pay order number already exists. Open and link the existing instrument instead.'

const duplicateError = () => Object.assign(new Error(DUPLICATE_PO_MESSAGE), { code: DUPLICATE_PO_NUMBER })

export function normalizePoNumber(po) {
  return String(po ?? '').trim().toLowerCase()
}

// Document IDs cannot contain "/", so "%" and then "/" are escaped. The rules'
// poKey() applies exactly the same mapping; keep the two in sync.
export function poNumberKey(po) {
  const key = normalizePoNumber(po).replace(/%/g, '%25').replace(/\//g, '%2F')
  if (!key || key === '.' || key === '..' || /^__.*__$/.test(key)) return null
  return key
}

/**
 * Create or update a pay order and claim its number in one transaction.
 * When an edit changes the number, the old number's index doc is released.
 * `extraWrites(transaction)` adds writes that must commit atomically with the
 * pay order (a new project stub, the tender bid-security mirror). Throws an
 * error with code DUPLICATE_PO_NUMBER if another pay order holds the number.
 * Returns the pay order id.
 */
export async function savePayOrderWithUniqueNumber({ payOrderId = null, previousPo = null, data, extraWrites }) {
  const po = String(data.po ?? '').trim()
  const key = poNumberKey(po)
  if (!key) throw Object.assign(new Error('Enter a valid pay order number.'), { code: 'invalid-argument' })
  const payOrderRef = payOrderId ? doc(db, 'payOrders', payOrderId) : doc(collection(db, 'payOrders'))
  const indexRef = doc(db, 'poNumbers', key)
  const previousKey = payOrderId ? poNumberKey(previousPo) : null
  const previousIndexRef = previousKey && previousKey !== key ? doc(db, 'poNumbers', previousKey) : null

  // Pay orders saved before the index existed have no index doc until they are
  // backfilled; this catches exact-number matches among them.
  const legacy = await getDocs(query(collection(db, 'payOrders'), where('po', '==', po)))
  if (legacy.docs.some((item) => item.id !== payOrderRef.id)) throw duplicateError()

  await runTransaction(db, async (transaction) => {
    const indexSnap = await transaction.get(indexRef)
    const owner = indexSnap.exists() ? indexSnap.data().payOrderId : null
    let claim = !indexSnap.exists()
    if (owner && owner !== payOrderRef.id) {
      // A claim left behind by a pay order that no longer exists may be retaken.
      const ownerSnap = await transaction.get(doc(db, 'payOrders', owner))
      if (ownerSnap.exists()) throw duplicateError()
      claim = true
    }
    const previousIndexSnap = previousIndexRef ? await transaction.get(previousIndexRef) : null

    extraWrites?.(transaction)
    if (payOrderId) transaction.update(payOrderRef, { ...data, po, updatedAt: serverTimestamp() })
    else transaction.set(payOrderRef, { ...data, po, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    if (claim) transaction.set(indexRef, { payOrderId: payOrderRef.id, po, createdAt: serverTimestamp() })
    if (previousIndexSnap?.exists() && previousIndexSnap.data().payOrderId === payOrderRef.id) {
      transaction.delete(previousIndexRef)
    }
  })
  return payOrderRef.id
}

// Delete a pay order and release its number in the same transaction.
export async function deletePayOrderAndReleaseNumber(payOrderId, po) {
  const payOrderRef = doc(db, 'payOrders', payOrderId)
  const key = poNumberKey(po)
  const indexRef = key ? doc(db, 'poNumbers', key) : null
  await runTransaction(db, async (transaction) => {
    const indexSnap = indexRef ? await transaction.get(indexRef) : null
    transaction.delete(payOrderRef)
    if (indexSnap?.exists() && indexSnap.data().payOrderId === payOrderId) transaction.delete(indexRef)
  })
}
