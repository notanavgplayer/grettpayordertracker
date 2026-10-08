import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BillEditorDialog from '@/components/tenders/BillEditorDialog'
import BillActionDialog, { BillStageActions } from '@/components/tenders/BillActionDialog'
import { billLedger } from '@/lib/billingLedger'

const form = {
  id: 'b1', no: 'B-1', type: 'Running Bill', date: '2026-10-09', amount: '2400',
  approvedAmount: '', receivedAmount: '', deductions: '', status: 'Submitted', remarks: '',
  v2: { billing: { basis: 'incremental', previousCertifiedGross: 0, contractBasis: 2400,
    deductionRows: [{ id: 'rm', kind: 'RM', method: 'percentage', base: 'approved', rate: 8, adjustment: 0 }], retentionReleases: [] }, receipts: [] },
}

describe('bill stage dialogs', () => {
  it('keeps entry limited to the bill and offers draft/submit actions', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const changes = vi.fn()
    render(<BillEditorDialog open onOpenChange={vi.fn()} editing={false} form={form} setField={(field) => (value) => changes(field, value?.target?.value ?? value)} typeOptions={['Running Bill', 'Final Bill']} isAdmin onSave={onSave} />)
    expect(screen.getByRole('dialog', { name: 'Add Bill' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Submitted gross amount' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Approved gross amount')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Payment amount')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Draft' }))
    await user.click(screen.getByRole('button', { name: 'Submit Bill' }))
    expect(onSave).toHaveBeenNthCalledWith(1, 'Draft')
    expect(onSave).toHaveBeenNthCalledWith(2, 'Submitted')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Submitted gross amount' }), { target: { value: '2500' } })
    expect(changes).toHaveBeenCalledWith('amount', '2500')
  })

  it('shows cumulative previous gross and current increment', () => {
    render(<BillEditorDialog open onOpenChange={vi.fn()} form={{ ...form, amount: '2400', v2: { ...form.v2, billing: { ...form.v2.billing, basis: 'cumulative', previousCertifiedGross: 400 } } }} setField={() => vi.fn()} typeOptions={['Running Bill']} isAdmin onSave={vi.fn()} />)
    expect(screen.getByText(/Previous certified gross:/)).toHaveTextContent('400')
    expect(screen.getByText(/Current bill increment:/)).toHaveTextContent('2,000')
  })

  it('approves with separate deductions and then offers payment and RM actions', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    const { unmount } = render(<BillActionDialog mode="approve" bill={form} onClose={vi.fn()} onCommit={onCommit} />)
    expect(screen.getByRole('spinbutton', { name: 'Approved gross amount' })).toHaveValue(2400)
    expect(screen.getByText(/Net payable/)).toHaveTextContent('2,208')
    await user.click(screen.getByRole('button', { name: 'Confirm Approval' }))
    const approved = onCommit.mock.calls[0][0]
    expect(approved.status).toBe('Approved')
    expect(billLedger(approved).retentionHeld).toBe(192)
    unmount()
    render(<BillStageActions bill={approved} isAdmin onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Add Payment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Release RM' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve Bill' })).not.toBeInTheDocument()
  })

  it('preserves entered values and shows a row-specific error for missing base', async () => {
    const user = userEvent.setup()
    const invalid = { ...form, v2: { ...form.v2, billing: { ...form.v2.billing, contractBasis: null, deductionRows: [{ ...form.v2.billing.deductionRows[0], base: 'contract' }] } } }
    render(<BillActionDialog mode="approve" bill={invalid} onClose={vi.fn()} onCommit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Confirm Approval' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Deduction 1: contract amount is missing')
    expect(screen.getByRole('spinbutton', { name: 'Approved gross amount' })).toHaveValue(2400)
  })

  it('shows payment and retention forms only for their own actions', () => {
    const approved = { ...form, status: 'Approved', approvedAmount: 2400 }
    const { unmount } = render(<BillActionDialog mode="payment" bill={approved} onClose={vi.fn()} onCommit={vi.fn()} />)
    expect(screen.getByRole('spinbutton', { name: 'Payment amount' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Release amount')).not.toBeInTheDocument()
    unmount()
    render(<BillActionDialog mode="release" bill={approved} onClose={vi.fn()} onCommit={vi.fn()} />)
    expect(screen.getByRole('spinbutton', { name: 'Release amount' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Payment amount')).not.toBeInTheDocument()
  })

  it('records a partial payment and RM release on separate saved actions', async () => {
    const user = userEvent.setup()
    const approved = { ...form, status: 'Approved', approvedAmount: 2400 }
    const paymentSave = vi.fn()
    const paymentView = render(<BillActionDialog mode="payment" bill={approved} onClose={vi.fn()} onCommit={paymentSave} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Payment amount' }), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2026-10-10' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Bank / account' }), { target: { value: 'Bank A' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Payment reference' }), { target: { value: 'PAY-1' } })
    await user.click(screen.getByRole('button', { name: 'Add Payment' }))
    const paid = paymentSave.mock.calls[0][0]
    expect(billLedger(paid).pending).toBe(500)
    expect(billLedger(paid).received).toBe(0)
    paymentView.unmount()

    const releaseSave = vi.fn()
    render(<BillActionDialog mode="release" bill={JSON.parse(JSON.stringify(paid))} onClose={vi.fn()} onCommit={releaseSave} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Release amount' }), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Release date'), { target: { value: '2026-10-11' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Release reference' }), { target: { value: 'RM-1' } })
    await user.click(screen.getByRole('button', { name: 'Record RM Release' }))
    const reread = JSON.parse(JSON.stringify(releaseSave.mock.calls[0][0]))
    expect(billLedger(reread).retentionHeld).toBe(142)
    expect(billLedger(reread).pending).toBe(500)
    expect(billLedger(reread).received).toBe(0)
  })
})
