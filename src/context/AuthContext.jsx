import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        // Load or create user document
        const ref = doc(db, 'users', firebaseUser.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          setUserDoc(snap.data())
        } else {
          const newDoc = {
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
            role: 'viewer',
            createdAt: serverTimestamp(),
          }
          await setDoc(ref, newDoc)
          setUserDoc(newDoc)
        }
      } else {
        setUser(null)
        setUserDoc(null)
      }
      setLoading(false)
    })
    return unsub
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
