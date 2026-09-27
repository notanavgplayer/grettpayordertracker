import crypto from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, requireAdmin } from './_shared/firebase-admin.mjs'
import { errorResponse, json, requireMethod } from './_shared/http.mjs'
import { signState } from './_shared/integration.mjs'

export default async (request) => {
  try {
    requireMethod(request, ['POST'])
    const user = await requireAdmin(request)
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) throw Object.assign(new Error('Google Calendar is not configured.'), { status: 409 })
    const nonce = crypto.randomBytes(24).toString('base64url')
    const state = signState({ uid: user.uid, nonce, exp: Date.now() + 10 * 60_000 })
    await adminDb.doc(`oauthStates/${nonce}`).set({ uid: user.uid, expiresAt: Date.now() + 10 * 60_000, createdAt: FieldValue.serverTimestamp() })
    const redirectUri = process.env.GOOGLE_REDIRECT_URI
    if (!redirectUri) throw new Error('GOOGLE_REDIRECT_URI is not configured.')
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '', redirect_uri: redirectUri,
      response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
      scope: 'https://www.googleapis.com/auth/calendar.events', state,
    }).toString()
    return json({ authorizationUrl: url.toString() })
  } catch (error) { return errorResponse(error) }
}
