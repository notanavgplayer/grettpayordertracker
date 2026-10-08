import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BillEditorDialog from '@/components/tenders/BillEditorDialog'
import { getInvalidBillAmount } from '@/lib/billValidation'

const form = {
  no: '', type: 'Running Bill', date: '', amount: '', approvedAmount: '',
  receivedAmount: '', deductions: '', status: 'Draft', remarks: '',
}

function renderDialog(overrides = {}) {
  const changes = vi.fn()
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    editing: false,
    form,
    setField: (field) => (event) => changes(field, event?.target?.value ?? event),
    typeOptions: ['Running Bill', 'Invoice'],
    statusOptions: ['Draft', 'Paid'],
    isAdmin: true,
    onSave: vi.fn(),
    ...overrides,
  }
  render(<BillEditorDialog {...props} />)
  return { props, changes }
}

describe('BillEditorDialog', () => {
  it('labels fields, constrains amounts, and forwards save and cancel actions', async () => {
    const user = userEvent.setup()
    const { props, changes } = renderDialog()

    expect(screen.getByRole('dialog', { name: 'Add Bill / RA Bill' })).toBeInTheDocument()
    expect(screen.getByLabelText('Type')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Submitted Gross Amount' })).toHaveAttribute('min', '0')
    expect(screen.getByRole('spinbutton', { name: 'Submitted Gross Amount' })).toHaveAttribute('step', '0.01')

    await user.type(screen.getByRole('textbox', { name: 'Bill No.' }), 'B-7')
    expect(changes).toHaveBeenCalledWith('no', 'B')
    await user.click(screen.getByRole('button', { name: 'Add Bill' }))
    expect(props.onSave).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('disables editing and saving for non-admin users', () => {
    renderDialog({ isAdmin: false })
    expect(screen.getByRole('textbox', { name: 'Bill No.' })).toBeDisabled()
    expect(screen.getByLabelText('Type')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Bill' })).toBeDisabled()
  })

  it('identifies negative and invalid amounts while allowing blanks and zero', () => {
    expect(getInvalidBillAmount({ ...form, amount: '-1' })).toEqual({ key: 'amount', label: 'Submitted amount', id: 'bill-amount' })
    expect(getInvalidBillAmount({ ...form, approvedAmount: 'not-a-number' })?.key).toBe('approvedAmount')
    expect(getInvalidBillAmount({ ...form, amount: '0' })).toBeNull()
    expect(getInvalidBillAmount(form)).toBeNull()
  })

  it('renders the RA bill variant without the ordinary bill type field', () => {
    renderDialog({ variant: 'ra-bill' })

    expect(screen.getByRole('dialog', { name: 'Add RA Bill' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'RA Bill No.' })).toBeInTheDocument()
    expect(screen.getByLabelText('RA Bill Date')).toBeInTheDocument()
    expect(screen.queryByLabelText('Type')).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Submitted Gross Amount' })).toHaveAttribute('id', 'ra-bill-amount')
    expect(getInvalidBillAmount({ ...form, deductions: '-2' }, 'ra-bill')).toEqual({
      key: 'deductions', label: 'Deductions', id: 'ra-bill-deductions',
    })
  })

  it('limits receipt entries to approved value after deductions', async () => {
    const user = userEvent.setup()
    const { changes } = renderDialog({ form: { ...form, approvedAmount: '450', v2: { deductions: { retention: 30 }, receipts: [] } } })
    fireEvent.change(document.getElementById('bill-receipts-date'), { target: { value: '2026-09-27' } })
    await user.type(document.getElementById('bill-receipts-amount'), '430')
    await user.type(document.getElementById('bill-receipts-account'), 'Bank')
    await user.type(document.getElementById('bill-receipts-reference'), 'R-1')
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(screen.getByRole('alert')).toHaveTextContent('exceed')
    expect(changes).not.toHaveBeenCalledWith('v2', expect.objectContaining({ receipts: expect.any(Array) }))
  })
})
