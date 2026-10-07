import { describe, expect, it } from 'vitest'
import { billAmounts, expenseAmounts, projectFinancials, securityAmounts } from '@/lib/financials'
import { buildExpenseView, buildProjectView, buildSecurityView } from '@/lib/reportViews'

const all = { project: 'all', status: 'all', from: '', to: '' }
const tender = {
  id: 'project-1', name: 'A very long project name used only in disposable fixtures', status: 'In Progress',
  awardWorkOrder: { contractValue: 1000 },
  bills: [{ amount: 500, approvedAmount: 400, v2: { deductions: {}, receipts: [{ amount: 100, date: '2026-09-20' }, { amount: 50, date: '' }] } }],
  raBills: [{ amount: 100, approvedAmount: 100, receivedAmount: 25, status: 'Approved', v2: { deductions: {} } }],
}
const expenses = [
  { id: 'paid', tenderRef: 'project-1', description: 'Materials', amount: 300, v2: { kind: 'cost', payments: [{ amount: 90, date: '2026-09-20' }, { amount: 10, date: '' }] } },
  { id: 'legacy', tenderRef: 'project-1', description: 'Legacy cost', amount: 200 },
  { id: 'owner', description: 'Owner contribution', amount: 80, v2: { kind: 'owner-funding', payments: [{ amount: 80, date: '2026-09-20' }] } },
]
const payOrders = [
  { id: 'cash', po: 'PO-1', tenderRef: 'project-1', status: 'Held', amount: 100, v2: { instrument: 'pay-order', fundedCash: 100, refunds: [{ amount: 20, date: '2026-09-20' }, { amount: 10, date: '' }] } },
  { id: 'guarantee', po: 'G-1', tenderRef: 'project-1', status: 'Held', amount: 250, v2: { instrument: 'guarantee', refunds: [] } },
]

describe('Reports use canonical V2 ledgers and label coverage', () => {
  it('keeps lifetime project balances independent of transaction period', () => {
    const period = { ...all, from: '2026-09-01', to: '2026-09-30' }
    const view = buildProjectView([tender], expenses, period)
    const canonical = projectFinancials(tender, expenses)
    expect(view.rows[0]).toMatchObject({ contract: canonical.contract, incurred: canonical.incurred,
      received: canonical.received, receivables: canonical.outstanding, unbilled: canonical.unbilled, forecast: null })
    expect(view.rows[0].receivables).toBe(325)
    expect(view.rows[0].unbilled).toBe(400)
    expect(view.totals.periodReceipts).toBe(100)
    expect(view.coverage).toMatchObject({ undated: 1, legacy: 1, incompletePayments: 1 })
    expect(buildProjectView([tender], expenses, { ...period, from: '2026-08-01', to: '2026-08-31' }).totals.receivables).toBe(325)
  })

  it('excludes an unverified legacy value from contract and unbilled totals while preserving bill receivables', () => {
    const legacy = { id: 'legacy', status: 'Completed', value: 1895000, quotedAmount: 2400000,
      bills: [{ amount: 1895000, status: 'Paid' }] }
    const view = buildProjectView([tender, legacy], expenses, all)
    expect(view.rows.find((row) => row.id === 'legacy')).toMatchObject({
      contract: null, unbilled: null, received: 0, receivables: 1895000, missingContract: true,
    })
    expect(view.totals.contract).toBe(1000)
    expect(view.coverage.missingContract).toBe(1)
  })

  it('keeps unknown expense payment history unknown and filters actual payment dates', () => {
    const view = buildExpenseView([tender], expenses, { ...all, from: '2026-09-01', to: '2026-09-30' })
    expect(view.rows.find((row) => row.id === 'legacy').payable).toBeNull()
    expect(view.totals).toMatchObject({ incurred: 500, paid: 100, payable: 200, periodPaid: 90 })
    expect(view.coverage).toMatchObject({ unknown: 1, undated: 1 })
    expect(view.rows.find((row) => row.id === 'owner').periodPaid).toBeNull()
    expect(buildExpenseView([tender], expenses, { ...all, project: 'unassigned' }).rows.map((row) => row.id)).toEqual(['owner'])
    expect(expenseAmounts(expenses[0]).payable).toBe(200)
  })

  it('separates face, funded cash, refunds and guarantee exposure', () => {
    const view = buildSecurityView([tender], payOrders, { ...all, from: '2026-09-01', to: '2026-09-30' })
    expect(view.totals).toMatchObject({ face: 350, remaining: 70, exposure: 250, refunded: 30, periodRefunds: 20 })
    expect(view.coverage).toMatchObject({ unknown: 1, undated: 1 })
    expect(view.rows.find((row) => row.id === 'guarantee').remaining).toBeNull()
    expect(securityAmounts(payOrders[0]).remaining).toBe(70)
    expect(billAmounts(tender.bills[0]).balance).toBe(250)
  })
})
