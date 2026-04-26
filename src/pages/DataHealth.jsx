import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { AlertTriangle, CheckCircle2, DatabaseZap, RefreshCw, Search } from 'lucide-react'
import { db } from '@/lib/firebase'
import { BID_RESULTS, EXPENSE_CATEGORIES, PO_PURPOSES, PO_STATUSES, TENDER_STATUSES, formatCurrency } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import LoadState from '@/components/shared/LoadState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

const TENDER_FIELDS = new Set([
  'name', 'nit', 'tenderRef', 'value', 'tenderFee', 'status', 'submissionDate', 'openingDate',
  'agency', 'contact', 'contactPerson', 'notes', 'source', 'linkedPO', 'linkedPayOrderId', 'tenderFeeExpenseId',
  'bidSecurity', 'documents', 'checklist', 'bills', 'raBills', 'completionDate',
  'completionRemarks', 'completionSnapshot', 'completedAt', 'statusHistory', 'createdAt', 'updatedAt',
])

const LEGACY_TENDER_FIELDS = new Set([
  'displayStatus',
  'expenses',
  'milestones',
  'siteVisits',
])

const SEVERITY_TONE = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
}

function addIssue(issues, severity, area, record, message, href, detail) {
  issues.push({ id: `${area}-${record}-${message}-${issues.length}`, severity, area, record, message, href, detail })
}

