import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from './_shared/firebase-admin.mjs'
import { isEligibleTender, markSyncFailure, syncTenderForUser } from './_shared/integration.mjs'

export default async () => {
  const summary = { users: 0, tenders: 0, failed: 0 }
  try {
    const [integrations, tenders, mappings] = await Promise.all([
      adminDb.collection('calendarIntegrations').where('connected', '==', true).get(),
      adminDb.collection('tenders').get(),
      adminDb.collection('calendarMappings').get(),
    ])
    const activeIds = tenders.docs.filter((doc) => isEligibleTender(doc.data())).map((doc) => doc.id)
    for (const integrationDoc of integrations.docs.filter((doc) => doc.data().syncEnabled === true)) {
      const uid = integrationDoc.id
      summary.users += 1
      const mappedIds = mappings.docs.filter((doc) => doc.data().uid === uid).map((doc) => doc.data().tenderId)
      for (const tenderId of new Set([...activeIds, ...mappedIds])) {
        try { await syncTenderForUser(uid, tenderId); summary.tenders += 1 }
        catch (error) { await markSyncFailure(uid, tenderId, error); summary.failed += 1 }
      }
      await integrationDoc.ref.set({ lastSyncAt: FieldValue.serverTimestamp(), lastSyncSummary: summary, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    }
    return new Response(JSON.stringify(summary), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (error) {
    console.error(error?.message || error)
    return new Response(JSON.stringify({ error: 'Calendar reconciliation failed.' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}

export const config = { schedule: '45 3 * * *' }
