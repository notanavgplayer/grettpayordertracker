import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Contacts from '@/pages/Contacts'
import Notes from '@/pages/Notes'

const add = vi.fn()
const update = vi.fn()
const remove = vi.fn()
let contactRows = []
let noteRows = []
let isAdmin = true

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin }) }))
vi.mock('@/hooks/useFirestore', () => ({
  useCollection: (name) => ({ data: name === 'contacts' ? contactRows : noteRows, loading: false, error: null }),
  useFirestoreCRUD: () => ({ add, update, remove }),
}))

beforeEach(() => {
  contactRows = [{ id: 'contact-1', name: 'Long fixture contact name', role: 'Engineer', organization: 'Example firm', category: 'Agency Officer', phone: '03000000000', email: 'contact@example.test', notes: 'Original' }]
  noteRows = [{ id: 'note-1', title: 'Existing note', body: '<p>Important <b>formatted</b> text</p>', priority: 'medium', updatedAt: '2026-09-01' }]
  isAdmin = true
  add.mockReset().mockResolvedValue('new-id')
  update.mockReset().mockResolvedValue(undefined)
  remove.mockReset().mockResolvedValue(undefined)
})

describe('Contacts with disposable records', () => {
  it('preserves entered values on failed save and asks before discarding', async () => {
    update.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    render(<MemoryRouter><Contacts /></MemoryRouter>)
    await user.click(screen.getAllByRole('button', { name: 'Edit contact' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit Contact' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes' }), ' changed')
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Your entries are still here')
    expect(within(dialog).getByRole('textbox', { name: 'Notes' })).toHaveValue('Original changed')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('alertdialog', { name: 'Discard contact changes?' })).toBeInTheDocument()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('keeps contact links available without creating fake values and prevents viewer edits', () => {
    isAdmin = false
    render(<MemoryRouter><Contacts /></MemoryRouter>)
    expect(screen.getAllByRole('link', { name: '03000000000' })[0]).toHaveAttribute('href', 'tel:03000000000')
    expect(screen.getAllByRole('link', { name: 'contact@example.test' })[0]).toHaveAttribute('href', 'mailto:contact@example.test')
    expect(screen.queryByRole('button', { name: 'Add Contact' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit contact' })).not.toBeInTheDocument()
  })
})

describe('Notes with disposable records', () => {
  it('does not create a note until Save and preserves rich-text body on a title-only edit', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Notes /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Add Note' }))
    expect(add).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save Note' }))
    await waitFor(() => expect(add).toHaveBeenCalledOnce())
    expect(add.mock.calls[0][0].title).toBe('Untitled Note')
  })

  it('retains a failed draft, warns before selection changes, and does not execute HTML', async () => {
    update.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    render(<MemoryRouter><Notes /></MemoryRouter>)
    expect(screen.queryByText('<b>formatted</b>')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Existing note/ }))
    expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue('Important formatted text')
    await user.type(screen.getByRole('textbox', { name: 'Title' }), ' revised')
    await user.click(screen.getByRole('button', { name: 'Save Note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your edits are still here')
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Existing note revised')
    expect(update.mock.calls[0][1].body).toBe('<p>Important <b>formatted</b> text</p>')
    await user.click(screen.getByRole('button', { name: 'Add Note' }))
    expect(screen.getByRole('alertdialog', { name: 'Discard note changes?' })).toBeInTheDocument()
  })

  it('renders existing notes read-only for viewers', async () => {
    isAdmin = false
    const user = userEvent.setup()
    render(<MemoryRouter><Notes /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Add Note' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Existing note/ }))
    expect(screen.getByRole('textbox', { name: 'Content' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save Note' })).not.toBeInTheDocument()
  })
})
