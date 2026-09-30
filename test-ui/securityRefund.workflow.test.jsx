import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SecurityFields from '@/components/shared/SecurityFields'

function RefundHarness() {
  const [form, setForm] = useState({ amount: 61000, status: 'Held', v2: { instrument: 'pay-order', refunds: [] } })
  const setV2 = (key, value) => setForm((current) => ({ ...current, v2: { ...current.v2, [key]: value } }))
  return <SecurityFields form={form} setV2={setV2} />
}

describe('partial refund workflow with disposable state', () => {
  it('reduces held cash by the recorded receipt and blocks an excess refund', async () => {
    const user = userEvent.setup()
    render(<RefundHarness />)

    fireEvent.change(document.getElementById('refund-receipts-date'), { target: { value: '2026-09-27' } })
    await user.type(document.getElementById('refund-receipts-amount'), '10000')
    await user.type(document.getElementById('refund-receipts-account'), 'Test bank')
    await user.type(document.getElementById('refund-receipts-reference'), 'TEST-REFUND-1')
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(screen.getByText(/Remaining cash held: Rs 51,000/)).toBeInTheDocument()
    expect(screen.getByText(/TEST-REFUND-1/)).toBeInTheDocument()

    fireEvent.change(document.getElementById('refund-receipts-date'), { target: { value: '2026-09-28' } })
    await user.type(document.getElementById('refund-receipts-amount'), '52000')
    await user.type(document.getElementById('refund-receipts-account'), 'Test bank')
    await user.type(document.getElementById('refund-receipts-reference'), 'TEST-REFUND-2')
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Transactions exceed the available amount')
    expect(screen.queryByText(/TEST-REFUND-2/)).not.toBeInTheDocument()
    expect(screen.getByText(/Remaining cash held: Rs 51,000/)).toBeInTheDocument()
  })
})
