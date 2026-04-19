import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

export async function logActivity({ type, action, title, entityId, by, meta }) {
  try {
    await addDoc(collection(db, 'activityLog'), {
      type: type || 'other',
      action: action || 'updated',
      title: title || '',
      entityId: entityId || null,
      by: by || null,
      meta: meta || null,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('logActivity failed:', e)
  }
}
