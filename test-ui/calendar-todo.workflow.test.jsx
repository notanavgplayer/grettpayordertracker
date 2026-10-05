import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Calendar from '@/pages/Calendar'
import Todo from '@/pages/Todo'
import { shiftDate, todayInKarachi } from '@/lib/calendarTodo'

const state = vi.hoisted(() => ({ data: {}, add: vi.fn(), update: vi.fn(), remove: vi.fn(), updateDoc: vi.fn() }))
vi.mock('@/hooks/useFirestore', () => ({
  useCollection: (name) => ({ data: state.data[name] || [], loading: false, error: null }),
  useFirestoreCRUD: () => ({ add: state.add, update: state.update, remove: state.remove }),
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, displayName: 'Test Admin' }) }))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_db, name, id) => `${name}/${id}`, deleteField: () => 'DELETE_FIELD', updateDoc: state.updateDoc }))

describe('Calendar and To-Do with disposable records', () => {
  beforeEach(() => {
    state.data = { tenders: [], payOrders: [], todos: [], calendarEvents: [] }
    state.add.mockReset().mockResolvedValue('new-id')
    state.update.mockReset().mockResolvedValue(undefined)
    state.remove.mockReset().mockResolvedValue(undefined)
    state.updateDoc.mockReset().mockResolvedValue(undefined)
  })

  it('calendar filters recorded sources, shows full details and opens source record', () => {
    const today = todayInKarachi()
    state.data.tenders = [{ id: 't1', name: 'Very long disposable project name with several extra descriptive words', status: 'Bidding', submissionDate: today }]
    state.data.payOrders = [{ id: 'p1', po: 'TEST-PO', v2: { followUpDate: today } }]
    render(<MemoryRouter><Calendar /></MemoryRouter>)
    expect(screen.getAllByText(/Very long disposable project/).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByRole('combobox', { name: 'Event source' }), { target: { value: 'payOrder' } })
    expect(screen.getAllByText(/TEST-PO/).length).toBeGreaterThan(0)
    expect(screen.queryByText('No recorded events in this range. Change the month or clear filters.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /PO #TEST-PO/ }))
    expect(screen.getAllByText('Pay order', { selector: 'p' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Open record/ })).toBeInTheDocument()
    expect(state.add).not.toHaveBeenCalled()
  })

  it('manual calendar save validates inline and keeps entries after a failed write', async () => {
    state.add.mockRejectedValueOnce(new Error('offline'))
    render(<MemoryRouter><Calendar /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }))
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Synthetic meeting' } })
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Event', exact: true }))
    expect(screen.getByRole('alert')).toHaveTextContent('valid date')
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: todayInKarachi() } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Event', exact: true }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not be saved'))
    expect(screen.getByLabelText('Title *')).toHaveValue('Synthetic meeting')
    expect(state.add).toHaveBeenCalledTimes(1)
  })

  it('tasks distinguish overdue, today, completed and undated records; edit failure preserves inputs', async () => {
    const today = todayInKarachi()
    state.data.todos = [
      { id: 'late', text: 'Late manual task', dueDate: shiftDate(today, -1), priority: 'high', done: false },
      { id: 'today', text: 'Today manual task', dueDate: today, priority: 'medium', done: false },
      { id: 'done', text: 'Completed task', dueDate: shiftDate(today, -2), done: true },
      { id: 'undated', text: 'Undated task', done: false },
    ]
    state.update.mockRejectedValueOnce(new Error('offline'))
    render(<MemoryRouter><Todo /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }))
    expect(screen.getByText('Late manual task')).toBeInTheDocument()
    expect(screen.queryByText('Completed task')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No Due Date' }))
    expect(screen.getByText('Undated task')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByText('Today manual task')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Today manual task' }))
    fireEvent.change(screen.getByLabelText('Task title *'), { target: { value: 'Changed synthetic task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not be saved'))
    expect(screen.getByLabelText('Task title *')).toHaveValue('Changed synthetic task')
  })
})
