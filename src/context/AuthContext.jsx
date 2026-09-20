/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { onIdTokenChanged, signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubscribeProfile = null
    let generation = 0
    const unsub = onIdTokenChanged(auth, async (firebaseUser) => {
      const currentGeneration = ++generation
      unsubscribeProfile?.()
      unsubscribeProfile = null
      setLoading(true)
      setUserDoc(null)
      if (firebaseUser) {
        setUser(firebaseUser)
        // The current user document is authoritative for role and profile.
        try {
          const ref = doc(db, 'users', firebaseUser.uid)
          const snap = await getDoc(ref)
          if (snap.exists()) {
            if (generation === currentGeneration) setUserDoc(snap.data())
          } else {
            const newDoc = {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              role: 'viewer',
              createdAt: serverTimestamp(),
            }
            await setDoc(ref, newDoc)
            if (generation === currentGeneration) setUserDoc(newDoc)
          }
          unsubscribeProfile = onSnapshot(ref, (profileSnapshot) => {
            if (generation !== currentGeneration) return
            setUserDoc(profileSnapshot.exists() ? profileSnapshot.data() : null)
          }, (err) => console.error('Failed to watch user document:', err))
        } catch (err) {
          console.error('Failed to load user document:', err)
          setUserDoc(null)
        }
      } else {
        setUser(null)
        setUserDoc(null)
      }
      if (generation === currentGeneration) setLoading(false)
    })
    return () => {
      generation += 1
      unsubscribeProfile?.()
      unsub()
    }
  }, [])

  const logout = () => signOut(auth)

  const isAdmin = userDoc?.role === 'admin'
  const displayName = userDoc?.displayName || user?.email || ''
  const role = userDoc?.role || 'viewer'

  return (
    <AuthContext.Provider value={{ user, userDoc, loading, logout, isAdmin, displayName, role }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
