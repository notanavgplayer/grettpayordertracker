import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Expenses from '@/pages/Expenses'

const addExpense = vi.fn()
const updateExpense = vi.fn()
let fixtureExpenses = []
let fixtureTenders = []
const renderExpenses = () => render(<MemoryRouter><Expenses /></MemoryRouter>)

vi.mock('@/lib/export', () => ({ exportExpensesCSV: vi.fn() }))

vi.mock('@/hooks/useFirestore', () => ({
  useCollection: (name) => ({ data: name === 'expenses' ? fixtureExpenses : fixtureTenders, loading: false, error: null }),
  useFirestoreCRUD: () => ({ add: addExpense, update: updateExpense, remove: vi.fn() }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: ({ children }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: () => null,
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
}))

describe('expense creation workflow', () => {
  beforeEach(() => {
    addExpense.mockReset()
    addExpense.mockResolvedValue('expense-1')
    updateExpense.mockReset()
    updateExpense.mockResolvedValue(undefined)
    fixtureExpenses = []
    fixtureTenders = []
  })

  it('focuses invalid fields and preserves an explicit zero amount', async () => {
    const user = userEvent.setup()
    renderExpenses()

    await user.click(screen.getAllByRole('button', { name: 'Add Expense' })[0])
    const dialog = screen.getByRole('dialog', { name: 'New Expense' })
    const save = within(dialog).getByRole('button', { name: 'Add Expense' })
    const description = within(dialog).getByRole('textbox', { name: /Description/ })
    const amount = within(dialog).getByRole('spinbutton', { name: /Amount \(PKR\)/ })

    await user.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent('Description is required')
    expect(description).toHaveFocus()

    await user.type(description, 'Permit fee')
    await user.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent('Amount must be a non-negative number')
    expect(amount).toHaveFocus()

    await user.type(amount, '0')
    await user.click(save)

    expect(addExpense).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Permit fee',
      amount: 0,
    }))
  })

  it('does not submit a negative amount', async () => {
    const user = userEvent.setup()
    renderExpenses()

    await user.click(screen.getAllByRole('button', { name: 'Add Expense' })[0])
    const dialog = screen.getByRole('dialog', { name: 'New Expense' })
    await user.type(within(dialog).getByRole('textbox', { name: /Description/ }), 'Transport')
    const amount = within(dialog).getByRole('spinbutton', { name: /Amount \(PKR\)/ })
    await user.type(amount, '-1')
    await user.click(within(dialog).getByRole('button', { name: 'Add Expense' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Amount must be a non-negative number')
    expect(addExpense).not.toHaveBeenCalled()
  })

  it('saves a partial supplier payment as a dated event on synthetic expense data', async () => {
    const user = userEvent.setup()
    renderExpenses()
    await user.click(screen.getAllByRole('button', { name: 'Add Expense' })[0])
    const dialog = screen.getByRole('dialog', { name: 'New Expense' })
    await user.type(within(dialog).getByRole('textbox', { name: /Description/ }), 'Sample supplier invoice')
    await user.type(within(dialog).getByRole('spinbutton', { name: /Amount \(PKR\)/ }), '300')
    await user.type(within(dialog).getByRole('textbox', { name: 'Supplier / payee' }), 'Sample supplier')
    await user.click(within(dialog).getByRole('button', { name: 'Record a payment' }))
    fireEvent.change(document.getElementById('payments-date'), { target: { value: '2026-09-27' } })
    await user.type(document.getElementById('payments-amount'), '120')
    await user.type(document.getElementById('payments-account'), 'Test bank')
    await user.type(document.getElementById('payments-reference'), 'TEST-PAY-1')
    await user.click(within(dialog).getByRole('button', { name: 'Add Payment' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add Expense' }))

    await waitFor(() => expect(addExpense).toHaveBeenCalledOnce())
    expect(addExpense).toHaveBeenCalledWith(expect.objectContaining({
      amount: 300,
      v2: expect.objectContaining({
        kind: 'cost',
        payee: 'Sample supplier',
        payments: [expect.objectContaining({ amount: 120, date: '2026-09-27', reference: 'TEST-PAY-1' })],
      }),
    }))
  })

  it('preserves populated edit fields and partial-payment history when changing scope', async () => {
    fixtureTenders = [{ id: 'project-1', name: 'Disposable project' }]
    fixtureExpenses = [{
      id: 'expense-1', description: 'Disposable invoice', category: 'Other', amount: 300,
      date: '2026-09-27', tenderRef: 'project-1', note: 'Keep this note',
      v2: { kind: 'cost', payee: 'Test vendor', invoice: 'TEST-INV', receiptUrl: 'https://example.test/receipt', payments: [{ id: 'payment-1', date: '2026-09-28', amount: 120, account: 'Test bank', reference: 'TEST-PAY-1', method: 'Transfer' }] },
    }]
    const user = userEvent.setup()
    renderExpenses()
    await user.click(screen.getAllByRole('button', { name: 'View / Edit' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit Expense' })
    expect(within(dialog).getByDisplayValue('Test vendor')).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue('TEST-INV')).toBeInTheDocument()
    expect(within(dialog).getByText(/TEST-PAY-1/)).toBeInTheDocument()
    expect(within(dialog).getByText(/180/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('combobox', { name: 'Type' }))
    await user.click(screen.getByRole('option', { name: 'Advance' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateExpense).toHaveBeenCalledOnce())
    expect(updateExpense).toHaveBeenCalledWith('expense-1', expect.objectContaining({
      tenderRef: 'project-1', note: 'Keep this note',
      v2: expect.objectContaining({ kind: 'advance', payee: 'Test vendor', invoice: 'TEST-INV', payments: [expect.objectContaining({ reference: 'TEST-PAY-1', amount: 120 })] }),
    }))
  })

  it('keeps entered data after a failed save and confirms discarding dirty form', async () => {
    addExpense.mockRejectedValueOnce(new Error('Network unavailable'))
    const user = userEvent.setup()
    renderExpenses()
    await user.click(screen.getAllByRole('button', { name: 'Add Expense' })[0])
    const dialog = screen.getByRole('dialog', { name: 'New Expense' })
    await user.type(within(dialog).getByRole('textbox', { name: /Description/ }), 'Disposable cost')
    await user.type(within(dialog).getByRole('spinbutton', { name: /Amount \(PKR\)/ }), '50')
    await user.click(within(dialog).getByRole('button', { name: 'Add Expense' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Network unavailable')
    expect(within(dialog).getByDisplayValue('Disposable cost')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(dialog).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('dialog', { name: 'New Expense' })).not.toBeInTheDocument()
  })

  it('keeps unknown legacy payment history unknown when editing details', async () => {
    fixtureExpenses = [{ id: 'legacy-1', description: 'Legacy disposable cost', category: 'Other', amount: 200, date: '2026-09-20', note: '', v2: { kind: 'cost', payee: 'Vendor' } }]
    const user = userEvent.setup()
    renderExpenses()
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: 'View / Edit' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit Expense' })
    expect(within(dialog).getByText(/Legacy payment history is unknown/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateExpense).toHaveBeenCalledOnce())
    expect(updateExpense.mock.calls[0][1].v2).not.toHaveProperty('payments')
  })
})
