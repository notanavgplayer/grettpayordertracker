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
        console.error(err)
        setError(err.message)
        setLoading(false)
      }
    )
    return unsub
  }, [collectionName, orderField, orderDir])

  return { data, loading, error }
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
        toast.error('Failed to save: ' + e.message)
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
        toast.error('Failed to update: ' + e.message)
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
        toast.error('Failed to delete: ' + e.message)
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
