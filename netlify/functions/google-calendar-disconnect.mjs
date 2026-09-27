import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, requireAdmin } from './_shared/firebase-admin.mjs'
import { errorResponse, json, requireMethod } from './_shared/http.mjs'
import { decryptSecret, getIntegration } from './_shared/integration.mjs'

export default async (request) => {
  try {
    requireMethod(request, ['POST'])
    const user = await requireAdmin(request)
    const integration = await getIntegration(user.uid)
    if (integration?.refreshToken) {
      const token = decryptSecret(integration.refreshToken)
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } }).catch(() => null)
    }
    await adminDb.doc(`calendarIntegrations/${user.uid}`).set({ connected: false, connectionStatus: 'not_connected', syncEnabled: false, refreshToken: FieldValue.delete(), disconnectedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return json({ disconnected: true, existingEventsRetained: true })
  } catch (error) { return errorResponse(error) }
}
