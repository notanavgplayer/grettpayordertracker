import { projectFinancials, projectId, securityAmounts } from './financials.js'

const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)

// Pure dry run over a Settings export. It never changes the input or writes to Firebase.
export function reviewV2Backup(backup = {}) {
  const tenders = backup.tenders || []
  const payOrders = backup.payOrders || []
  const expenses = backup.expenses || []
  const ids = new Set(tenders.map((row) => row.id))
  const review = []
  const patches = []
  for (const tender of tenders) {
    if (tender.status === 'Completed' && !tender.completionDate) review.push({ collection: 'tenders', id: tender.id, issue: 'Completion date missing', action: 'Check completion certificate' })
    if (tender.status === 'Completed' && tender.awardWorkOrder?.awardStatus !== 'Completed') {
      if (!tender.completionDate) continue
      patches.push({ collection: 'tenders', id: tender.id,
        forward: { awardWorkOrder: { ...tender.awardWorkOrder, awardStatus: 'Completed', actualCompletionDate: tender.completionDate } },
        inverse: { awardWorkOrder: tender.awardWorkOrder ?? null } })
    }
    if (tender.linkedPO && !payOrders.some((po) => po.tenderRef === tender.id && po.po === tender.linkedPO)) review.push({ collection: 'tenders', id: tender.id, issue: `PO number ${tender.linkedPO} has no canonical matching link`, action: 'Check instrument and tender ID' })
  }
  for (const po of payOrders) {
    if (po.tenderRef && !ids.has(po.tenderRef)) review.push({ collection: 'payOrders', id: po.id, issue: 'Missing tender target', action: 'Confirm standalone or relink' })
    const amounts = securityAmounts(po)
    if (amounts.refunded > (amounts.funded ?? 0)) review.push({ collection: 'payOrders', id: po.id, issue: 'Refunds exceed funded cash', action: 'Check bank receipts' })
    if (po.status === 'Held' && !po.v2?.followUpDate) review.push({ collection: 'payOrders', id: po.id, issue: 'Held without follow-up', action: 'Set eligibility and follow-up dates' })
  }
  for (const expense of expenses) {
    if (projectId(expense) && !ids.has(projectId(expense))) review.push({ collection: 'expenses', id: expense.id, issue: 'Missing project target', action: 'Relink or classify as firm cost' })
    if (!projectId(expense)) review.push({ collection: 'expenses', id: expense.id, issue: 'Unassigned entry', action: 'Classify project, firm, or owner transaction' })
  }
  const projects = tenders.map((tender) => ({ id: tender.id, name: tender.name, ...projectFinancials(tender, expenses) }))
  return { format: 'grett-v2-dry-run', counts: { tenders: tenders.length, payOrders: payOrders.length, expenses: expenses.length },
    sourceTotals: { tenderValue: sum(tenders, 'value'), payOrderFaceValue: sum(payOrders, 'amount'), expenseAmount: sum(expenses, 'amount') },
    projects, review, patches, note: 'No patches were applied. Forward and inverse proposals require review before any separate migration.' }
}

export function applyV2Patches(backup, report, direction = 'forward') {
  if (!['forward', 'inverse'].includes(direction) || report.format !== 'grett-v2-dry-run') throw new Error('Invalid migration report or direction')
  const result = structuredClone(backup)
  const before = reviewV2Backup(backup)
  if (JSON.stringify(before.counts) !== JSON.stringify(report.counts) || JSON.stringify(before.sourceTotals) !== JSON.stringify(report.sourceTotals)) throw new Error('Migration report does not match backup counts or source totals')
  for (const proposal of report.patches) {
    const row = result[proposal.collection]?.find((entry) => entry.id === proposal.id)
    if (!row) throw new Error(`Missing ${proposal.collection}/${proposal.id}`)
    const expected = proposal[direction === 'forward' ? 'inverse' : 'forward']
    if (!expected || !proposal[direction] || Object.entries(expected).some(([key, value]) => JSON.stringify(row[key] ?? null) !== JSON.stringify(value))) throw new Error(`Stale migration proposal for ${proposal.collection}/${proposal.id}`)
    Object.assign(row, structuredClone(proposal[direction]))
  }
  const after = reviewV2Backup(result)
  if (JSON.stringify(before.counts) !== JSON.stringify(after.counts) || JSON.stringify(before.sourceTotals) !== JSON.stringify(after.sourceTotals)) throw new Error('Migration changed record counts or source financial totals')
  return result
}
