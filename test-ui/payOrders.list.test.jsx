import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PayOrders from '@/pages/PayOrders'

const rows = [
  { id: 'held', po: 'FIXTURE-H', bank: 'Test Bank', tender: 'A long project name that must remain accessible even when the table preview is clamped across multiple lines', tenderRef: 'project-1', nit: 'NIT-1', agency: 'Agency A', amount: 61000, status: 'Held', bidResult: 'N/A', v2: { instrument: 'pay-order', refunds: [{ id: 'r1', amount: 10000, date: '2026-09-20' }] } },
  { id: 'guarantee', po: 'FIXTURE-G', bank: 'Test Bank', tender: 'Missing link project', tenderRef: 'missing', nit: 'NIT-2', amount: 90000, status: 'Pending', bidResult: 'N/A', v2: { instrument: 'guarantee' } },
]
const projects = [
  { id: 'project-1', name: rows[0].tender, nit: 'NIT-1', agency: 'Agency A', status: 'Completed' },
  { id: 'project-2', name: 'Second fixture project', nit: 'NIT-2', agency: 'Agency B', status: 'In Progress' },
]
const { writeBatch } = vi.hoisted(() => ({ writeBatch: vi.fn() }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({ id: 'new-po' })), collection: vi.fn(() => ({})), serverTimestamp: vi.fn(), writeBatch }))
vi.mock('@/hooks/useFirestore', () => ({
  useCollection: (name) => ({ data: name === 'payOrders' ? rows : name === 'tenders' ? projects : [], loading: false, error: null }),
  useFirestoreCRUD: () => ({ add: vi.fn(), remove: vi.fn() }),
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, displayName: 'Tester' }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))

describe('pay order list with disposable records', () => {
  it('keeps known cash distinct from unknown guarantee margin and exposes optional columns', async () => {
    const user = userEvent.setup()
    render(<PayOrders />)
    expect(screen.getByText('Open instruments; 1 unknown guarantee margin excluded')).toBeInTheDocument()
    const tables = screen.getAllByRole('table')
    const table = tables[0]
    expect(within(table).getByText('FIXTURE-H')).toBeInTheDocument()
    expect(within(table).getByText('Unknown')).toBeInTheDocument()
    expect(within(table).getByText('Project link missing')).toBeInTheDocument()
    expect(within(table).getByTitle(rows[0].tender)).toBeInTheDocument()
    expect(within(table).getAllByText('Not scheduled')).toHaveLength(2)
    expect(within(table).queryByRole('columnheader', { name: 'Agency' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Columns' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Agency' }))
    expect(within(table).getByText('Agency')).toBeInTheDocument()
  })

  it('opens the existing refund-review queue and retains status/search filtering', async () => {
    const user = userEvent.setup()
    render(<PayOrders />)
    await user.click(screen.getByRole('button', { name: 'Open 1 refund review items' }))
    expect(screen.getByText('Refund reviews (1) · Clear')).toBeInTheDocument()
    expect(screen.getAllByText('FIXTURE-H').length).toBeGreaterThan(0)
    expect(screen.queryByText('FIXTURE-G')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Held 1/ }))
    expect(screen.getAllByText('FIXTURE-H').length).toBeGreaterThan(0)
    expect(screen.queryByText('FIXTURE-G')).not.toBeInTheDocument()
  })

  it('closes a clean form and confirms a dirty cancellation without writing', async () => {
    const user = userEvent.setup()
    writeBatch.mockClear()
    render(<PayOrders />)
    await user.click(screen.getByRole('button', { name: 'Add Pay Order' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add Pay Order' }))
    await user.type(screen.getByRole('textbox', { name: 'PO / Instrument Number' }), 'TEST-NEW')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('textbox', { name: 'PO / Instrument Number' })).toHaveValue('TEST-NEW')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(writeBatch).not.toHaveBeenCalled()
  }, 15000)

  it('preserves manually cleared or edited project fields when the link changes', async () => {
    const user = userEvent.setup()
    writeBatch.mockClear()
    render(<PayOrders />)
    await user.click(screen.getByRole('button', { name: 'Add Pay Order' }))
    await user.click(screen.getByRole('button', { name: 'Existing project' }))
    await user.type(screen.getByRole('textbox', { name: 'Search projects' }), 'long project')
    await user.click(screen.getByRole('button', { name: /A long project name/ }))
    expect(screen.getByRole('textbox', { name: 'NIT / Reference' })).toHaveValue('NIT-1')
    expect(screen.getByRole('textbox', { name: 'Agency' })).toHaveValue('Agency A')
    await user.clear(screen.getByRole('textbox', { name: 'NIT / Reference' }))
    await user.clear(screen.getByRole('textbox', { name: 'Agency' }))
    await user.type(screen.getByRole('textbox', { name: 'Agency' }), 'Manual agency')
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await user.type(screen.getByRole('textbox', { name: 'Search projects' }), 'Second fixture')
    await user.click(screen.getByRole('button', { name: /Second fixture project/ }))
    expect(screen.getByRole('textbox', { name: 'NIT / Reference' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Agency' })).toHaveValue('Manual agency')
    expect(writeBatch).not.toHaveBeenCalled()
  }, 15000)

  it('keeps the form open with an inline error when saving fails', async () => {
    const user = userEvent.setup()
    const commit = vi.fn().mockRejectedValue(new Error('offline'))
    writeBatch.mockReturnValue({ set: vi.fn(), update: vi.fn(), commit })
    render(<PayOrders />)
    await user.click(screen.getByRole('button', { name: 'Add Pay Order' }))
    await user.type(screen.getByRole('textbox', { name: 'PO / Instrument Number' }), 'FIXTURE-NEW')
    await user.type(screen.getByRole('spinbutton', { name: 'Instrument Amount (PKR)' }), '500')
    await user.click(screen.getByRole('button', { name: 'Add Pay Order' }))
    expect(await screen.findByRole('alert', { name: '' })).toHaveTextContent('The pay order could not be saved')
    expect(screen.getByRole('textbox', { name: 'PO / Instrument Number' })).toHaveValue('FIXTURE-NEW')
    expect(commit).toHaveBeenCalledTimes(1)
  })
})
