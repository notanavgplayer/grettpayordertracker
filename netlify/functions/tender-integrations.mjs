import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, requireAdmin } from './_shared/firebase-admin.mjs'
import { body, errorResponse, json, requireMethod } from './_shared/http.mjs'
import { DEFAULT_THRESHOLDS, getIntegration } from './_shared/integration.mjs'

function publicSettings(integration, user) {
  return {
    calendar: {
      configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_OAUTH_STATE_SECRET && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY),
      connected: integration?.connected === true,
      connectionStatus: integration?.connectionStatus || 'not_connected',
      accountLabel: integration?.googleAccountLabel || '',
      syncEnabled: integration?.syncEnabled === true,
      thresholds: { ...DEFAULT_THRESHOLDS, ...(integration?.calendarThresholds || {}) },
      lastSyncAt: integration?.lastSyncAt || null,
    },
    email: {
      configured: Boolean(process.env.RESEND_API_KEY && process.env.TENDER_REMINDER_FROM_EMAIL),
      enabled: integration?.emailEnabled === true,
      recipient: integration?.emailRecipient || user.email || '',
      thresholds: { ...DEFAULT_THRESHOLDS, ...(integration?.emailThresholds || {}) },
    },
  }
}

export default async (request) => {
  try {
    requireMethod(request, ['GET', 'PATCH'])
    const user = await requireAdmin(request)
    if (request.method === 'GET') return json(publicSettings(await getIntegration(user.uid), user))
    const data = await body(request)
    const current = await getIntegration(user.uid)
    const patch = { updatedAt: FieldValue.serverTimestamp() }
    if (data.calendar) {
      if (data.calendar.syncEnabled === true && !current?.connected) throw Object.assign(new Error('Connect Google Calendar before enabling automatic sync.'), { status: 409 })
      if ('syncEnabled' in data.calendar) patch.syncEnabled = data.calendar.syncEnabled === true
      if (data.calendar.thresholds) patch.calendarThresholds = { ...DEFAULT_THRESHOLDS, ...data.calendar.thresholds }
    }
    if (data.email) {
      if (data.email.enabled === true && (!process.env.RESEND_API_KEY || !process.env.TENDER_REMINDER_FROM_EMAIL)) throw Object.assign(new Error('Email delivery is not configured in Netlify.'), { status: 409 })
      if (data.email.enabled === true && !current?.emailRecipient && !('recipient' in data.email)) patch.emailRecipient = user.email || ''
      if ('enabled' in data.email) patch.emailEnabled = data.email.enabled === true
      if ('recipient' in data.email) {
        const recipient = String(data.email.recipient || '').trim()
        if (recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 })
        patch.emailRecipient = recipient
      }
      if (data.email.thresholds) patch.emailThresholds = { ...DEFAULT_THRESHOLDS, ...data.email.thresholds }
    }
    await adminDb.doc(`calendarIntegrations/${user.uid}`).set({ uid: user.uid, ...patch }, { merge: true })
    return json(publicSettings(await getIntegration(user.uid), user))
  } catch (error) { return errorResponse(error) }
}
