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

// Keep the integration callable, but do not activate its production schedule in the V2 release.
