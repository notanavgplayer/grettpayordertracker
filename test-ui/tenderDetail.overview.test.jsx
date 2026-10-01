import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TenderDetail from '@/pages/TenderDetail'

const { getDoc, getDocs } = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn() }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, _collection, id) => id,
  collection: (_db, name) => name,
  where: vi.fn(),
  query: (name) => name,
  getDoc,
  getDocs,
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(),
  deleteField: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, displayName: 'Tester' }) }))
vi.mock('@/lib/supabaseStorage', () => ({ getTenderDocumentUrl: vi.fn(), hasSupabaseStorageConfig: () => false, uploadTenderDocument: vi.fn() }))
vi.mock('@/lib/tenderIntegrations', () => ({ queueTenderIntegrationSync: vi.fn() }))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }))

const baseTender = {
  id: 'fixture', name: 'Long active engineering project name with a second phase and reference', nit: 'NIT-FIXTURE-2026', agency: 'Fixture Agency',
  status: 'In Progress', value: 2400000, estimatedCost: 3000000, quotedAmount: 2400000,
  awardWorkOrder: { workOrderNumber: 'WO-FIXTURE', workOrderDate: '2026-04-27', expectedCompletionDate: '2026-07-27' },
  bills: [{ id: 'bill', no: 'B-1', amount: 500000, approvedAmount: 400000, receivedAmount: 100000, status: 'Approved' }],
  raBills: [], documents: [{ id: 'doc', title: 'Work order document', type: 'Work Order' }],
  siteVisits: [{ id: 'visit', visitDate: '2026-05-09', location: 'Site A' }],
  checklist: [{ id: 'one', label: 'Check foundation', done: true }],
}
const expense = { id: 'expense', tenderRef: 'fixture', amount: 120000, description: 'Materials', date: '2026-05-12', v2: { kind: 'cost', payments: [] } }
const security = { id: 'po', tenderRef: 'fixture', po: 'PO-FIXTURE', status: 'Held', amount: 61000, v2: { instrument: 'pay-order', refunds: [] } }

async function renderFixture(overrides = {}, expenseRows = [expense], poRows = [security]) {
  const fixture = { ...baseTender, ...overrides }
  getDoc.mockResolvedValue({ exists: () => true, id: 'fixture', data: () => fixture })
  getDocs.mockImplementation(async (name) => ({ docs: (name === 'expenses' ? expenseRows : name === 'payOrders' ? poRows : []).map((item) => ({ id: item.id, data: () => item })) }))
  render(<MemoryRouter initialEntries={['/tenders/fixture']}><Routes><Route path="/tenders/:id" element={<TenderDetail />} /></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: fixture.name })
  if (poRows.length) await screen.findByText('PO-FIXTURE')
}

describe('project detail overview with disposable records', () => {
  beforeEach(() => { getDoc.mockReset(); getDocs.mockReset() })

  it('uses V2 financial values and opens detailed record tabs', async () => {
    await renderFixture({ v2: { forecastRemaining: 300000 } })
    expect(screen.getAllByText(/2,400,000/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/120,000/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/300,000/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/61,000/).length).toBeGreaterThan(0)
    expect(screen.getByText('WO-FIXTURE')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Checklist1\/1/ }))
    expect(screen.getByDisplayValue('Check foundation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Documents1/ }))
    expect(screen.getByRole('tab', { name: /Documents/ })).toHaveAttribute('data-state', 'active')
  })

  it('shows accurate completion-date and incomplete-history actions without claiming security is overdue', async () => {
    await renderFixture({ status: 'Completed', completionDate: '' }, [{ ...expense, v2: { kind: 'cost' } }])
    const actions = screen.getByText('Next Actions').closest('[data-slot="card"]') || screen.getByText('Next Actions').parentElement.parentElement
    expect(within(actions).getByText('Completion date not recorded')).toBeInTheDocument()
    expect(within(actions).getByText('Cost forecast incomplete')).toBeInTheDocument()
    expect(within(actions).getByText('Payment history incomplete')).toBeInTheDocument()
    expect(within(actions).getByText('Security still held')).toBeInTheDocument()
    expect(actions.textContent).not.toMatch(/overdue|refundable/i)
    fireEvent.click(within(actions).getByRole('button', { name: 'Edit details' }))
    expect(screen.getByLabelText('Completion date')).toBeInTheDocument()
  })

  it('keeps missing fields explicit for an active project without inventing closeout or security actions', async () => {
    await renderFixture({ agency: '', nit: '', estimatedCost: '', quotedAmount: '', awardWorkOrder: {}, bills: [], documents: [], siteVisits: [], checklist: [] }, [], [])
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0)
    expect(screen.queryByText('Completion date not recorded')).not.toBeInTheDocument()
    expect(screen.queryByText('Security still held')).not.toBeInTheDocument()
    expect(screen.getByText('Cost forecast incomplete')).toBeInTheDocument()
  })
})
