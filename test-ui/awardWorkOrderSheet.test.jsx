import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AwardWorkOrderSheet from '@/components/tenders/AwardWorkOrderSheet'
import { getInvalidAwardField } from '@/lib/awardValidation'

const form = {
  awardStatus: 'Not Awarded', awardDate: '', workOrderNumber: '', workOrderDate: '',
  contractValue: '', departmentReference: '', startDate: '', completionPeriod: '',
  expectedCompletionDate: '', actualCompletionDate: '', extensionGranted: 'No',
  extensionDays: '', extensionRemarks: '', performanceSecurityAmount: '',
  performanceSecurityType: '', performanceSecurityExpiryDate: '', retentionPercentage: '',
  retentionAmount: '', mobilizationAdvance: '', siteHandoverDate: '', engineerContact: '',
  contractorRepresentative: '', executionStatus: '', remarks: '',
}

function renderSheet(overrides = {}) {
  const changes = vi.fn()
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    form,
    setField: (field) => (event) => changes(field, event?.target?.value ?? event),
    onSave: vi.fn(),
    isAdmin: true,
    statuses: ['Not Awarded', 'Awarded'],
    ...overrides,
  }
  render(<AwardWorkOrderSheet {...props} />)
  return { props, changes }
}

describe('AwardWorkOrderSheet', () => {
  it('labels fields, constrains financial values, and forwards actions', async () => {
    const user = userEvent.setup()
    const { props, changes } = renderSheet()

    expect(screen.getByRole('dialog', { name: 'Award / Work Order' })).toBeInTheDocument()
    expect(screen.getByLabelText('Award status')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Approved contract amount' })).toHaveAttribute('min', '0')
    expect(screen.getByRole('spinbutton', { name: 'Completion period (days)' })).toHaveAttribute('step', '1')
    expect(screen.getByRole('spinbutton', { name: 'Retention percentage' })).toHaveAttribute('step', '0.01')

    await user.type(screen.getByRole('textbox', { name: 'Work order number' }), 'WO-12')
    expect(changes).toHaveBeenCalledWith('workOrderNumber', 'W')

    await user.click(screen.getByRole('button', { name: 'Save Award Details' }))
    expect(props.onSave).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('prevents a non-admin from changing or saving award details', () => {
    renderSheet({ isAdmin: false })

    expect(screen.getByLabelText('Award status')).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Work order number' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save Award Details' })).toBeDisabled()
  })

  it('rejects invalid financial values and accepts explicit zero', () => {
    expect(getInvalidAwardField({ ...form, contractValue: '-1' })?.key).toBe('contractValue')
    expect(getInvalidAwardField({ ...form, completionPeriod: '2.5' })?.message).toMatch(/whole number/)
    expect(getInvalidAwardField({ ...form, retentionPercentage: '101' })?.key).toBe('retentionPercentage')
    expect(getInvalidAwardField({ ...form, contractValue: '0', retentionPercentage: '0' })).toBeNull()
  })
})
