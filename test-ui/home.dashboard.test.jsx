import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from '@/pages/Home'
import { formatCurrency } from '@/lib/utils'

const { getDocs } = vi.hoisted(() => ({ getDocs: vi.fn() }))
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => name,
  getDocs,
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

const fixtures = {
  tenders: [
    { id: 'active', name: 'Test Roadworks', status: 'In Progress', value: 1000,
      bills: [{ amount: 400, approvedAmount: 350, receivedAmount: 100, status: 'Approved' }] },
    { id: 'finished', name: 'Finished Project', status: 'Completed', value: 200 },
  ],
  expenses: [{ id: 'cost', tenderRef: 'active', description: 'Test materials', amount: 120, v2: { kind: 'cost', payments: [] } }],
  payOrders: [{ id: 'security', po: 'TEST-PO-1', amount: 90, status: 'Held',
    v2: { instrument: 'pay-order', refunds: [{ amount: 20 }] } }],
  todos: [],
  activityLog: [
    { id: 'event', type: 'tender', entityId: 'active', action: 'updated',
      title: 'Test Roadworks', createdAt: '2026-09-30T12:00:00Z' },
    { id: 'legacy', type: 'tender', action: 'deleted',
      title: '1', createdAt: '2026-09-29T12:00:00Z' },
  ],
}

describe('dashboard with disposable records', () => {
  beforeEach(() => {
    getDocs.mockReset()
    getDocs.mockImplementation(async (name) => ({
      docs: (fixtures[name] || []).map((row) => ({ id: row.id, data: () => row })),
    }))
  })

  it('shows V2 totals, real project/activity links and actionable shortcuts', async () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    const overview = await screen.findByRole('region', { name: 'Financial overview' })
    for (const amount of [250, 70]) {
      expect(overview.textContent).toContain(formatCurrency(amount))
    }
    const financialPosition = screen.getByText('Financial position').closest('div.rounded-xl')
    expect(financialPosition.textContent).toContain(formatCurrency(800))
    expect(financialPosition.textContent).toContain(formatCurrency(120))
    expect(screen.getByText('No dated receipt entries in this period.')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'New Tender' })).toHaveAttribute('href', '/tenders?create=1')
    expect(screen.getByRole('link', { name: 'Pay Order' })).toHaveAttribute('href', '/pay-orders?create=1')
    expect(screen.getByRole('link', { name: 'Expense' })).toHaveAttribute('href', '/expenses?create=1')
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/calendar')
    expect(screen.getByRole('link', { name: 'Test Roadworks' })).toHaveAttribute('href', '/tenders/active')
    expect(screen.getByRole('link', { name: 'View project' })).toHaveAttribute('href', '/tenders/active')
    expect(screen.queryByText('Finished Project')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View all activity' })).toHaveAttribute('href', '/activity')
    expect(screen.getAllByText('updated').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tender deleted').length).toBeGreaterThan(0)
    expect(getDocs).toHaveBeenCalledTimes(5)
  })

  it('charts only dated receipt entries and lets the user change the period', async () => {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const dated = { ...fixtures, tenders: [{ ...fixtures.tenders[0], bills: [{ ...fixtures.tenders[0].bills[0], v2: { receipts: [{ date, amount: 100 }] } }] }] }
    getDocs.mockImplementation(async (name) => ({
      docs: (dated[name] || []).map((row) => ({ id: row.id, data: () => row })),
    }))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(await screen.findByRole('img', { name: 'Monthly recorded receipts chart' })).toBeInTheDocument()
    const period = screen.getByRole('combobox', { name: 'Receipt history period' })
    fireEvent.change(period, { target: { value: '12' } })
    expect(period).toHaveValue('12')
  })
})
