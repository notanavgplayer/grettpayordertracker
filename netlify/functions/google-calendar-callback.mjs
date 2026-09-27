import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from './_shared/firebase-admin.mjs'
import { encryptSecret, verifyState } from './_shared/integration.mjs'

const settingsUrl = (status) => `${String(process.env.PUBLIC_SITE_URL || 'https://grettpayordertracker.netlify.app').replace(/\/$/, '')}/settings?calendar=${status}`

export default async (request) => {
  try {
    const url = new URL(request.url)
    const payload = verifyState(url.searchParams.get('state'))
    const stateRef = adminDb.doc(`oauthStates/${payload.nonce}`)
    const stateSnap = await stateRef.get()
    if (!stateSnap.exists || stateSnap.data().uid !== payload.uid || stateSnap.data().expiresAt < Date.now()) throw new Error('OAuth state is invalid or expired.')
    await stateRef.delete()
    if (url.searchParams.get('error')) return Response.redirect(settingsUrl('denied'), 302)
    const profileSnap = await adminDb.doc(`users/${payload.uid}`).get()
    if (!profileSnap.exists || profileSnap.data().role !== 'admin') throw new Error('Administrator access is required.')
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', redirect_uri: process.env.GOOGLE_REDIRECT_URI || '', grant_type: 'authorization_code' }),
    })
    const token = await response.json()
    if (!response.ok || !token.refresh_token) throw new Error(`Google OAuth exchange failed: ${token.error || response.status}`)
    await adminDb.doc(`calendarIntegrations/${payload.uid}`).set({
      uid: payload.uid, connected: true, connectionStatus: 'connected', syncEnabled: true,
      calendarId: 'primary', googleAccountLabel: 'Primary calendar',
      refreshToken: encryptSecret(token.refresh_token), calendarThresholds: { sevenDays: true, threeDays: true, oneDay: true, dueToday: true },
      connectedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return Response.redirect(settingsUrl('connected'), 302)
  } catch (error) {
    console.error(error?.message || error)
    return Response.redirect(settingsUrl('error'), 302)
  }
}
