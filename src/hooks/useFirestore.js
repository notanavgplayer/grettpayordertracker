import { useState, useEffect, useCallback } from 'react'
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  serverTimestamp, onSnapshot, query, orderBy, limit as queryLimit, startAfter,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sortByField } from '@/lib/utils'
import { documentData } from '@/lib/data'
import { toast } from 'sonner'

export function useCollection(collectionName, orderField = 'createdAt', orderDir = 'desc') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!collectionName) return
    setLoading(true)
    const collectionRef = collection(db, collectionName)
    const unsub = onSnapshot(
      collectionRef,
      (snap) => {
        const records = snap.docs.map(documentData)
        setData(sortByField(records, orderField, orderDir))
        setError(null)
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

export function useFirestoreCRUD(collectionName, { addUpdatedAt = true } = {}) {
  const add = useCallback(
    async (data) => {
      try {
        const payload = {
          ...data,
          createdAt: serverTimestamp(),
          ...(addUpdatedAt ? { updatedAt: serverTimestamp() } : {}),
        }
        const ref = await addDoc(collection(db, collectionName), payload)
        return ref.id
      } catch (e) {
        console.error(`add(${collectionName}):`, e)
        toast.error(friendlyFirestoreError(e, 'save'))
        throw e
      }
    },
    [addUpdatedAt, collectionName]
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
  return snap.docs.map(documentData)
}

export function usePaginatedCollection(collectionName, orderField = 'createdAt', orderDir = 'desc', pageSize = 50) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!collectionName) return undefined
    let active = true
    setLoading(true)
    setError(null)

    getDocs(query(
      collection(db, collectionName),
      orderBy(orderField, orderDir),
      queryLimit(pageSize),
    )).then((snapshot) => {
      if (!active) return
      setData(snapshot.docs.map(documentData))
      setCursor(snapshot.docs.at(-1) || null)
      setHasMore(snapshot.size === pageSize)
    }).catch((readError) => {
      if (!active) return
      console.error(`usePaginatedCollection(${collectionName}):`, readError)
      setError(friendlyFirestoreError(readError, 'view'))
    }).finally(() => {
      if (active) setLoading(false)
    })

    return () => { active = false }
  }, [collectionName, orderDir, orderField, pageSize, reloadKey])

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const snapshot = await getDocs(query(
        collection(db, collectionName),
        orderBy(orderField, orderDir),
        startAfter(cursor),
        queryLimit(pageSize),
      ))
      const nextRecords = snapshot.docs.map(documentData)
      setData((current) => {
        const seen = new Set(current.map((record) => record.id))
        return [...current, ...nextRecords.filter((record) => !seen.has(record.id))]
      })
      setCursor(snapshot.docs.at(-1) || cursor)
      setHasMore(snapshot.size === pageSize)
    } catch (readError) {
      console.error(`loadMore(${collectionName}):`, readError)
      setError(friendlyFirestoreError(readError, 'view'))
    } finally {
      setLoadingMore(false)
    }
  }, [collectionName, cursor, hasMore, loadingMore, orderDir, orderField, pageSize])

  const retry = useCallback(() => setReloadKey((value) => value + 1), [])

  return { data, loading, loadingMore, error, hasMore, loadMore, retry }
}
