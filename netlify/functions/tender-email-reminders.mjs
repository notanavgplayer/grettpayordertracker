import { processTenderReminders } from './_shared/reminders.mjs'

export default async () => {
  if (process.env.GRETT_CALENDAR_EMAIL_ENABLED !== 'true') {
    return new Response('Email reminders are not enabled.', { status: 404 })
  }
  try {
    const summary = await processTenderReminders()
    return new Response(JSON.stringify(summary), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (error) {
    console.error(error?.message || error)
    return new Response(JSON.stringify({ error: 'Reminder processing failed.' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}

// Scheduled-only: Netlify does not serve scheduled functions over a public URL in
// production. GRETT_CALENDAR_EMAIL_ENABLED still gates whether a run does any work.
// Manual runs go through the admin-gated test-tender-email function.
export const config = { schedule: '@daily' }
