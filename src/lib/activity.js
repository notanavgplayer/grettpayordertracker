import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'

// The activity log is an append-only audit trail. The actor (byUid) always comes
// from the signed-in Firebase user and createdAt from the server clock; the
// Firestore rules reject an entry where either does not match. `by` is only a
// display label taken from the signed-in user's profile by the caller.
export async function addActivityEntry({ type, action, title, entityId, by, meta }) {
  const byUid = auth.currentUser?.uid
  if (!byUid) throw Object.assign(new Error('Sign in is required.'), { code: 'unauthenticated' })
  await addDoc(collection(db, 'activityLog'), {
    type: type || 'other',
    action: action || 'updated',
    title: title || '',
    entityId: entityId || null,
    by: by || null,
    byUid,
    meta: meta || null,
    createdAt: serverTimestamp(),
  })
}

// Best-effort variant for automatic entries written after a successful save.
export async function logActivity(entry) {
  try {
    await addActivityEntry(entry)
  } catch (e) {
    console.error('logActivity failed:', e)
  }
}
