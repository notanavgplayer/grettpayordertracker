import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { BID_RESULTS, EXPENSE_CATEGORIES, PO_PURPOSES, PO_STATUSES, TENDER_STATUSES, formatCurrency } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import KpiCard from '@/components/shared/KpiCard'
import LoadState from '@/components/shared/LoadState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

const TENDER_FIELDS = new Set([
  'name', 'nit', 'tenderRef', 'value', 'estimatedCost', 'quotedAmount', 'tenderFee', 'status', 'submissionDate', 'openingDate',
  'agency', 'contact', 'contactPerson', 'notes', 'source', 'linkedPO', 'linkedPayOrderId', 'tenderFeeExpenseId',
  'bidSecurity', 'documents', 'checklist', 'bills', 'raBills', 'boqItems', 'awardWorkOrder', 'siteVisits', 'v2', 'completionDate',
  'completionRemarks', 'completionSnapshot', 'completedAt', 'statusHistory', 'createdAt', 'updatedAt',
])

const LEGACY_TENDER_FIELDS = new Set([
  'displayStatus',
  'expenses',
  'milestones',
  'siteVisits',
])

const SEVERITY_META = {
  critical: {
    label: 'Critical',
    badge: 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
    icon: ShieldAlert,
  },
  warning: {
    label: 'Warning',
    badge: 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    icon: AlertTriangle,
  },
  info: {
    label: 'Info',
    badge: 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    icon: FileText,
  },
}

const GROUP_ORDER = ['Tenders', 'Pay Orders', 'Tasks', 'Documents', 'Expenses', 'Notes', 'Users / Settings']

function addIssue(issues, issue) {
  issues.push({
    id: `${issue.area}-${issue.recordId || issue.record}-${issue.description}-${issues.length}`,
    suggestedFix: 'Review record and update manually if needed.',
    href: null,
    repair: null,
    ...issue,
  })
}

