import { useState, useEffect, useCallback } from 'react'
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, onSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'

export function useCollection(collectionName, orderField = 'createdAt', orderDir = 'desc') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!collectionName) return
    setLoading(true)
    const q = query(collection(db, collectionName), orderBy(orderField, orderDir))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        console.error(`useCollection(${collectionName}):`, err)
        const friendly = err.code === 'permission-denied'
          ? `You don't have permission to read ${collectionName}.`
          : err.code === 'unavailable'
          ? 'Network error — Firestore is unreachable.'
          : err.code === 'failed-precondition'
          ? `Missing index for ${collectionName}. Check Firestore console.`
          : `Failed to load ${collectionName}: ${err.message}`
        setError(friendly)
        toast.error(friendly)
        setLoading(false)
      }
    )
    return unsub
  }, [collectionName, orderField, orderDir])

  return { data, loading, error }
}

// Map Firestore error codes to short user-facing strings. Raw e.message can
// leak schema or index details, so we surface a generic fallback for anything
// not in the known set and keep the full error in console.error for debugging.
function friendlyFirestoreError(e, verb) {
  switch (e?.code) {
    case 'permission-denied':
      return `You don't have permission to ${verb} this.`
    case 'unavailable':
      return 'Network error — Firestore is unreachable.'
    case 'failed-precondition':
      return `Cannot ${verb} right now — please refresh and try again.`
    case 'not-found':
      return 'That item no longer exists.'
    default:
      return 'Something went wrong, please try again.'
  }
}

export function useFirestoreCRUD(collectionName) {
  const add = useCallback(
    async (data) => {
      try {
        const ref = await addDoc(collection(db, collectionName), {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        return ref.id
      } catch (e) {
        console.error(`add(${collectionName}):`, e)
        toast.error(friendlyFirestoreError(e, 'save'))
        throw e
      }
    },
    [collectionName]
  )

  const update = useCallback(
    async (id, data) => {
      try {
        await updateDoc(doc(db, collectionName, id), {
          ...data,
          updatedAt: serverTimestamp(),
        })
      } catch (e) {
        console.error(`update(${collectionName}/${id}):`, e)
        toast.error(friendlyFirestoreError(e, 'update'))
        throw e
      }
    },
    [collectionName]
  )

  const remove = useCallback(
    async (id) => {
      try {
        await deleteDoc(doc(db, collectionName, id))
      } catch (e) {
        console.error(`remove(${collectionName}/${id}):`, e)
        toast.error(friendlyFirestoreError(e, 'delete'))
        throw e
      }
    },
    [collectionName]
  )

  return { add, update, remove }
}

export async function fetchCollection(collectionName) {
  const snap = await getDocs(collection(db, collectionName))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
