import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  activityLog: [{ id: 'event', type: 'tender', entityId: 'active', action: 'updated',
    title: 'Test Roadworks', createdAt: '2026-09-30T12:00:00Z' }],
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
    for (const amount of [250, 800, 120, 70]) {
      expect(overview.textContent).toContain(formatCurrency(amount))
    }

    expect(screen.getByRole('link', { name: 'New Tender' })).toHaveAttribute('href', '/tenders?create=1')
    expect(screen.getByRole('link', { name: 'Pay Order' })).toHaveAttribute('href', '/pay-orders?create=1')
    expect(screen.getByRole('link', { name: 'Expense' })).toHaveAttribute('href', '/expenses?create=1')
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/calendar')
    expect(screen.getByRole('link', { name: 'Test Roadworks' })).toHaveAttribute('href', '/tenders/active')
    expect(screen.getByRole('link', { name: 'View project' })).toHaveAttribute('href', '/tenders/active')
    expect(screen.queryByText('Finished Project')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View all activity' })).toHaveAttribute('href', '/activity')
    expect(screen.getAllByText('updated').length).toBeGreaterThan(0)
    expect(getDocs).toHaveBeenCalledTimes(5)
  })
})
