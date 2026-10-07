import { billAmounts, expenseAmounts, projectFinancials, projectId, securityAmounts } from './financials.js'
import { getSecurityFollowUps } from './payOrderMetrics.js'

export const reportDate = (value) => {
  if (!value) return ''
  if (typeof value?.toDate === 'function') value = value.toDate()
  else if (typeof value?.seconds === 'number') value = new Date(value.seconds * 1000)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export const inPeriod = (date, from, to) => {
  const key = reportDate(date)
  return Boolean(key && (!from || key >= from) && (!to || key <= to))
}

const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)
const nameOf = (tender) => tender.name || tender.title || tender.projectName || tender.tenderName || 'Untitled project'

export function buildProjectView(tenders, expenses, filters) {
  const rows = tenders
    .filter((tender) => filters.project === 'all' || tender.id === filters.project)
    .filter((tender) => filters.status === 'all' || (tender.status || 'Unknown') === filters.status)
    .map((tender) => {
      const metrics = projectFinancials(tender, expenses)
      const awarded = metrics.contract !== null || ['Awarded', 'Won', 'In Progress', 'Completed'].includes(tender.status)
      const bills = [...(tender.bills || []), ...(tender.raBills || [])]
      const receiptEvents = bills.flatMap((bill) => bill.v2?.receipts || []).filter((event) => !event.status || event.status === 'Cleared')
      const undatedReceipts = receiptEvents.filter((receipt) => !reportDate(receipt.date)).length
      const legacyReceipts = bills.filter((bill) => !Array.isArray(bill.v2?.receipts) && billAmounts(bill).received > 0).length
      return {
        id: tender.id, name: nameOf(tender), status: tender.status || 'Unknown',
        contract: awarded ? metrics.contract : null,
        incurred: metrics.incurred, received: metrics.received,
        approvedGross: metrics.approvedGross, taxesOther: metrics.taxesOther,
        retentionHeld: metrics.retentionHeld, netPayable: metrics.netPayable, pendingReceipts: metrics.pendingReceipts,
        receivables: metrics.outstanding, unbilled: awarded ? metrics.unbilled : null,
        forecast: awarded ? metrics.finalCost : null,
        missingContract: awarded && metrics.contract === null,
        unknownBillBasis: awarded && metrics.unknownBillBasis,
        unknownReceiptCount: metrics.unknownReceiptCount,
        unknownRetentionCount: metrics.unknownRetentionCount,
        incompletePayments: metrics.unknownPaymentCount,
        periodReceipts: sum(receiptEvents.filter((event) => inPeriod(event.date, filters.from, filters.to)), 'amount'),
        undatedReceipts, legacyReceipts,
      }
    })
  return {
    rows,
    totals: {
      contract: sum(rows, 'contract'), incurred: sum(rows, 'incurred'), received: sum(rows, 'received'),
      approvedGross: sum(rows, 'approvedGross'), taxesOther: sum(rows, 'taxesOther'), retentionHeld: sum(rows, 'retentionHeld'), netPayable: sum(rows, 'netPayable'), pendingReceipts: sum(rows, 'pendingReceipts'),
      receivables: sum(rows, 'receivables'), unbilled: sum(rows, 'unbilled'),
      periodReceipts: sum(rows, 'periodReceipts'),
    },
    coverage: {
      unawarded: rows.filter((row) => row.contract === null && !row.missingContract).length,
      missingContract: rows.filter((row) => row.missingContract).length,
      unknownBillBasis: rows.filter((row) => row.unknownBillBasis && !row.missingContract).length,
      unknownReceipts: sum(rows, 'unknownReceiptCount'),
      unknownRetention: sum(rows, 'unknownRetentionCount'),
      forecastIncomplete: rows.filter((row) => row.contract !== null && row.forecast === null).length,
      incompletePayments: sum(rows, 'incompletePayments'),
      undated: sum(rows, 'undatedReceipts'), legacy: sum(rows, 'legacyReceipts'),
    },
  }
}

export function buildExpenseView(tenders, expenses, filters) {
  const byId = new Map(tenders.map((tender) => [tender.id, tender]))
  const rows = expenses
    .filter((expense) => filters.project === 'all' || (filters.project === 'unassigned' ? !projectId(expense) : projectId(expense) === filters.project))
    .filter((expense) => filters.status === 'all' || (byId.get(projectId(expense))?.status || 'Unassigned') === filters.status)
    .map((expense) => {
      const amounts = expenseAmounts(expense)
      const linkedId = projectId(expense)
      const payments = expense.v2?.payments || []
      return {
        id: expense.id, projectId: linkedId, project: byId.get(linkedId) ? nameOf(byId.get(linkedId)) : linkedId ? 'Project link missing' : 'Unassigned',
        description: expense.description || expense.category || 'Expense', date: reportDate(expense.date),
        scope: amounts.kind, incurred: amounts.incurred,
        paid: amounts.paid, payable: amounts.payable,
        periodPaid: ['cost', 'overhead'].includes(amounts.kind) ? sum(payments.filter((event) => inPeriod(event.date, filters.from, filters.to)), 'amount') : null,
        undated: payments.filter((event) => !reportDate(event.date)).length,
      }
    })
  return {
    rows,
    totals: {
      incurred: sum(rows, 'incurred'), paid: sum(rows.filter((row) => ['cost', 'overhead'].includes(row.scope)), 'paid'),
      payable: sum(rows, 'payable'), periodPaid: sum(rows, 'periodPaid'),
    },
    coverage: { unknown: rows.filter((row) => row.payable === null && ['cost', 'overhead'].includes(row.scope)).length,
      undated: sum(rows, 'undated'), missingLinks: rows.filter((row) => row.project === 'Project link missing').length },
  }
}

export function buildSecurityView(tenders, payOrders, filters) {
  const byId = new Map(tenders.map((tender) => [tender.id, tender]))
  const reviewIds = new Set(getSecurityFollowUps(payOrders, tenders).map((po) => po.id))
  const rows = payOrders
    .filter((po) => filters.project === 'all' || po.tenderRef === filters.project)
    .filter((po) => filters.status === 'all' || (po.status || 'Unknown') === filters.status)
    .map((po) => {
      const amounts = securityAmounts(po)
      const refunds = po.v2?.refunds || []
      const ended = ['Encashed', 'Forfeited'].includes(po.status)
      return {
        id: po.id, po: po.po || po.number || 'Unnumbered', projectId: po.tenderRef || '',
        project: byId.get(po.tenderRef) ? nameOf(byId.get(po.tenderRef)) : po.tenderRef ? 'Project link missing' : 'Standalone',
        status: po.status || 'Unknown', face: Number(po.amount) || 0,
        remaining: ended ? null : amounts.remaining, exposure: amounts.exposure,
        refunded: amounts.refunded, periodRefunds: sum(refunds.filter((event) => inPeriod(event.date, filters.from, filters.to)), 'amount'),
        undated: refunds.filter((event) => !reportDate(event.date)).length,
        review: reviewIds.has(po.id), reconciliation: ended,
      }
    })
  return {
    rows,
    totals: { face: sum(rows, 'face'), remaining: sum(rows, 'remaining'), exposure: sum(rows, 'exposure'),
      refunded: sum(rows, 'refunded'), periodRefunds: sum(rows, 'periodRefunds') },
    coverage: { unknown: rows.filter((row) => row.remaining === null && !row.reconciliation).length,
      reconciliation: rows.filter((row) => row.reconciliation).length,
      undated: sum(rows, 'undated'), reviews: rows.filter((row) => row.review).length,
      missingLinks: rows.filter((row) => row.project === 'Project link missing').length },
  }
}
