/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [claimAdmin, setClaimAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        // Read custom claims first — admin status is mirrored from the
        // user doc by the Cloud Function in functions/index.js.
        try {
          const token = await firebaseUser.getIdTokenResult()
          setClaimAdmin(!!token.claims?.admin)
        } catch (err) {
          console.error('Failed to read auth claims:', err)
          setClaimAdmin(false)
        }
        // Load or create user document (used for displayName + as
        // fallback for the role during the claim-propagation window).
        try {
          const ref = doc(db, 'users', firebaseUser.uid)
          const snap = await getDoc(ref)
          if (snap.exists()) {
            setUserDoc(snap.data())
          } else {
            const newDoc = {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              role: 'viewer',
              createdAt: serverTimestamp(),
            }
            await setDoc(ref, newDoc)
            setUserDoc(newDoc)
          }
        } catch (err) {
          console.error('Failed to load user document:', err)
          setUserDoc(null)
        }
      } else {
        setUser(null)
        setUserDoc(null)
        setClaimAdmin(false)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const logout = () => signOut(auth)

  const isAdmin = claimAdmin || userDoc?.role === 'admin'
  const displayName = userDoc?.displayName || user?.email || ''
  const role = claimAdmin ? 'admin' : (userDoc?.role || 'viewer')

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