function toList(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export default function DataHealth() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ tenders: [], payOrders: [], expenses: [] })
  const [repairing, setRepairing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tenderSnap, payOrderSnap, expenseSnap] = await Promise.all([
        getDocs(collection(db, 'tenders')),
        getDocs(collection(db, 'payOrders')),
        getDocs(collection(db, 'expenses')),
      ])
      setData({
        tenders: toList(tenderSnap),
        payOrders: toList(payOrderSnap),
        expenses: toList(expenseSnap),
      })
    } catch (err) {
      setError(err?.message || 'Failed to scan project data.')
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

    data.tenders.forEach((tender) => {
      const href = `/tenders/${tender.id}`
      const unknownFields = Object.keys(tender).filter((key) => (
        key !== 'id' && !TENDER_FIELDS.has(key) && !LEGACY_TENDER_FIELDS.has(key)
      ))
      if (unknownFields.length) {
        addIssue(result, 'low', 'Tender', tender.name || tender.id, 'Unknown fields found.', href, unknownFields.join(', '))
      }
      if (!tender.name) addIssue(result, 'medium', 'Tender', tender.id, 'Tender name is missing.', href)
      if (!TENDER_STATUSES.includes(tender.status)) {
        addIssue(result, 'high', 'Tender', tender.name || tender.id, `Invalid status: ${tender.status || 'blank'}.`, href)
      }
      if (tender.status === 'Completed' && !tender.completionDate) {
        addIssue(result, 'medium', 'Tender', tender.name || tender.id, 'Completed tender is missing a completion date.', href)
      }
      if (tender.status === 'Completed' && !tender.completionSnapshot) {
        addIssue(result, 'medium', 'Tender', tender.name || tender.id, 'Completed tender is missing its final profit snapshot.', href)
      }
      if (tender.linkedPayOrderId && !payOrderIds.has(tender.linkedPayOrderId)) {
        addIssue(result, 'medium', 'Tender', tender.name || tender.id, 'Linked pay order was not found.', href, tender.linkedPayOrderId)
      }
    })

    data.payOrders.forEach((po) => {
      const href = '/pay-orders'
      if (!PO_STATUSES.includes(po.status)) addIssue(result, 'high', 'Pay Order', po.po || po.id, `Invalid status: ${po.status || 'blank'}.`, href)
      if (!PO_PURPOSES.includes(po.purpose)) addIssue(result, 'medium', 'Pay Order', po.po || po.id, `Invalid purpose: ${po.purpose || 'blank'}.`, href)
      if (!BID_RESULTS.includes(po.bidResult || 'N/A')) addIssue(result, 'medium', 'Pay Order', po.po || po.id, `Invalid bid result: ${po.bidResult}.`, href)
      if (po.tenderRef && !tenderIds.has(po.tenderRef)) addIssue(result, 'medium', 'Pay Order', po.po || po.id, 'Tender link points to a missing tender.', href, po.tenderRef)
      if ((Number(po.amount) || 0) <= 0) addIssue(result, 'low', 'Pay Order', po.po || po.id, 'Amount is empty or zero.', href)
    })

    data.expenses.forEach((expense) => {
      const href = expense.tenderRef ? `/tenders/${expense.tenderRef}` : '/expenses'
      if (!expense.description) addIssue(result, 'low', 'Expense', expense.id, 'Description is missing.', href)
      if (!EXPENSE_CATEGORIES.includes(expense.category)) addIssue(result, 'medium', 'Expense', expense.description || expense.id, `Invalid category: ${expense.category || 'blank'}.`, href)
      if ((Number(expense.amount) || 0) <= 0) addIssue(result, 'low', 'Expense', expense.description || expense.id, 'Amount is empty or zero.', href)
      if (expense.tenderRef && !tenderIds.has(expense.tenderRef)) addIssue(result, 'medium', 'Expense', expense.description || expense.id, 'Tender link points to a missing tender.', href, expense.tenderRef)
    })

    return result
  }, [data])

  const summary = {
    high: issues.filter((issue) => issue.severity === 'high').length,
    medium: issues.filter((issue) => issue.severity === 'medium').length,
    low: issues.filter((issue) => issue.severity === 'low').length,
    exposure: data.payOrders
      .filter((po) => ['Pending', 'Submitted', 'Held'].includes(po.status))
      .reduce((sum, po) => sum + (Number(po.amount) || 0), 0),
  }

  const blankPurposePayOrders = data.payOrders.filter((po) => !po.purpose)

  const repairBlankPurposes = async () => {
    if (blankPurposePayOrders.length === 0) return
    const ok = window.confirm(
      `Set ${blankPurposePayOrders.length} pay order purpose${blankPurposePayOrders.length === 1 ? '' : 's'} from blank to "Other"?`
    )
    if (!ok) return

    setRepairing(true)
    try {
      const batch = writeBatch(db)
      blankPurposePayOrders.forEach((po) => {
        batch.update(doc(db, 'payOrders', po.id), {
          purpose: 'Other',
          updatedAt: serverTimestamp(),
        })
      })
      await batch.commit()
      toast.success('Blank pay order purposes repaired')
      await load()
    } catch (err) {
      console.error('Failed to repair blank purposes:', err)
      toast.error('Failed to repair blank purposes')
    } finally {
      setRepairing(false)
    }
  }

  if (loading) return <LoadState title="Scanning data" description="Checking tenders, pay orders, and expenses." />
  if (error) return <LoadState title="Could not scan data" error={error} retry={load} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Health"
        description="Admin checks for invalid statuses, broken links, and incomplete closeout records."
        actions={
          <>
            {blankPurposePayOrders.length > 0 && (
              <Button onClick={repairBlankPurposes} disabled={repairing}>
                {repairing ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Fix Blank Purposes
              </Button>
            )}
            <Button variant="outline" onClick={load}><RefreshCw size={16} /> Rescan</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">High Priority</p><p className="mt-2 text-3xl font-semibold">{summary.high}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Medium</p><p className="mt-2 text-3xl font-semibold">{summary.medium}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Low</p><p className="mt-2 text-3xl font-semibold">{summary.low}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">PO Exposure</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(summary.exposure)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseZap size={18} />
            Checks
          </CardTitle>
          <CardDescription>
            {issues.length === 0 ? 'No data issues found in the scanned collections.' : `${issues.length} item${issues.length === 1 ? '' : 's'} need review.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              <p className="font-medium">Everything looks clean.</p>
              <p className="text-sm text-muted-foreground">Run this again after imports or rule changes.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell><Badge variant={SEVERITY_TONE[issue.severity]}>{issue.severity}</Badge></TableCell>
                    <TableCell>{issue.area}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{issue.record}</TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        {issue.severity === 'high' && <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />}
                        <div>
                          <p>{issue.message}</p>
                          {issue.detail && <p className="text-xs text-muted-foreground">{issue.detail}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={issue.href} aria-label={`Open ${issue.record}`}>
                          <Search size={16} />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
