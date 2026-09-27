import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, requireAdmin } from './_shared/firebase-admin.mjs'
import { body, errorResponse, json, requireMethod } from './_shared/http.mjs'
import { isEligibleTender, markSyncFailure, syncTenderForUser } from './_shared/integration.mjs'

export default async (request) => {
  try {
    requireMethod(request, ['POST'])
    const user = await requireAdmin(request)
    const data = await body(request)
    let ids = []
    if (data.tenderId) ids = [String(data.tenderId)]
    else {
      const [tenders, mappings] = await Promise.all([adminDb.collection('tenders').get(), adminDb.collection('calendarMappings').where('uid', '==', user.uid).get()])
      ids = Array.from(new Set([
        ...tenders.docs.filter((doc) => isEligibleTender(doc.data())).map((doc) => doc.id),
        ...mappings.docs.map((doc) => doc.data().tenderId).filter(Boolean),
      ]))
    }
    const summary = { total: ids.length, created: 0, updated: 0, deleted: 0, skipped: 0, failed: 0 }
    for (const tenderId of ids) {
      try {
        const result = await syncTenderForUser(user.uid, tenderId)
        summary[result.action] = (summary[result.action] || 0) + 1
      } catch (error) {
        summary.failed += 1
        await markSyncFailure(user.uid, tenderId, error)
      }
    }
    await adminDb.doc(`calendarIntegrations/${user.uid}`).set({ lastSyncAt: FieldValue.serverTimestamp(), lastSyncSummary: summary, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return json(summary)
  } catch (error) { return errorResponse(error) }
}
