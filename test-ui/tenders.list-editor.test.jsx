import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Tenders from '@/pages/Tenders'
import { tenderListAmount, validTenderSubmissionDate } from '@/lib/tenderListPresentation'

const { writeBatch, commit } = vi.hoisted(() => ({ writeBatch: vi.fn(), commit: vi.fn() }))
const rows = [
  { id: 't-long', name: 'Fixture tender with a deliberately long title that must stay accessible to readers', nit: 'NIT-FIXTURE-1', agency: 'Agency A', status: 'Bidding', value: 900, estimatedCost: 1200, quotedAmount: 1100, tenderFee: 25, submissionDate: '2026-12-20', contact: 'Saved contact', notes: 'Saved notes', linkedPO: 'PO-FIXTURE', checklist: [{ id: 'c1' }], documents: [{ id: 'd1' }] },
  { id: 't-closed', name: 'Fixture completed tender', status: 'Completed', value: 2200, submissionDate: '2026-01-10' },
  { id: 't-missing', name: 'Fixture missing fields', status: 'Draft', value: '', submissionDate: '2026-02-30' },
]
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({ id: 'new-tender' })), collection: vi.fn(() => ({})), serverTimestamp: vi.fn(), writeBatch }))
vi.mock('@/hooks/useFirestore', () => ({ useCollection: () => ({ data: rows, loading: false, error: null }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, displayName: 'Fixture Admin' }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/tenderIntegrations', () => ({ queueTenderIntegrationSync: vi.fn() }))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }))

function mount() { render(<MemoryRouter><Tenders /></MemoryRouter>) }

beforeEach(() => {
  writeBatch.mockReset()
  commit.mockReset()
  writeBatch.mockReturnValue({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit })
})

describe('tender list and editor with disposable fixtures', () => {
  it('labels amount basis, keeps missing values unknown, and only counts valid actionable deadlines', () => {
    expect(tenderListAmount(rows[0])).toEqual({ amount: 1100, label: 'Quoted bid' })
    expect(tenderListAmount(rows[1])).toEqual({ amount: 2200, label: 'Recorded tender value' })
    expect(tenderListAmount(rows[2])).toEqual({ amount: null, label: 'Amount not recorded' })
    expect(validTenderSubmissionDate(rows[2].submissionDate)).toBe(false)
    mount()
    const table = screen.getByRole('table')
    expect(within(table).getByTitle(rows[0].name)).toBeInTheDocument()
    expect(within(table).getByText('NIT-FIXTURE-1')).toBeInTheDocument()
    expect(within(table).getByText('Quoted bid')).toBeInTheDocument()
    expect(within(table).getAllByText('Not recorded').length).toBeGreaterThan(0)
    expect(within(table).queryByText(/days overdue/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 awarded contract amount not recorded/)).toBeInTheDocument()
  })

  it('exposes optional columns and search without changing record links', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Columns' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Estimate' }))
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Estimate' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Search tenders' }), 'completed')
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'Fixture completed tender' })).toHaveAttribute('href', '/tenders/t-closed')
  })

  it('preserves populated fields when status changes and retains draft on a failed save', async () => {
    const user = userEvent.setup()
    commit.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }))
    mount()
    await user.click(screen.getAllByRole('button', { name: `Actions for ${rows[0].name}` })[0])
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(screen.getByRole('textbox', { name: 'Linked Pay Order' })).toHaveValue('PO-FIXTURE')
    expect(screen.getByRole('textbox', { name: 'Contact' })).toHaveValue('Saved contact')
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Saved notes')
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'Submitted' }))
    expect(screen.getByRole('textbox', { name: 'Linked Pay Order' })).toHaveValue('PO-FIXTURE')
    expect(screen.getByRole('textbox', { name: 'Contact' })).toHaveValue('Saved contact')
    await user.clear(screen.getByRole('textbox', { name: 'Tender Name' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(screen.getByText('Tender name is required')).toBeInTheDocument()
    expect(commit).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: 'Tender Name' }), 'Updated fixture')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByText(/connection to Firestore is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Tender Name' })).toHaveValue('Updated fixture')
    expect(screen.getByRole('textbox', { name: 'Linked Pay Order' })).toHaveValue('PO-FIXTURE')
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('saves a status change with previously populated links, arrays and amounts intact', async () => {
    const user = userEvent.setup()
    const update = vi.fn()
    writeBatch.mockReturnValue({ set: vi.fn(), update, delete: vi.fn(), commit: vi.fn().mockResolvedValue() })
    mount()
    await user.click(screen.getAllByRole('button', { name: `Actions for ${rows[0].name}` })[0])
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'Submitted' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    const payload = update.mock.calls.find(([, value]) => value.status === 'Submitted')?.[1]
    expect(payload).toMatchObject({ linkedPO: 'PO-FIXTURE', contact: 'Saved contact', notes: 'Saved notes', value: 900, estimatedCost: 1200, quotedAmount: 1100, checklist: [{ id: 'c1' }], documents: [{ id: 'd1' }] })
  })

  it('confirms dirty cancel and closes clean create without writes', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add Tender' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add Tender' }))
    await user.type(screen.getByRole('textbox', { name: 'Tender Name' }), 'Unsaved fixture')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('textbox', { name: 'Tender Name' })).toHaveValue('Unsaved fixture')
    expect(writeBatch).not.toHaveBeenCalled()
  })
})
