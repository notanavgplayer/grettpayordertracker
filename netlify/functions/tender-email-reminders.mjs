import { processTenderReminders } from './_shared/reminders.mjs'

export default async () => {
  try {
    const summary = await processTenderReminders()
    return new Response(JSON.stringify(summary), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (error) {
    console.error(error?.message || error)
    return new Response(JSON.stringify({ error: 'Reminder processing failed.' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}

export const config = { schedule: '0 4 * * *' }
