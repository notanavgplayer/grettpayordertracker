import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarMappingId, eventFromTender, intendedCalendarOperation, isEligibleTender } from '../netlify/functions/_shared/calendar-logic.mjs'
import { daysFromDateStrings, deliveryIdentity, emailThreshold, karachiDateString } from '../netlify/functions/_shared/reminder-logic.mjs'

test('email thresholds run only on configured milestone days', () => {
  assert.equal(emailThreshold(7), 'seven-days')
  assert.equal(emailThreshold(3), 'three-days')
  assert.equal(emailThreshold(1), 'one-day')
  assert.equal(emailThreshold(0), 'due-today')
  assert.equal(emailThreshold(6), null)
  assert.equal(emailThreshold(3, { threeDays: false }), null)
})

test('delivery identity deduplicates a threshold and changes with a new deadline', () => {
  const base = { tenderId: 't1', threshold: 'three-days', recipient: 'USER@example.com' }
  const first = deliveryIdentity({ ...base, dueDate: '2026-09-28' })
  assert.equal(first, deliveryIdentity({ ...base, dueDate: '2026-09-28', recipient: 'user@example.com' }))
  assert.notEqual(first, deliveryIdentity({ ...base, dueDate: '2026-10-05' }))
})

test('Pakistan calendar dates and day differences do not shift at UTC boundaries', () => {
  assert.equal(karachiDateString(new Date('2026-09-21T20:30:00Z')), '2026-09-22')
  assert.equal(daysFromDateStrings('2026-09-22', '2026-09-29'), 7)
})

test('existing calendar mappings update while missing mappings create', () => {
  assert.equal(calendarMappingId('user', 'tender'), 'user__tender')
  assert.equal(intendedCalendarOperation({ eventId: 'google-event' }), 'update')
  assert.equal(intendedCalendarOperation(null), 'create')
})

test('submitted and cancelled tenders stop calendar and email processing', () => {
  assert.equal(isEligibleTender({ status: 'Bidding', submissionDate: '2026-09-28' }), true)
  assert.equal(isEligibleTender({ status: 'Submitted', submissionDate: '2026-09-28' }), false)
  assert.equal(isEligibleTender({ status: 'Cancelled', submissionDate: '2026-09-28' }), false)
  assert.equal(isEligibleTender({ status: 'Bidding', submissionDate: '' }), false)
})

test('calendar event is all-day, linked, and contains configured reminders', () => {
  const event = eventFromTender('t1', { name: 'Road Works', submissionDate: '2026-09-28', status: 'Bidding' }, {}, 'https://example.test')
  assert.deepEqual(event.start, { date: '2026-09-28' })
  assert.deepEqual(event.end, { date: '2026-09-29' })
  assert.match(event.description, /https:\/\/example\.test\/tenders\/t1/)
  assert.deepEqual(event.reminders.overrides.map((item) => item.minutes), [10080, 4320, 1440, 0])
})
