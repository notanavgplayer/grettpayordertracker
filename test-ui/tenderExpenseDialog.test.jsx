import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TenderExpenseDialog from '@/components/tenders/TenderExpenseDialog'

const baseForm = {
  description: '',
  category: 'Other',
  calculationMethod: 'manual',
  amountBasis: 'manual',
  percentage: '',
  amount: '',
  date: '',
  note: '',
}

describe('TenderExpenseDialog', () => {
  it('exposes labelled controls and forwards edits and save actions', async () => {
    const user = userEvent.setup()
    const changes = vi.fn()
    const setField = (field) => (event) => changes(field, event?.target?.value ?? event)
    const onSave = vi.fn()

    render(
      <TenderExpenseDialog
        open
        onOpenChange={vi.fn()}
        editing={false}
        form={baseForm}
        setField={setField}
        categories={['Other', 'Transport']}
        preview={{ baseAmount: '—', percentage: '—', calculatedAmount: 'PKR 0' }}
        onSave={onSave}
        saving={false}
      />,
    )

    const description = screen.getByRole('textbox', { name: /Description/ })
    expect(screen.getByRole('spinbutton', { name: 'Amount (PKR)' })).toBeEnabled()
    expect(screen.getByRole('spinbutton', { name: 'Percentage' })).toBeDisabled()

    await user.type(description, 'Fuel')
    expect(changes).toHaveBeenCalledWith('description', 'F')

    await user.click(screen.getByRole('button', { name: 'Add Expense' }))
    expect(onSave).toHaveBeenCalledOnce()
  })
})
