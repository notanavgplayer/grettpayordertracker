import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TenderPayOrderSheet from '@/components/tenders/TenderPayOrderSheet'

const form = {
  po: '',
  bank: 'Bank A',
  amount: '',
  submitted: '',
  purpose: 'Bid Security',
  status: 'Pending',
  notes: '',
}

describe('TenderPayOrderSheet', () => {
  it('keeps fields labelled and forwards changes, save, and cancel actions', async () => {
    const user = userEvent.setup()
    const changes = vi.fn()
    const setField = (field) => (event) => changes(field, event?.target?.value ?? event)
    const onSave = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <TenderPayOrderSheet
        open
        onOpenChange={onOpenChange}
        editing={false}
        form={form}
        setField={setField}
        banks={['Bank A']}
        purposes={['Bid Security']}
        statuses={['Pending']}
        onSave={onSave}
        saving={false}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'New Pay Order' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /Amount \(PKR\)/ })).toHaveAttribute('min', '0')
    expect(screen.getByLabelText('Bank')).toBeInTheDocument()
    expect(screen.getByLabelText('Purpose')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /PO Number/ }), 'PO-10')
    expect(changes).toHaveBeenCalledWith('po', 'P')

    await user.click(screen.getByRole('button', { name: 'Add Pay Order' }))
    expect(onSave).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
