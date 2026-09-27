import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin.mjs'
import { isEligibleTender } from './integration.mjs'
import { daysFromDateStrings, deliveryIdentity, emailThreshold, karachiDateString } from './reminder-logic.mjs'

export { daysFromDateStrings, deliveryIdentity, emailThreshold, karachiDateString } from './reminder-logic.mjs'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))
}

export function buildTenderEmail(tenderId, tender, days) {
  const name = tender.name || 'Untitled tender'
  const remaining = days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `${days} days remaining`
  const subject = days === 0 ? `Tender due today — ${name}` : days === 1 ? `Urgent: Tender due tomorrow — ${name}` : `Tender reminder: ${days} days remaining — ${name}`
  const baseUrl = String(process.env.PUBLIC_SITE_URL || 'https://grettpayordertracker.netlify.app').replace(/\/$/, '')
  const link = `${baseUrl}/tenders/${encodeURIComponent(tenderId)}`
  const rows = [
    ['Tender', name], ['Department', tender.agency || '—'], ['Tender No', tender.nit || '—'],
    ['Submission Deadline', String(tender.submissionDate).slice(0, 10)], ['Time Remaining', remaining], ['Status', tender.status || 'Bidding'],
  ]
  const text = ['Tender Deadline Reminder', '', ...rows.map(([label, value]) => `${label}: ${value}`), '', `View Tender Details: ${link}`].join('\n')
  const htmlRows = rows.map(([label, value]) => `<tr><td style="padding:7px 12px;color:#64748b;vertical-align:top">${escapeHtml(label)}</td><td style="padding:7px 12px;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`).join('')
  const html = `<div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #dbe3ea;border-radius:12px;overflow:hidden"><div style="background:#047857;color:#fff;padding:20px 24px"><h1 style="font-size:20px;margin:0">Tender Deadline Reminder</h1></div><div style="padding:18px 12px 24px"><table style="width:100%;border-collapse:collapse;font-size:14px">${htmlRows}</table><div style="padding:16px 12px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#047857;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700">View Tender Details</a></div></div></div></div>`
  return { subject, text, html }
}

export async function sendReminderEmail({ uid, tenderId, tender, recipient, threshold, days }) {
  const id = deliveryIdentity({ tenderId, dueDate: tender.submissionDate, threshold, recipient })
  const ref = adminDb.doc(`reminderDeliveries/${id}`)
  const acquired = await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    const existing = snap.exists ? snap.data() : null
    const processingAt = existing?.updatedAt?.toMillis?.() || 0
    if (existing?.status === 'sent' || (existing?.status === 'processing' && Date.now() - processingAt < 15 * 60_000)) return false
    transaction.set(ref, { uid, tenderId, dueDate: tender.submissionDate, threshold, channel: 'email', recipient, status: 'processing', attempts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), createdAt: snap.exists ? snap.data().createdAt : FieldValue.serverTimestamp() }, { merge: true })
    return true
  })
  if (!acquired) return { status: 'duplicate', id }
  try {
    const message = buildTenderEmail(tenderId, tender, days)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY || ''}`, 'content-type': 'application/json', 'idempotency-key': id },
      body: JSON.stringify({ from: process.env.TENDER_REMINDER_FROM_EMAIL, to: [recipient], ...message }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.message || `Resend request failed (${response.status}).`)
    await ref.set({ status: 'sent', providerId: result.id || null, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() }, { merge: true })
    return { status: 'sent', id }
  } catch (error) {
    await ref.set({ status: 'failed', lastError: String(error?.message || error).slice(0, 500), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    throw error
  }
}

export async function processTenderReminders(now = new Date()) {
  if (!process.env.RESEND_API_KEY || !process.env.TENDER_REMINDER_FROM_EMAIL) throw new Error('Resend email environment variables are not configured.')
  const [integrationsSnap, tendersSnap] = await Promise.all([
    adminDb.collection('calendarIntegrations').where('emailEnabled', '==', true).get(),
    adminDb.collection('tenders').get(),
  ])
  const tenders = tendersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(isEligibleTender)
  const today = karachiDateString(now)
  const summary = { integrations: integrationsSnap.size, considered: 0, sent: 0, duplicate: 0, failed: 0 }
  for (const integrationDoc of integrationsSnap.docs) {
    const integration = integrationDoc.data()
    const recipient = String(integration.emailRecipient || '').trim()
    if (!recipient) continue
    for (const tender of tenders) {
      const days = daysFromDateStrings(today, tender.submissionDate)
      const threshold = emailThreshold(days, integration.emailThresholds || {})
      if (!threshold) continue
      summary.considered += 1
      try {
        const result = await sendReminderEmail({ uid: integrationDoc.id, tenderId: tender.id, tender, recipient, threshold, days })
        summary[result.status] = (summary[result.status] || 0) + 1
      } catch (error) {
        console.error(`Reminder failed for tender ${tender.id}:`, error.message)
        summary.failed += 1
      }
    }
  }
  return summary
}
