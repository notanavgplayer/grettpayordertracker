import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BillEditorDialog from '@/components/tenders/BillEditorDialog'
import BillActionDialog, { BillStageActions } from '@/components/tenders/BillActionDialog'
import { billDisplayStatus, billLedger } from '@/lib/billingLedger'

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
    expect(screen.getByRole('spinbutton', { name: 'Approved amount before deductions (PKR)' })).toHaveValue(2400)
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
    expect(screen.getByRole('spinbutton', { name: 'Approved amount before deductions (PKR)' })).toHaveValue(2400)
  })

  it('requires a fixed amount, accepts explicit zero, and keeps optional adjustments collapsed but preserved', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    const fixed = { ...form, v2: { ...form.v2, billing: { ...form.v2.billing, deductionRows: [{ id: 'fixed', kind: 'Other', method: 'fixed', base: 'approved', fixedAmount: '', adjustment: 12, reason: 'Certified correction' }] } } }
    render(<BillActionDialog mode="approve" bill={fixed} onClose={vi.fn()} onCommit={onCommit} />)
    expect(screen.getByText('Enter a fixed amount')).toBeInTheDocument()
    expect(screen.queryByText('Enter a valid base and rate')).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Deduction 1 adjustment' })).toHaveValue(12)
    await user.click(screen.getByRole('button', { name: 'Confirm Approval' }))
    expect(screen.getByRole('alert')).toHaveTextContent('non-negative fixed amount')
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Deduction 1 fixed amount' }), { target: { value: '0' } })
    await user.click(screen.getByRole('button', { name: 'Confirm Approval' }))
    expect(onCommit.mock.calls[0][0].v2.billing.deductionRows[0]).toMatchObject({ fixedAmount: '0', adjustment: 12, reason: 'Certified correction' })
  })

  it('shows percentage base and rejects invalid rate and deductions above gross', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<BillActionDialog mode="approve" bill={form} onClose={vi.fn()} onCommit={onCommit} />)
    expect(screen.getByText(/Calculation base: Current approved gross increment/)).toHaveTextContent('2,400')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Deduction 1 rate %' }), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Confirm Approval' }))
    expect(screen.getByRole('alert')).toHaveTextContent('enter a rate')
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Deduction 1 rate %' }), { target: { value: '101' } })
    await user.click(screen.getByRole('button', { name: 'Confirm Approval' }))
    expect(screen.getByRole('alert')).toHaveTextContent('enter a rate')
    expect(onCommit).not.toHaveBeenCalled()
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

  it('round-trips draft, submission, approval, clearance and RM release as separate UI actions', async () => {
    const user = userEvent.setup()
    let saved = JSON.parse(JSON.stringify({ ...form, status: 'Draft' }))
    const persist = (next) => { saved = JSON.parse(JSON.stringify(next)) }
    const entry = render(<BillEditorDialog open onOpenChange={vi.fn()} editing={false} form={saved} setField={() => vi.fn()} typeOptions={['Running Bill']} isAdmin onSave={(status) => persist({ ...saved, status })} />)
    await user.click(screen.getByRole('button', { name: 'Save Draft' }))
    expect(saved.status).toBe('Draft')
    entry.unmount()

    const submitted = render(<BillEditorDialog open onOpenChange={vi.fn()} editing form={saved} setField={() => vi.fn()} typeOptions={['Running Bill']} isAdmin onSave={(status) => persist({ ...saved, status })} />)
    await user.click(screen.getByRole('button', { name: 'Submit Bill' }))
    expect(saved.status).toBe('Submitted')
    submitted.unmount()

    const approval = render(<BillActionDialog mode="approve" bill={saved} onClose={vi.fn()} onCommit={persist} />)
    await user.click(screen.getByRole('button', { name: 'Confirm Approval' }))
    expect(saved.status).toBe('Approved')
    expect(billLedger(saved).net).toBe(2208)
    approval.unmount()

    const payment = render(<BillActionDialog mode="payment" bill={saved} onClose={vi.fn()} onCommit={persist} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Payment amount' }), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2026-10-10' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Bank / account' }), { target: { value: 'Bank A' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Payment reference' }), { target: { value: 'FLOW-1' } })
    await user.click(screen.getByRole('button', { name: 'Add Payment' }))
    expect(billDisplayStatus(saved)).toBe('Pending Clearance')
    payment.unmount()

    const clearance = render(<BillActionDialog mode="payment" bill={saved} onClose={vi.fn()} onCommit={persist} />)
    await user.click(screen.getByRole('combobox', { name: 'Change clearance' }))
    await user.click(screen.getByRole('option', { name: 'Cleared' }))
    await user.click(screen.getByRole('button', { name: 'Save clearance' }))
    expect(billLedger(saved).received).toBe(500)
    expect(billDisplayStatus(saved)).toBe('Partially Paid')
    expect(saved.v2.receipts[0].history).toHaveLength(2)
    clearance.unmount()

    render(<BillActionDialog mode="release" bill={saved} onClose={vi.fn()} onCommit={persist} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Release amount' }), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Release date'), { target: { value: '2026-10-11' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Release reference' }), { target: { value: 'RM-FLOW-1' } })
    await user.click(screen.getByRole('button', { name: 'Record RM Release' }))
    const refreshed = JSON.parse(JSON.stringify(saved))
    expect(billLedger(refreshed).retentionHeld).toBe(142)
    expect(billLedger(refreshed).received).toBe(500)
    expect(billLedger(refreshed).balance).toBe(1708)
  })
})
