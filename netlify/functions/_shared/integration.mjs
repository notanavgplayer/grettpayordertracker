import crypto from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin.mjs'
import { calendarMappingId, DEFAULT_THRESHOLDS, eventFromTender, isEligibleTender, reminderMinutes } from './calendar-logic.mjs'

export { DEFAULT_THRESHOLDS, calendarMappingId, eventFromTender, isEligibleTender, reminderMinutes } from './calendar-logic.mjs'

function encryptionKey() {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || ''
  let bytes
  try { bytes = Buffer.from(value, 'base64') } catch { bytes = Buffer.alloc(0) }
  if (bytes.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')
  return bytes
}

export function encryptSecret(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), version: 1 }
}

export function decryptSecret(value) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8')
}

export function signState(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET
  if (!secret || secret.length < 32) throw new Error('GOOGLE_OAUTH_STATE_SECRET must contain at least 32 characters.')
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyState(state) {
  const [encoded, signature] = String(state || '').split('.')
  if (!encoded || !signature) throw Object.assign(new Error('Invalid OAuth state.'), { status: 400 })
  const expected = crypto.createHmac('sha256', process.env.GOOGLE_OAUTH_STATE_SECRET || '').update(encoded).digest('base64url')
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw Object.assign(new Error('Invalid OAuth state.'), { status: 400 })
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  if (!payload.uid || !payload.nonce || payload.exp < Date.now()) throw Object.assign(new Error('OAuth request expired.'), { status: 400 })
  return payload
}

export async function getIntegration(uid) {
  const snap = await adminDb.doc(`calendarIntegrations/${uid}`).get()
  return snap.exists ? { id: snap.id, ...snap.data() } : null
}

export async function getGoogleAccessToken(integration) {
  if (!integration?.refreshToken) throw Object.assign(new Error('Google Calendar is not connected.'), { status: 409 })
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: decryptSecret(integration.refreshToken),
      grant_type: 'refresh_token',
    }),
  })
  const result = await response.json()
  if (!response.ok) {
    if (result.error === 'invalid_grant') await adminDb.doc(`calendarIntegrations/${integration.id}`).set({ connectionStatus: 'reauthorization_required', syncEnabled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    throw new Error(`Google token refresh failed: ${result.error || response.status}`)
  }
  return result.access_token
}

export async function googleRequest(accessToken, path, options = {}) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...(options.headers || {}) },
  })
  if (response.status === 204) return null
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(result.error?.message || `Google Calendar request failed (${response.status}).`), { googleStatus: response.status })
  return result
}

export async function syncTenderForUser(uid, tenderId) {
  const integration = await getIntegration(uid)
  if (!integration?.connected || !integration.syncEnabled) return { action: 'skipped', reason: 'not-connected' }
  const mappingRef = adminDb.doc(`calendarMappings/${calendarMappingId(uid, tenderId)}`)
  const [tenderSnap, mappingSnap] = await Promise.all([adminDb.doc(`tenders/${tenderId}`).get(), mappingRef.get()])
  const mapping = mappingSnap.exists ? mappingSnap.data() : null
  const tender = tenderSnap.exists ? tenderSnap.data() : null
  const accessToken = await getGoogleAccessToken(integration)
  const calendarId = encodeURIComponent(integration.calendarId || 'primary')

  if (!tender || !isEligibleTender(tender)) {
    if (mapping?.eventId) {
      await googleRequest(accessToken, `/calendars/${calendarId}/events/${encodeURIComponent(mapping.eventId)}`, { method: 'DELETE' }).catch((error) => {
        if (error.googleStatus !== 404 && error.googleStatus !== 410) throw error
      })
      await mappingRef.delete()
      return { action: 'deleted' }
    }
    return { action: 'skipped', reason: 'ineligible' }
  }

  const event = eventFromTender(tenderId, tender, integration, process.env.PUBLIC_SITE_URL)
  let result
  let action = 'created'
  if (mapping?.eventId) {
    try {
      result = await googleRequest(accessToken, `/calendars/${calendarId}/events/${encodeURIComponent(mapping.eventId)}`, { method: 'PATCH', body: JSON.stringify(event) })
      action = 'updated'
    } catch (error) {
      if (error.googleStatus !== 404 && error.googleStatus !== 410) throw error
    }
  }
  if (!result) result = await googleRequest(accessToken, `/calendars/${calendarId}/events`, { method: 'POST', body: JSON.stringify(event) })
  await mappingRef.set({ uid, tenderId, eventId: result.id, calendarId: integration.calendarId || 'primary', dueDate: tender.submissionDate, syncStatus: 'synced', lastSyncedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return { action, eventId: result.id }
}

export async function markSyncFailure(uid, tenderId, error) {
  await adminDb.doc(`calendarMappings/${calendarMappingId(uid, tenderId)}`).set({ uid, tenderId, syncStatus: 'failed', lastError: String(error?.message || error).slice(0, 500), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
}
