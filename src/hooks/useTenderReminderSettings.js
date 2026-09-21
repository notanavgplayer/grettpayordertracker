import { useCallback, useEffect, useMemo, useState } from 'react'
import { arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { DEFAULT_TENDER_REMINDER_PREFERENCES } from '@/lib/tenderDeadlines'

const fallbackKey = (uid) => `grett-tender-reminders:${uid || 'anonymous'}`

function loadFallback(uid) {
  try { return JSON.parse(localStorage.getItem(fallbackKey(uid)) || '{}') } catch { return {} }
}

function saveFallback(uid, value) {
  try { localStorage.setItem(fallbackKey(uid), JSON.stringify(value)) } catch {}
}

export function useTenderReminderSettings() {
  const { user } = useAuth()
  const fallback = loadFallback(user?.uid)
  const [state, setState] = useState({
    readIds: fallback.readIds || [],
    preferences: { ...DEFAULT_TENDER_REMINDER_PREFERENCES, ...fallback.preferences },
    browserEnabled: fallback.browserEnabled === true,
  })

  useEffect(() => {
    if (!user?.uid) return undefined
    const ref = doc(db, 'notificationState', user.uid)
    return onSnapshot(ref, (snapshot) => {
      const value = snapshot.exists() ? snapshot.data() : loadFallback(user.uid)
      setState({
        readIds: Array.isArray(value.readIds) ? value.readIds : [],
        preferences: { ...DEFAULT_TENDER_REMINDER_PREFERENCES, ...(value.preferences || {}) },
        browserEnabled: value.browserEnabled === true,
      })
    }, () => {
      const value = loadFallback(user.uid)
      setState({
        readIds: value.readIds || [],
        preferences: { ...DEFAULT_TENDER_REMINDER_PREFERENCES, ...value.preferences },
        browserEnabled: value.browserEnabled === true,
      })
    })
  }, [user?.uid])

  const persist = useCallback(async (patch) => {
    if (!user?.uid) return
    setState((current) => {
      const next = { ...current, ...patch }
      saveFallback(user.uid, next)
      return next
    })
    try {
      await setDoc(doc(db, 'notificationState', user.uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true })
    } catch {
      // The local fallback keeps reminders usable offline and before rules deploy.
    }
  }, [user?.uid])

  const markRead = useCallback(async (id) => {
    if (!user?.uid || state.readIds.includes(id)) return
    const readIds = [...state.readIds, id].slice(-500)
    setState((current) => ({ ...current, readIds }))
    saveFallback(user.uid, { ...state, readIds })
    try {
      await setDoc(doc(db, 'notificationState', user.uid), { readIds: arrayUnion(id), updatedAt: serverTimestamp() }, { merge: true })
    } catch {
      // Keep the optimistic local state when Firestore is unavailable.
    }
  }, [state, user?.uid])

  const markAllRead = useCallback((ids) => persist({ readIds: Array.from(new Set([...state.readIds, ...ids])).slice(-500) }), [persist, state.readIds])
  const updatePreferences = useCallback((preferences) => persist({ preferences: { ...state.preferences, ...preferences } }), [persist, state.preferences])
  const setBrowserEnabled = useCallback((browserEnabled) => persist({ browserEnabled }), [persist])
  const readIds = useMemo(() => new Set(state.readIds), [state.readIds])

  return { ...state, readIds, markRead, markAllRead, updatePreferences, setBrowserEnabled }
}
