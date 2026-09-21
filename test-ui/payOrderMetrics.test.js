import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAtRiskPayOrders, isPendingBidResult } from '@/lib/payOrderMetrics'

afterEach(() => vi.useRealTimers())

describe('pay order risk metrics', () => {
  it('only counts linked tenders due within seven days with pending results', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 21, 12))
    const tenders = [
      { id: 'due-soon', submissionDate: '2026-09-25' },
      { id: 'later', submissionDate: '2026-10-10' },
      { id: 'past', submissionDate: '2026-09-20' },
    ]
    const payOrders = [
      { id: 'risk', tenderRef: 'due-soon', bidResult: 'Awaiting' },
      { id: 'won', tenderRef: 'due-soon', bidResult: 'Won' },
      { id: 'later', tenderRef: 'later', bidResult: 'N/A' },
      { id: 'past', tenderRef: 'past', bidResult: '' },
      { id: 'unlinked', tenderRef: '', bidResult: 'Awaiting' },
    ]

    expect(getAtRiskPayOrders(payOrders, tenders).map((item) => item.id)).toEqual(['risk'])
  })

  it('normalizes legacy pending-result values', () => {
    expect(['', 'N/A', 'Awaiting', 'Pending'].every(isPendingBidResult)).toBe(true)
    expect(isPendingBidResult('Won')).toBe(false)
  })
})
