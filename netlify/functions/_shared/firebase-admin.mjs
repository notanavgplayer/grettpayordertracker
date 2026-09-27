import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.')
  const parsed = JSON.parse(raw)
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
  return parsed
}

const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount()) })

export const adminAuth = getAuth(app)
export const adminDb = getFirestore(app)

export async function requireUser(request) {
  const header = request.headers.get('authorization') || ''
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Sign in is required.'), { status: 401 })
  const decoded = await adminAuth.verifyIdToken(header.slice(7), true)
  const profile = await adminDb.doc(`users/${decoded.uid}`).get()
  if (!profile.exists) throw Object.assign(new Error('User profile was not found.'), { status: 403 })
  return { ...decoded, profile: profile.data() }
}

export async function requireAdmin(request) {
  const user = await requireUser(request)
  if (user.profile?.role !== 'admin') throw Object.assign(new Error('Administrator access is required.'), { status: 403 })
  return user
}
