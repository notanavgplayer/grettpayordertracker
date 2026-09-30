import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Expenses from '@/pages/Expenses'

const addExpense = vi.fn()

vi.mock('@/hooks/useFirestore', () => ({
  useCollection: () => ({ data: [], loading: false, error: null }),
  useFirestoreCRUD: () => ({ add: addExpense, update: vi.fn(), remove: vi.fn() }),
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
  })

  it('focuses invalid fields and preserves an explicit zero amount', async () => {
    const user = userEvent.setup()
    render(<Expenses />)

    await user.click(screen.getAllByRole('button', { name: 'Add Expense' })[0])
    const dialog = screen.getByRole('dialog', { name: 'New Expense' })
    const save = within(dialog).getByRole('button', { name: 'Add Expense' })
    const description = within(dialog).getByRole('textbox', { name: /Description/ })
    const amount = within(dialog).getByRole('spinbutton', { name: 'Amount (PKR)' })

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
    render(<Expenses />)

    await user.click(screen.getAllByRole('button', { name: 'Add Expense' })[0])
    const dialog = screen.getByRole('dialog', { name: 'New Expense' })
    await user.type(within(dialog).getByRole('textbox', { name: /Description/ }), 'Transport')
    const amount = within(dialog).getByRole('spinbutton', { name: 'Amount (PKR)' })
    await user.type(amount, '-1')
    await user.click(within(dialog).getByRole('button', { name: 'Add Expense' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Amount must be a non-negative number')
    expect(addExpense).not.toHaveBeenCalled()
  })

  it('saves a partial supplier payment as a dated event on synthetic expense data', async () => {
    const user = userEvent.setup()
    render(<Expenses />)
    await user.click(screen.getAllByRole('button', { name: 'Add Expense' })[0])
    const dialog = screen.getByRole('dialog', { name: 'New Expense' })
    await user.type(within(dialog).getByRole('textbox', { name: /Description/ }), 'Sample supplier invoice')
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Amount (PKR)' }), '300')
    await user.type(within(dialog).getByRole('textbox', { name: 'Supplier / payee' }), 'Sample supplier')
    fireEvent.change(document.getElementById('payments-date'), { target: { value: '2026-09-27' } })
    await user.type(document.getElementById('payments-amount'), '120')
    await user.type(document.getElementById('payments-account'), 'Test bank')
    await user.type(document.getElementById('payments-reference'), 'TEST-PAY-1')
    await user.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
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
})
