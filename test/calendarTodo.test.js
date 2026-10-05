import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDate, dayDistance, deriveCalendarEvents, filterTasks, shiftDate, taskOverdue, todayInKarachi, validDateOnly } from '../src/lib/calendarTodo.js'

test('date-only values stay on their recorded day; invalid days are omitted', () => {
  assert.equal(calendarDate('2026-10-06'), '2026-10-06')
  assert.equal(calendarDate('2026-02-30'), '')
  assert.equal(validDateOnly('2024-02-29'), '2024-02-29')
  assert.equal(todayInKarachi(new Date('2026-10-05T20:00:00Z')), '2026-10-06')
  assert.equal(calendarDate({ seconds: Date.parse('2026-10-05T20:00:00Z') / 1000 }), '2026-10-06')
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01')
  assert.equal(dayDistance('2026-12-31', '2027-01-01'), 1)
})

test('calendar derives only recorded source dates, dedupes a mirrored site visit and respects lifecycle', () => {
  const events = deriveCalendarEvents({
    today: '2026-10-06',
    tenders: [
      { id: 'a', name: 'Active', status: 'Bidding', submissionDate: '2026-10-05', siteVisitDate: '2026-10-07', siteVisits: [{ id: 'v', date: '2026-10-07' }], raBills: [{ id: 'ra', paid: '2026-10-03' }] },
      { id: 'b', name: 'Closed', status: 'Completed', submissionDate: '2026-10-05', openingDate: 'bad' },
    ],
    payOrders: [{ id: 'po', po: '42', date: '2026-01-01', v2: { followUpDate: '2026-10-08' } }, { id: 'no-date', date: '2026-01-01' }],
    todos: [{ id: 'open', text: 'Today task', dueDate: '2026-10-06', done: false }, { id: 'done', text: 'Finished', dueDate: '2026-10-01', done: true }],
    customEvents: [{ id: 'manual', title: 'Meeting', date: '2026-10-09' }],
  })
  assert.equal(events.filter((event) => event.kind === 'siteVisit').length, 1)
  assert.equal(events.find((event) => event.id === 'submission-a').type, 'overdue')
  assert.equal(events.find((event) => event.id === 'submission-b').type, 'submission')
  assert.equal(events.find((event) => event.id === 'submission-b').actionable, false)
  assert.equal(events.find((event) => event.id === 'pay-order-po').date, '2026-10-08')
  assert.equal(events.find((event) => event.id === 'ra-a-ra').kind, 'billActivity')
  assert.equal(events.find((event) => event.id === 'pay-order-activity-no-date').kind, 'instrumentActivity')
  assert.equal(events.some((event) => event.id === 'pay-order-no-date' || event.id === 'task-done'), false)
  assert.equal(events.find((event) => event.id === 'task-open').type, 'task')
  assert.equal(events.find((event) => event.id === 'submission-a').link, '/tenders/a')
  assert.equal(events.find((event) => event.id === 'pay-order-po').link, '/pay-orders?search=42')
})

test('task filters use the Karachi calendar day and exclude completed or undated tasks from overdue', () => {
  const tasks = [
    { id: 'old', text: 'Past', dueDate: '2026-10-05', priority: 'high' },
    { id: 'today', text: 'Today', dueDate: '2026-10-06', priority: 'medium' },
    { id: 'later', text: 'Later', dueDate: '2026-10-07', priority: 'low' },
    { id: 'undated', text: 'No date', priority: 'high' },
    { id: 'done', text: 'Finished', dueDate: '2026-10-01', done: true },
  ]
  assert.equal(taskOverdue(tasks[3], '2026-10-06'), false)
  assert.equal(taskOverdue(tasks[4], '2026-10-06'), false)
  assert.deepEqual(filterTasks(tasks, { status: 'Overdue', today: '2026-10-06' }).map((task) => task.id), ['old'])
  assert.deepEqual(filterTasks(tasks, { status: 'Today', today: '2026-10-06' }).map((task) => task.id), ['today'])
  assert.deepEqual(filterTasks(tasks, { status: 'No Due Date', today: '2026-10-06' }).map((task) => task.id), ['undated'])
  assert.deepEqual(filterTasks(tasks, { status: 'Open', today: '2026-10-06' }).map((task) => task.id), ['old', 'today', 'later', 'undated'])
  assert.deepEqual(filterTasks(tasks, { status: 'All', search: 'past', priority: 'high', today: '2026-10-06' }).map((task) => task.id), ['old'])
})
