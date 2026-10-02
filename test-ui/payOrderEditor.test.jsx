import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PayOrderEditor from '@/components/pay-orders/PayOrderEditor'

const projects = [{ id: 'project-1', name: 'A long sample project for verifying a real linked record', nit: 'NIT-42', agency: 'Agency One' }]

function Harness({ initial = {}, initialMode = 'none', onDraft = () => {} }) {
  const [form, setForm] = useState({ po: '', amount: '', bank: '', nit: '', agency: '', tender: '', tenderRef: '', status: 'Held', bidResult: 'N/A', purpose: 'Bid Security', submitted: '', notes: '', v2: { instrument: 'pay-order', refunds: [] }, ...initial })
  const [tenderMode, setTenderMode] = useState(initialMode)
  const [tenderSearch, setTenderSearch] = useState('')
  const [newTenderFields, setNewTenderFields] = useState({ name: '', nit: '', agency: '' })
  const [extraOpen, setExtraOpen] = useState(Boolean(form.notes || form.v2.followUpDate))
  const [refundOpen, setRefundOpen] = useState(Boolean(form.v2.refunds?.length))
  const setF = (key) => (value) => setForm((previous) => ({ ...previous, [key]: value.target?.value ?? value }))
  const selectTender = (project) => { setForm((previous) => ({ ...previous, tenderRef: project.id, tender: project.name, nit: previous.nit || project.nit, agency: previous.agency || project.agency })); setTenderSearch('') }
  onDraft({ form, tenderMode, newTenderFields })
  return <PayOrderEditor form={form} setForm={setForm} setF={setF} tenderMode={tenderMode} setTenderMode={setTenderMode} tenders={projects} tenderSearch={tenderSearch} setTenderSearch={setTenderSearch} newTenderFields={newTenderFields} setNewTenderFields={setNewTenderFields} selectTender={selectTender} banks={[]} setAddBankOpen={() => {}} setNewBankName={() => {}} errors={{}} extraOpen={extraOpen} setExtraOpen={setExtraOpen} refundOpen={refundOpen} setRefundOpen={setRefundOpen} editItem={initial.id ? initial : null} />
}

describe('pay order editor with disposable records', () => {
  it('links a project, fills available NIT and agency, and preserves a manual override', async () => {
    let latest
    const user = userEvent.setup()
    render(<Harness onDraft={(draft) => { latest = draft }} />)
    await user.click(screen.getByRole('button', { name: 'Existing project' }))
    await user.type(screen.getByRole('textbox', { name: 'Search projects' }), 'sample')
    await user.click(screen.getByRole('button', { name: /A long sample project/ }))
    expect(latest.form.tenderRef).toBe('project-1')
    expect(screen.getByRole('textbox', { name: 'NIT / Reference' })).toHaveValue('NIT-42')
    expect(screen.getByRole('textbox', { name: 'Agency' })).toHaveValue('Agency One')
    await user.clear(screen.getByRole('textbox', { name: 'Agency' }))
    await user.type(screen.getByRole('textbox', { name: 'Agency' }), 'Manual agency')
    await user.click(screen.getByRole('button', { name: 'Standalone' }))
    expect(latest.form.agency).toBe('Manual agency')
    expect(latest.form.tenderRef).toBe('project-1')
  })

  it('keeps populated edit fields available and only a receipt reduces remaining cash', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ id: 'po-1', amount: 61000, notes: 'Original note', status: 'Returned', v2: { instrument: 'pay-order', refunds: [{ id: 'r1', date: '2026-10-01', amount: 10000, account: 'Test bank', reference: 'TEST-1', method: 'transfer' }], followUpDate: '2026-10-10' } }} />)
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Original note')
    expect(screen.getByText('1 recorded refund receipt')).toBeInTheDocument()
    expect(screen.getByText(/Rs 51,000/)).toBeInTheDocument()
    expect(screen.getByText('TEST-1', { exact: false })).toBeInTheDocument()
    fireEvent.change(document.getElementById('refund-receipts-date'), { target: { value: '2026-10-02' } })
    await user.type(document.getElementById('refund-receipts-amount'), '5000')
    await user.type(document.getElementById('refund-receipts-account'), 'Test bank')
    await user.type(document.getElementById('refund-receipts-reference'), 'TEST-2')
    await user.click(screen.getByRole('button', { name: 'Add Refund Receipt' }))
    expect(screen.getByText(/Rs 46,000/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove transaction TEST-2' }))
    expect(screen.getByText(/Rs 51,000/)).toBeInTheDocument()
  })

})
