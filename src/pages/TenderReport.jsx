import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { ArrowLeft, Printer } from 'lucide-react'
import { db } from '@/lib/firebase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { sumReceived } from '@/lib/financials'
import LoadState from '@/components/shared/LoadState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function TenderReport() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tender, setTender] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [payOrders, setPayOrders] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tenderSnap, expenseSnap, payOrderSnap] = await Promise.all([
        getDoc(doc(db, 'tenders', id)),
        getDocs(query(collection(db, 'expenses'), where('tenderRef', '==', id))),
        getDocs(query(collection(db, 'payOrders'), where('tenderRef', '==', id))),
      ])
      if (!tenderSnap.exists()) {
        setError('Tender was not found.')
        return
      }
      setTender({ id: tenderSnap.id, ...tenderSnap.data() })
      setExpenses(expenseSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setPayOrders(payOrderSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error('Tender report load failed', err)
      setError(err?.code === 'permission-denied'
        ? "You don't have permission to view this report."
        : 'The report could not be loaded. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    if (!tender) return null
    const contractValue = Number(tender.value) || 0
    const totalExpenses = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0)
    const billPaid = sumReceived(tender.bills)
    const raBillPaid = sumReceived(tender.raBills)
    const totalReceived = billPaid + raBillPaid
    return {
      contractValue,
      totalExpenses,
      billPaid,
      raBillPaid,
      totalReceived,
      expectedProfit: contractValue - totalExpenses,
      cashPosition: totalReceived - totalExpenses,
      receivable: Math.max(contractValue - totalReceived, 0),
      poExposure: payOrders
        .filter((po) => ['Pending', 'Submitted', 'Held'].includes(po.status))
        .reduce((sum, po) => sum + (Number(po.amount) || 0), 0),
    }
  }, [expenses, payOrders, tender])

  if (loading) return <LoadState title="Loading report" description="Preparing tender closeout details." />
  if (error) return <LoadState title="Could not load report" error={error} retry={load} />

  return (
    <div className="space-y-6 print:bg-white print:text-black">
      <PageHeader
        title="Tender Closeout Report"
        description={tender.name || 'Untitled tender'}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/tenders/${id}`}><ArrowLeft size={16} /> Back</Link>
            </Button>
            <Button onClick={() => window.print()}><Printer size={16} /> Print / Save PDF</Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {tender.name || 'Untitled tender'}
            <StatusBadge status={tender.status} />
          </CardTitle>
          <CardDescription>{tender.agency || 'No agency recorded'}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ReportMetric label="Contract Value" value={formatCurrency(totals.contractValue)} />
          <ReportMetric label="Total Expenses" value={formatCurrency(totals.totalExpenses)} />
          <ReportMetric label="Expected Profit" value={formatCurrency(totals.expectedProfit)} />
          <ReportMetric label="Cash Position" value={formatCurrency(totals.cashPosition)} />
          <ReportMetric label="Received From Bills/RA Bills" value={formatCurrency(totals.totalReceived)} />
          <ReportMetric label="Receivable" value={formatCurrency(totals.receivable)} />
          <ReportMetric label="PO Exposure" value={formatCurrency(totals.poExposure)} />
          <ReportMetric label="Completion Date" value={formatDate(tender.completionDate)} />
        </CardContent>
      </Card>

      {tender.completionSnapshot && (
        <Card>
          <CardHeader>
            <CardTitle>Final Snapshot</CardTitle>
            <CardDescription>Saved at completion, so later edits do not change the closeout record.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ReportMetric label="Expected Profit" value={formatCurrency(tender.completionSnapshot.expectedProfit ?? tender.completionSnapshot.projectedProfit)} />
            <ReportMetric label="Cash Position" value={formatCurrency(tender.completionSnapshot.cashPosition ?? tender.completionSnapshot.realizedProfit)} />
            <ReportMetric label="Receivable" value={formatCurrency(tender.completionSnapshot.receivable ?? tender.completionSnapshot.outstandingRevenue)} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ReportTable
          title="Expenses"
          empty="No expenses recorded."
          rows={expenses.map((expense) => [
            expense.description || 'Untitled',
            expense.category || '-',
            formatDate(expense.date),
            formatCurrency(expense.amount),
          ])}
          heads={['Description', 'Category', 'Date', 'Amount']}
        />
        <ReportTable
          title="Pay Orders"
          empty="No linked pay orders."
          rows={payOrders.map((po) => [
            po.po || '-',
            po.purpose || '-',
            po.status || '-',
            formatCurrency(po.amount),
          ])}
          heads={['PO', 'Purpose', 'Status', 'Amount']}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Final Remarks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {tender.completionRemarks || tender.notes || 'No remarks recorded.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function ReportMetric({ label, value }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function ReportTable({ title, heads, rows, empty }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>{heads.map((head) => <TableHead key={head}>{head}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={`${title}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={`${title}-${rowIndex}-${cellIndex}`}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
