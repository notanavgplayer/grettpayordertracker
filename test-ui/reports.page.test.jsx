import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reports from '@/pages/Reports'

const fixture = vi.hoisted(() => ({
  tenders: [{ id: 'long', name: 'Extremely long synthetic project name for mobile wrapping and export coverage', status: 'In Progress', awardWorkOrder: { contractValue: 10000000 }, bills: [{ amount: 500, approvedAmount: 400, v2: { receipts: [{ amount: 100, date: '2026-09-20' }] } }] }],
  expenses: [{ id: 'expense', tenderRef: 'long', description: 'Disposable material expense', amount: 200, v2: { kind: 'cost', payments: [{ amount: 50, date: '2026-09-20' }] } }],
  payOrders: [{ id: 'po', tenderRef: 'long', po: 'TEST-PO', status: 'Held', amount: 100, v2: { instrument: 'pay-order', fundedCash: 100, refunds: [{ amount: 20, date: '2026-09-20' }] } }],
}))
vi.mock('@/hooks/useFirestore', () => ({ useCollection: (name) => ({ data: fixture[name] || [], loading: false, error: null }) }))
vi.mock('@/pages/ReportCatalog', () => ({ default: () => <div>Existing report catalog</div> }))

describe('Reports with disposable fixtures', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows canonical lifetime cards, record links, and preserved catalog access', () => {
    render(<MemoryRouter><Reports /></MemoryRouter>)
    expect(screen.getByText('Project Finances', { selector: 'h1' })).toBeInTheDocument()
    expect(screen.getAllByText(/Extremely long synthetic project name/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /Extremely long synthetic project name/ })[0]).toHaveAttribute('href', '/tenders/long')
    expect(screen.getAllByText(/10,000,000/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Columns'))
    fireEvent.click(screen.getByLabelText('Forecast final cost'))
    expect(screen.queryByRole('columnheader', { name: /Forecast final cost/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expense Payments' }))
    expect(screen.getByText('Expense Payments', { selector: 'h1' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Disposable material expense' })[0]).toHaveAttribute('href', '/expenses?search=Disposable%20material%20expense')
    fireEvent.click(screen.getByRole('button', { name: 'Securities' }))
    expect(screen.getAllByRole('link', { name: 'TEST-PO' })[0]).toHaveAttribute('href', '/pay-orders?search=TEST-PO')
    expect(screen.getByRole('link', { name: /Open existing review queue/ })).toHaveAttribute('href', '/pay-orders?review=1')
    fireEvent.click(screen.getByRole('button', { name: 'Other Reports' }))
    expect(screen.getByText('Existing report catalog')).toBeInTheDocument()
  })

  it('exports the displayed scope with definitions and all rows', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const make = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    render(<MemoryRouter><Reports /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    expect(click).toHaveBeenCalledOnce()
    expect(make).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:test')
  })
})