function toList(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

function isMissing(value) {
  return value === undefined || value === null || value === ''
}

function isInvalidDate(value) {
  if (isMissing(value)) return false
  if (typeof value?.toDate === 'function') return Number.isNaN(value.toDate().getTime())
  return Number.isNaN(new Date(value).getTime())
}

function isInvalidAmount(value) {
  if (isMissing(value)) return false
  const number = Number(value)
  return !Number.isFinite(number) || number < 0
}

function getTimestampPatch() {
  return { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
}

function getRecordLabel(record, fallback) {
  return record.name || record.title || record.description || record.po || record.text || record.email || fallback || record.id
}

export default function DataHealth() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ tenders: [], payOrders: [], expenses: [], todos: [], notes: [], users: [] })
  const [repairing, setRepairing] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tenderSnap, payOrderSnap, expenseSnap, todoSnap, noteSnap, userSnap] = await Promise.all([
        getDocs(collection(db, 'tenders')),
        getDocs(collection(db, 'payOrders')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'todos')),
        getDocs(collection(db, 'notes')),
        getDocs(collection(db, 'users')),
      ])
      setData({
        tenders: toList(tenderSnap),
        payOrders: toList(payOrderSnap),
        expenses: toList(expenseSnap),
        todos: toList(todoSnap),
        notes: toList(noteSnap),
        users: toList(userSnap).filter((user) => user.id !== '__meta__'),
      })
    } catch (err) {
      console.error('Data health scan failed', err)
      setError(err?.code === 'permission-denied'
        ? "You don't have permission to scan this project data."
        : 'Project data could not be scanned. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const issues = useMemo(() => {
    const result = []
    const tenderIds = new Set(data.tenders.map((t) => t.id))
    const payOrderIds = new Set(data.payOrders.map((p) => p.id))
    const payOrderNumbers = new Map()

    data.payOrders.forEach((po) => {
      if (!po.po) return
      const list = payOrderNumbers.get(String(po.po)) || []
      list.push(po)
      payOrderNumbers.set(String(po.po), list)
    })

    data.tenders.forEach((tender) => {
      const href = `/tenders/${tender.id}`
      const label = getRecordLabel(tender, tender.id)
      const unknownFields = Object.keys(tender).filter((key) => (
        key !== 'id' && !TENDER_FIELDS.has(key) && !LEGACY_TENDER_FIELDS.has(key)
      ))

      if (unknownFields.length) {
        addIssue(result, {
          severity: 'info',
          area: 'Tenders',
          record: label,
          recordId: tender.id,
          description: 'Unknown fields found.',
          detail: unknownFields.join(', '),
          suggestedFix: 'Confirm whether these are legacy fields before cleanup.',
          href,
        })
      }
      if (!tender.name) addIssue(result, { severity: 'warning', area: 'Tenders', record: tender.id, recordId: tender.id, description: 'Tender name is missing.', suggestedFix: 'Add a tender name.', href })
      if (!tender.agency) addIssue(result, { severity: 'warning', area: 'Tenders', record: label, recordId: tender.id, description: 'Agency/client is missing.', suggestedFix: 'Add the responsible agency or client.', href })
      if (!tender.createdAt) addIssue(result, { severity: 'info', area: 'Tenders', record: label, recordId: tender.id, description: 'createdAt is missing.', suggestedFix: 'Add createdAt timestamp.', href, repair: { collectionName: 'tenders', id: tender.id, patch: getTimestampPatch, label: 'Add timestamps' } })
      if (!tender.updatedAt) addIssue(result, { severity: 'info', area: 'Tenders', record: label, recordId: tender.id, description: 'updatedAt is missing.', suggestedFix: 'Add updatedAt timestamp.', href, repair: { collectionName: 'tenders', id: tender.id, patch: () => ({ updatedAt: serverTimestamp() }), label: 'Add updatedAt' } })
      if (!Object.prototype.hasOwnProperty.call(tender, 'estimatedCost')) addIssue(result, { severity: 'info', area: 'Tenders', record: label, recordId: tender.id, description: 'estimatedCost field is missing.', suggestedFix: 'Add estimatedCost as blank/null for compatibility.', href, repair: { collectionName: 'tenders', id: tender.id, patch: () => ({ estimatedCost: null, updatedAt: serverTimestamp() }), label: 'Add field' } })
      if (!Object.prototype.hasOwnProperty.call(tender, 'quotedAmount')) addIssue(result, { severity: 'info', area: 'Tenders', record: label, recordId: tender.id, description: 'quotedAmount field is missing.', suggestedFix: 'Add quotedAmount as blank/null for compatibility.', href, repair: { collectionName: 'tenders', id: tender.id, patch: () => ({ quotedAmount: null, updatedAt: serverTimestamp() }), label: 'Add field' } })
      if (!TENDER_STATUSES.includes(tender.status)) addIssue(result, { severity: 'critical', area: 'Tenders', record: label, recordId: tender.id, description: `Invalid status: ${tender.status || 'blank'}.`, suggestedFix: 'Choose a valid tender status.', href })
      if (isInvalidDate(tender.submissionDate)) addIssue(result, { severity: 'warning', area: 'Tenders', record: label, recordId: tender.id, description: 'Submission date is invalid.', suggestedFix: 'Correct the submission date.', href })
      if (isInvalidDate(tender.openingDate)) addIssue(result, { severity: 'warning', area: 'Tenders', record: label, recordId: tender.id, description: 'Opening date is invalid.', suggestedFix: 'Correct the opening date.', href })
      if (isInvalidAmount(tender.value) || isInvalidAmount(tender.estimatedCost) || isInvalidAmount(tender.quotedAmount)) addIssue(result, { severity: 'warning', area: 'Tenders', record: label, recordId: tender.id, description: 'Tender has invalid currency/amount fields.', suggestedFix: 'Review value, estimated cost, and quoted amount.', href })
      if (tender.status === 'Completed' && !tender.completionDate) addIssue(result, { severity: 'warning', area: 'Tenders', record: label, recordId: tender.id, description: 'Completed tender is missing a completion date.', suggestedFix: 'Add completion date.', href })
      if (tender.status === 'Completed' && tender.awardWorkOrder?.awardStatus && !['Completed', 'Closed'].includes(tender.awardWorkOrder.awardStatus)) addIssue(result, { severity: 'warning', area: 'Tenders', record: label, recordId: tender.id, description: 'Completed project has a conflicting work-order status.', suggestedFix: 'Review the work-order lifecycle and completion date.', href })
      if (tender.status === 'Completed' && !tender.completionSnapshot) addIssue(result, { severity: 'warning', area: 'Tenders', record: label, recordId: tender.id, description: 'Completed tender is missing its final profit snapshot.', suggestedFix: 'Open closeout and save the completion snapshot.', href })
      if (tender.linkedPayOrderId && !payOrderIds.has(tender.linkedPayOrderId)) addIssue(result, { severity: 'warning', area: 'Tenders', record: label, recordId: tender.id, description: 'Linked pay order was not found.', detail: tender.linkedPayOrderId, suggestedFix: 'Relink or remove the missing pay order reference.', href })
      if (tender.linkedPO && !data.payOrders.some((po) => po.tenderRef === tender.id && po.po === tender.linkedPO)) addIssue(result, { severity: 'warning', area: 'Tenders', record: label, recordId: tender.id, description: 'Displayed PO number does not match a canonical linked PO.', detail: tender.linkedPO, suggestedFix: 'Compare the physical instrument, then relink by tender ID.', href })

      ;(tender.documents || []).forEach((documentItem, index) => {
        const documentLabel = documentItem.title || documentItem.fileName || `${label} document ${index + 1}`
        if (!documentItem.url && !documentItem.fileName) addIssue(result, { severity: 'warning', area: 'Documents', record: documentLabel, recordId: `${tender.id}-${documentItem.id || index}`, description: 'Document link/file is missing.', suggestedFix: 'Upload a file or add a URL.', href })
        if (documentItem.url && typeof documentItem.url === 'string' && !/^https?:\/\//i.test(documentItem.url)) addIssue(result, { severity: 'info', area: 'Documents', record: documentLabel, recordId: `${tender.id}-${documentItem.id || index}`, description: 'Document URL may be invalid.', detail: documentItem.url, suggestedFix: 'Check that the URL starts with http:// or https://.', href })
      })
    })

    payOrderNumbers.forEach((items, poNumber) => {
      if (items.length > 1) {
        addIssue(result, { severity: 'critical', area: 'Pay Orders', record: `PO #${poNumber}`, recordId: poNumber, description: 'Duplicate pay order number found.', detail: `${items.length} records use this PO number.`, suggestedFix: 'Review duplicate entries and correct the PO number.', href: '/pay-orders' })
      }
    })

    data.payOrders.forEach((po) => {
      const label = po.po ? `PO #${po.po}` : po.id
      if (!po.createdAt) addIssue(result, { severity: 'info', area: 'Pay Orders', record: label, recordId: po.id, description: 'createdAt is missing.', suggestedFix: 'Add createdAt timestamp.', href: '/pay-orders', repair: { collectionName: 'payOrders', id: po.id, patch: getTimestampPatch, label: 'Add timestamps' } })
      if (!po.updatedAt) addIssue(result, { severity: 'info', area: 'Pay Orders', record: label, recordId: po.id, description: 'updatedAt is missing.', suggestedFix: 'Add updatedAt timestamp.', href: '/pay-orders', repair: { collectionName: 'payOrders', id: po.id, patch: () => ({ updatedAt: serverTimestamp() }), label: 'Add updatedAt' } })
      if (!PO_STATUSES.includes(po.status)) addIssue(result, { severity: 'critical', area: 'Pay Orders', record: label, recordId: po.id, description: `Invalid status: ${po.status || 'blank'}.`, suggestedFix: 'Choose a valid pay order status.', href: '/pay-orders' })
      if (!PO_PURPOSES.includes(po.purpose)) addIssue(result, { severity: 'warning', area: 'Pay Orders', record: label, recordId: po.id, description: `Invalid purpose: ${po.purpose || 'blank'}.`, suggestedFix: 'Set a valid purpose.', href: '/pay-orders', repair: !po.purpose ? { collectionName: 'payOrders', id: po.id, patch: () => ({ purpose: 'Other', updatedAt: serverTimestamp() }), label: 'Set Other' } : null })
      if (!BID_RESULTS.includes(po.bidResult || 'N/A')) addIssue(result, { severity: 'warning', area: 'Pay Orders', record: label, recordId: po.id, description: `Invalid bid result: ${po.bidResult}.`, suggestedFix: 'Choose a valid bid result.', href: '/pay-orders' })
      if (po.tenderRef && !tenderIds.has(po.tenderRef)) addIssue(result, { severity: 'warning', area: 'Pay Orders', record: label, recordId: po.id, description: 'Tender link points to a missing tender.', detail: po.tenderRef, suggestedFix: 'Relink to an existing tender or clear the link.', href: '/pay-orders' })
      if ((Number(po.amount) || 0) <= 0) addIssue(result, { severity: 'info', area: 'Pay Orders', record: label, recordId: po.id, description: 'Amount is empty or zero.', suggestedFix: 'Enter the pay order amount if known.', href: '/pay-orders' })
      if (isInvalidAmount(po.amount)) addIssue(result, { severity: 'warning', area: 'Pay Orders', record: label, recordId: po.id, description: 'Amount is invalid.', suggestedFix: 'Correct the pay order amount.', href: '/pay-orders' })
      if (isInvalidDate(po.submitted)) addIssue(result, { severity: 'warning', area: 'Pay Orders', record: label, recordId: po.id, description: 'Submitted date is invalid.', suggestedFix: 'Correct the submitted date.', href: '/pay-orders' })
      if (po.status === 'Encashed' || po.status === 'Forfeited') addIssue(result, { severity: 'info', area: 'Pay Orders', record: label, recordId: po.id, description: 'Beneficiary draw or forfeiture needs a loss reconciliation.', suggestedFix: 'Check bank debit and record any unbooked project loss once.', href: '/pay-orders' })
    })

    data.todos.forEach((task) => {
      const label = getRecordLabel(task, task.id)
      if (!task.createdAt) addIssue(result, { severity: 'info', area: 'Tasks', record: label, recordId: task.id, description: 'createdAt is missing.', suggestedFix: 'Add createdAt timestamp.', href: '/todo', repair: { collectionName: 'todos', id: task.id, patch: getTimestampPatch, label: 'Add timestamps' } })
      if (!task.updatedAt) addIssue(result, { severity: 'info', area: 'Tasks', record: label, recordId: task.id, description: 'updatedAt is missing.', suggestedFix: 'Add updatedAt timestamp.', href: '/todo', repair: { collectionName: 'todos', id: task.id, patch: () => ({ updatedAt: serverTimestamp() }), label: 'Add updatedAt' } })
      if (!task.text && !task.title) addIssue(result, { severity: 'warning', area: 'Tasks', record: task.id, recordId: task.id, description: 'Task title/text is missing.', suggestedFix: 'Add a task title.', href: '/todo' })
      if (isInvalidDate(task.dueDate || task.due)) addIssue(result, { severity: 'warning', area: 'Tasks', record: label, recordId: task.id, description: 'Task due date is invalid.', suggestedFix: 'Correct the due date.', href: '/todo' })
    })

    data.expenses.forEach((expense) => {
      const href = expense.tenderRef ? `/tenders/${expense.tenderRef}` : '/expenses'
      const label = getRecordLabel(expense, expense.id)
      if (!expense.tenderRef && !expense.tenderId && expense.v2?.kind !== 'overhead' && expense.v2?.kind !== 'owner-funding') addIssue(result, { severity: 'info', area: 'Expenses', record: label, recordId: expense.id, description: 'Entry is unassigned to a project or firm category.', suggestedFix: 'Choose a project or classify this as firm overhead or owner funding.', href: '/expenses' })
      if (!Array.isArray(expense.v2?.payments)) addIssue(result, { severity: 'info', area: 'Expenses', record: label, recordId: expense.id, description: 'Payment history is unknown for this legacy cost.', suggestedFix: 'Reconcile bank records before starting a dated payment ledger.', href: '/expenses' })
      if (!expense.createdAt) addIssue(result, { severity: 'info', area: 'Expenses', record: label, recordId: expense.id, description: 'createdAt is missing.', suggestedFix: 'Add createdAt timestamp.', href, repair: { collectionName: 'expenses', id: expense.id, patch: getTimestampPatch, label: 'Add timestamps' } })
      if (!expense.updatedAt) addIssue(result, { severity: 'info', area: 'Expenses', record: label, recordId: expense.id, description: 'updatedAt is missing.', suggestedFix: 'Add updatedAt timestamp.', href, repair: { collectionName: 'expenses', id: expense.id, patch: () => ({ updatedAt: serverTimestamp() }), label: 'Add updatedAt' } })
      if (!expense.description) addIssue(result, { severity: 'info', area: 'Expenses', record: expense.id, recordId: expense.id, description: 'Description is missing.', suggestedFix: 'Add a description.', href })
      if (!EXPENSE_CATEGORIES.includes(expense.category)) addIssue(result, { severity: 'warning', area: 'Expenses', record: label, recordId: expense.id, description: `Invalid category: ${expense.category || 'blank'}.`, suggestedFix: 'Choose a valid expense category.', href })
      if ((Number(expense.amount) || 0) <= 0) addIssue(result, { severity: 'info', area: 'Expenses', record: label, recordId: expense.id, description: 'Amount is empty or zero.', suggestedFix: 'Enter the expense amount if known.', href })
      if (isInvalidAmount(expense.amount)) addIssue(result, { severity: 'warning', area: 'Expenses', record: label, recordId: expense.id, description: 'Amount is invalid.', suggestedFix: 'Correct the amount.', href })
      if (expense.tenderRef && !tenderIds.has(expense.tenderRef)) addIssue(result, { severity: 'warning', area: 'Expenses', record: label, recordId: expense.id, description: 'Tender link points to a missing tender.', detail: expense.tenderRef, suggestedFix: 'Relink to an existing tender or clear the link.', href })
    })

    data.notes.forEach((note) => {
      const label = getRecordLabel(note, note.id)
      if (!note.createdAt) addIssue(result, { severity: 'info', area: 'Notes', record: label, recordId: note.id, description: 'createdAt is missing.', suggestedFix: 'Add createdAt timestamp.', href: '/notes', repair: { collectionName: 'notes', id: note.id, patch: getTimestampPatch, label: 'Add timestamps' } })
      if (!note.updatedAt) addIssue(result, { severity: 'info', area: 'Notes', record: label, recordId: note.id, description: 'updatedAt is missing.', suggestedFix: 'Add updatedAt timestamp.', href: '/notes', repair: { collectionName: 'notes', id: note.id, patch: () => ({ updatedAt: serverTimestamp() }), label: 'Add updatedAt' } })
      if (!note.title && !note.body) addIssue(result, { severity: 'info', area: 'Notes', record: note.id, recordId: note.id, description: 'Note title and body are empty.', suggestedFix: 'Add note content or remove if unused.', href: '/notes' })
    })

    data.users.forEach((user) => {
      const label = user.displayName || user.email || user.id
      if (!user.email) addIssue(result, { severity: 'warning', area: 'Users / Settings', record: label, recordId: user.id, description: 'User email is missing.', suggestedFix: 'Review the user profile.', href: '/settings' })
      if (!['admin', 'viewer'].includes(user.role || 'viewer')) addIssue(result, { severity: 'warning', area: 'Users / Settings', record: label, recordId: user.id, description: `Invalid role: ${user.role || 'blank'}.`, suggestedFix: 'Set role to admin or viewer.', href: '/settings' })
    })

    return result
  }, [data])

  const summary = useMemo(() => {
    const totalRecords = data.tenders.length + data.payOrders.length + data.expenses.length + data.todos.length + data.notes.length + data.users.length
    const critical = issues.filter((issue) => issue.severity === 'critical').length
    const warnings = issues.filter((issue) => issue.severity === 'warning').length
    const info = issues.filter((issue) => issue.severity === 'info').length
    const affectedRecords = new Set(issues.map((issue) => `${issue.area}-${issue.recordId || issue.record}`)).size
    return {
      totalRecords,
      issuesFound: issues.length,
      critical,
      warnings,
      info,
      cleanRecords: Math.max(totalRecords - affectedRecords, 0),
      exposure: data.payOrders
        .filter((po) => ['Pending', 'Submitted', 'Held'].includes(po.status))
        .reduce((sum, po) => sum + (Number(po.amount) || 0), 0),
    }
  }, [data, issues])

  const groupedIssues = useMemo(() => (
    GROUP_ORDER.map((group) => ({
      group,
      issues: issues.filter((issue) => issue.area === group),
    })).filter(({ issues: groupIssues }) => groupIssues.length > 0)
  ), [issues])

  const repairIssue = async (issue) => {
    if (!issue.repair || repairing) return
    const ok = window.confirm(`Apply repair for "${issue.record}"?\n\n${issue.suggestedFix}`)
    if (!ok) return

    setRepairing(issue.id)
    try {
      const patch = typeof issue.repair.patch === 'function' ? issue.repair.patch() : issue.repair.patch
      await writeBatchUpdate([{ collectionName: issue.repair.collectionName, id: issue.repair.id, patch }])
      toast.success('Repair applied')
      await load()
    } catch (err) {
      console.error('Failed to repair issue:', err)
      toast.error('Failed to repair issue')
    } finally {
      setRepairing('')
    }
  }

  const blankPurposePayOrders = data.payOrders.filter((po) => !po.purpose)

  const repairBlankPurposes = async () => {
    if (blankPurposePayOrders.length === 0) return
    const ok = window.confirm(
      `Set ${blankPurposePayOrders.length} pay order purpose${blankPurposePayOrders.length === 1 ? '' : 's'} from blank to "Other"?`
    )
    if (!ok) return

    setRepairing('blank-purposes')
    try {
      await writeBatchUpdate(blankPurposePayOrders.map((po) => ({
        collectionName: 'payOrders',
        id: po.id,
        patch: { purpose: 'Other', updatedAt: serverTimestamp() },
      })))
      toast.success('Blank pay order purposes repaired')
      await load()
    } catch (err) {
      console.error('Failed to repair blank purposes:', err)
      toast.error('Failed to repair blank purposes')
    } finally {
      setRepairing('')
    }
  }

  const writeBatchUpdate = async (updates) => {
    const batch = writeBatch(db)
    updates.forEach(({ collectionName, id, patch }) => {
      batch.update(doc(db, collectionName, id), patch)
    })
    await batch.commit()
  }

  if (loading) return <LoadState title="Scanning data" description="Checking records, links, and data consistency." />
  if (error) return <LoadState title="Could not scan data" error={error} retry={load} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Health"
        description="Check records, missing fields, and data consistency issues"
        actions={
          <>
            {blankPurposePayOrders.length > 0 && (
              <Button onClick={repairBlankPurposes} disabled={!!repairing}>
                {repairing === 'blank-purposes' ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Fix Blank Purposes
              </Button>
            )}
            <Button variant="outline" onClick={load}><RefreshCw size={16} /> Rescan</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard icon={DatabaseZap} label="Total Records Checked" value={summary.totalRecords} />
        <SummaryCard icon={AlertTriangle} label="Issues Found" value={summary.issuesFound} tone="amber" />
        <SummaryCard icon={ShieldAlert} label="Critical Issues" value={summary.critical} tone="red" />
        <SummaryCard icon={Clock3} label="Warnings" value={summary.warnings} tone="amber" />
        <SummaryCard icon={CheckCircle2} label="Clean Records" value={summary.cleanRecords} tone="green" className="col-span-2 lg:col-span-1" />
      </div>

      <Card className="rounded-xl border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseZap size={18} className="text-emerald-600" />
            Data Consistency Checks
          </CardTitle>
          <CardDescription>
            {issues.length === 0
              ? 'No data issues found in the scanned collections.'
              : `${issues.length} issue${issues.length === 1 ? '' : 's'} found across scanned collections. Current PO exposure is ${formatCurrency(summary.exposure)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="font-medium">Everything looks clean.</p>
              <p className="text-sm text-muted-foreground">Run this again after imports or rule changes.</p>
            </div>
          ) : (
            groupedIssues.map(({ group, issues: groupIssues }) => (
              <IssueGroup
                key={group}
                group={group}
                issues={groupIssues}
                repairing={repairing}
                onRepair={repairIssue}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, tone = 'emerald', className = '' }) {
  const normalizedTone = tone === 'red' ? 'rose' : tone === 'green' ? 'emerald' : tone
  return <KpiCard icon={Icon} label={label} value={value} tone={normalizedTone} className={className} />
}

function IssueGroup({ group, issues, repairing, onRepair }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{group}</h3>
          <p className="text-xs text-muted-foreground">{issues.length} issue{issues.length === 1 ? '' : 's'} need review</p>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border/80 md:block">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Record</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Suggested Fix</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} repairing={repairing} onRepair={onRepair} />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} repairing={repairing} onRepair={onRepair} />
        ))}
      </div>
    </section>
  )
}

function SeverityBadge({ severity }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.info
  return <Badge variant="outline" className={`rounded-full ${meta.badge}`}>{meta.label}</Badge>
}

function IssueRow({ issue, repairing, onRepair }) {
  const MetaIcon = SEVERITY_META[issue.severity]?.icon || FileText
  return (
    <TableRow>
      <TableCell><SeverityBadge severity={issue.severity} /></TableCell>
      <TableCell className="max-w-[220px] truncate font-medium">{issue.record}</TableCell>
      <TableCell>
        <div className="flex items-start gap-2">
          <MetaIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <div>
            <p>{issue.description}</p>
            {issue.detail && <p className="text-xs text-muted-foreground">{issue.detail}</p>}
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[280px] text-sm text-muted-foreground">{issue.suggestedFix}</TableCell>
      <TableCell>
        <IssueActions issue={issue} repairing={repairing} onRepair={onRepair} />
      </TableCell>
    </TableRow>
  )
}

function IssueCard({ issue, repairing, onRepair }) {
  const MetaIcon = SEVERITY_META[issue.severity]?.icon || FileText
  return (
    <Card className="rounded-xl border-border/80">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MetaIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{issue.record}</p>
              <p className="mt-1 text-sm text-muted-foreground">{issue.description}</p>
            </div>
          </div>
          <SeverityBadge severity={issue.severity} />
        </div>
        {issue.detail && <p className="rounded-lg bg-muted/35 p-2 text-xs text-muted-foreground">{issue.detail}</p>}
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggested fix</p>
          <p className="mt-1 text-sm">{issue.suggestedFix}</p>
        </div>
        <IssueActions issue={issue} repairing={repairing} onRepair={onRepair} mobile />
      </CardContent>
    </Card>
  )
}

function IssueActions({ issue, repairing, onRepair, mobile = false }) {
  return (
    <div className={`flex gap-2 ${mobile ? 'flex-col' : 'justify-end'}`}>
      {issue.repair && (
        <Button size="sm" onClick={() => onRepair(issue)} disabled={!!repairing} className={mobile ? 'w-full' : ''}>
          {repairing === issue.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
          {issue.repair.label || 'Repair'}
        </Button>
      )}
      {issue.href && (
        <Button variant="outline" size="sm" asChild className={mobile ? 'w-full' : ''}>
          <Link to={issue.href}>
            <Search size={16} />
            Open
          </Link>
        </Button>
      )}
    </div>
  )
}
