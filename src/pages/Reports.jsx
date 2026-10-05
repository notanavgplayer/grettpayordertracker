import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Printer, RotateCcw, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { useCollection } from '@/hooks/useFirestore'
import { formatCurrency } from '@/lib/utils'
import { rowsToCSV } from '@/lib/csv'
import { buildProjectView, buildExpenseView, buildSecurityView } from '@/lib/reportViews'
import PageHeader from '@/components/shared/PageHeader'
import LoadState from '@/components/shared/LoadState'
import { PageTableSkeleton } from '@/components/shared/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import ReportCatalog from './ReportCatalog'
import './reports-print.css'

const EMPTY = { project: 'all', status: 'all', from: '', to: '', scope: 'all' }
const names = (item) => item.name || item.title || item.projectName || item.tenderName || 'Untitled project'
const money = (value) => value == null ? 'Unknown' : formatCurrency(value)
const monetary = new Set(['contract', 'incurred', 'received', 'receivables', 'unbilled', 'forecast', 'periodReceipts', 'paid', 'payable', 'periodPaid', 'face', 'remaining', 'exposure', 'refunded', 'periodRefunds'])
const REPORTS = {
  projects: {
    title: 'Project Finances',
    columns: [['name', 'Project'], ['status', 'Status'], ['contract', 'Contract amount'], ['incurred', 'Recorded cost'], ['received', 'Received on bills'], ['receivables', 'Approved receivables'], ['unbilled', 'Unbilled work'], ['forecast', 'Forecast final cost'], ['periodReceipts', 'Receipts in period']],
    cards: [['contract', 'Contract amount', 'Awarded contracts only'], ['incurred', 'Recorded cost', 'Incurred costs, separate from cash paid'], ['received', 'Received on bills', 'Lifetime bill and RA-bill receipts'], ['receivables', 'Approved receivables', 'Approved less receipts and deductions'], ['unbilled', 'Unbilled work', 'Contract less submitted bills'], ['periodReceipts', 'Receipts in selected period', 'Dated receipt events only']],
  },
  expenses: {
    title: 'Expense Payments',
    columns: [['description', 'Expense'], ['project', 'Project / assignment'], ['scope', 'Kind'], ['incurred', 'Recorded cost'], ['paid', 'Known paid'], ['payable', 'Known outstanding'], ['periodPaid', 'Payments in period']],
    cards: [['incurred', 'Recorded cost', 'Cost and overhead only'], ['paid', 'Known paid', 'Recorded cost/overhead payments'], ['payable', 'Known outstanding', 'Unknown legacy histories excluded'], ['periodPaid', 'Payments in selected period', 'Dated payment events only']],
  },
  securities: {
    title: 'Securities',
    columns: [['po', 'Instrument'], ['project', 'Project / link'], ['status', 'Status'], ['face', 'Face value'], ['remaining', 'Known funded cash remaining'], ['exposure', 'Guarantee exposure'], ['refunded', 'Recorded refunds'], ['periodRefunds', 'Refunds in period']],
    cards: [['face', 'Instrument face value', 'Separate from cash funding'], ['remaining', 'Known funded cash remaining', 'Unknown margins excluded'], ['exposure', 'Guarantee exposure', 'Outstanding guarantee face value'], ['periodRefunds', 'Refunds in selected period', 'Dated refund receipts only']],
  },
}

function Value({ row, field }) {
  const value = row[field]
  if (field === 'contract' && value === null) return <span>Not awarded</span>
  if (field === 'forecast' && value === null) return <span>{row.contract === null ? 'Not applicable' : 'Incomplete'}</span>
  if (monetary.has(field)) return <span className="inline-block max-w-full overflow-x-auto whitespace-nowrap align-bottom tabular-nums">{money(value)}</span>
  if (field === 'name') return <span><Link to={`/tenders/${row.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">{value}</Link>{row.contractFallback && <span className="block text-xs text-amber-700 dark:text-amber-300">Contract uses V2 fallback</span>}</span>
  if (field === 'description') return <Link to={`/expenses?search=${encodeURIComponent(value)}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">{value}</Link>
  if (field === 'po') return <Link to={`/pay-orders?search=${encodeURIComponent(value)}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">{value}</Link>
  if (field === 'project' && row.projectId && value !== 'Project link missing') return <Link to={`/tenders/${row.projectId}`} className="text-emerald-700 hover:underline dark:text-emerald-300">{value}</Link>
  return <span className={value === 'Project link missing' ? 'text-amber-700 dark:text-amber-300' : ''}>{value ?? '—'}</span>
}

function ReportTable({ rows, columns, sort, setSort }) {
  return <Table className="min-w-[1080px] print:min-w-0"><TableHeader><TableRow>{columns.map(([field, label]) => <TableHead key={field} className="whitespace-nowrap"><button type="button" className="inline-flex items-center gap-1" onClick={() => setSort((current) => ({ field, direction: current.field === field ? -current.direction : 1 }))}>{label}<ArrowUpDown className="h-3 w-3 print:hidden" /></button></TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={row.id || index}>{columns.map(([field]) => <TableCell key={field} className="max-w-[220px] break-words align-top text-sm"><Value row={row} field={field} /></TableCell>)}</TableRow>)}</TableBody></Table>
}

export default function Reports() {
  const { data: tenders, loading: tenderLoading, error: tenderError } = useCollection('tenders', 'createdAt', 'desc')
  const { data: expenses, loading: expenseLoading, error: expenseError } = useCollection('expenses', 'date', 'desc')
  const { data: payOrders, loading: securityLoading, error: securityError } = useCollection('payOrders', 'createdAt', 'desc')
  const [tab, setTab] = useState('projects')
  const [filters, setFilters] = useState(EMPTY)
  const [sort, setSort] = useState({ field: 'name', direction: 1 })
  const [hiddenColumns, setHiddenColumns] = useState([])
  const [page, setPage] = useState(1)
  const setFilter = (field, value) => { setFilters((current) => ({ ...current, [field]: value })); setPage(1) }
  const changeTab = (value) => { setTab(value); setFilters(EMPTY); setPage(1); setHiddenColumns([]); setSort({ field: value === 'projects' ? 'name' : value === 'expenses' ? 'description' : 'po', direction: 1 }) }
  const view = useMemo(() => {
    if (tab === 'projects') return buildProjectView(tenders, expenses, filters)
    if (tab === 'expenses') return buildExpenseView(tenders, filters.scope === 'all' ? expenses : expenses.filter((expense) => (expense.v2?.kind || 'cost') === filters.scope), filters)
    if (tab === 'securities') return buildSecurityView(tenders, payOrders, filters)
    return { rows: [], totals: {}, coverage: {} }
  }, [tab, tenders, expenses, payOrders, filters])
  const sorted = useMemo(() => [...view.rows].sort((a, b) => {
    const left = a[sort.field] ?? '', right = b[sort.field] ?? ''
    return sort.direction * (typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right)))
  }), [view.rows, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / 10))
  const currentPage = Math.min(page, pages)
  const visible = sorted.slice((currentPage - 1) * 10, currentPage * 10)
  const config = REPORTS[tab]
  const displayColumns = config?.columns.filter(([field]) => !hiddenColumns.includes(field)) || []
  const statuses = [...new Set((tab === 'securities' ? payOrders : tenders).map((record) => record.status || 'Unknown'))].sort()
  if (tab === 'expenses' && !statuses.includes('Unassigned')) statuses.push('Unassigned')
  const period = Boolean(filters.from || filters.to)
  const projectLabel = filters.project === 'all' ? 'All projects' : filters.project === 'unassigned' ? 'Unassigned' : names(tenders.find((item) => item.id === filters.project) || {})
  const scope = `${projectLabel} · ${filters.status === 'all' ? 'All statuses' : filters.status}${tab === 'expenses' && filters.scope !== 'all' ? ` · ${filters.scope}` : ''}`
  const notes = tab === 'projects'
    ? [`${view.coverage.unawarded} projects without awarded contracts excluded from contract/unbilled totals.`, `${view.coverage.contractFallback} awarded contracts use V2 project-value fallback; check work orders.`, `${view.coverage.forecastIncomplete} awarded projects have incomplete cost forecasts; no profit inferred.`, `${view.coverage.incompletePayments} project expense histories are incomplete; cash paid is not inferred.`]
    : tab === 'expenses'
      ? [`${view.coverage.unknown} cost/overhead entries have unknown payment history and are excluded from known paid/outstanding.`, 'Owner funding is shown separately and excluded from cost/payment totals.', `${view.coverage.missingLinks} expenses have missing project links.`]
      : [`${view.coverage.unknown} instruments have unknown funding or guarantee margin; excluded from known remaining.`, `${view.coverage.reconciliation} encashed/forfeited instruments need reconciliation; status is not a cash refund.`, `${view.coverage.missingLinks} instruments have missing project links.`]
  if (period) notes.push(`${view.coverage.undated} undated events excluded from period totals.${tab === 'projects' ? ` ${view.coverage.legacy} legacy bill receipts have no event date and are also excluded.` : ''}`)
  if (tenderLoading || expenseLoading || securityLoading) return <PageTableSkeleton rows={8} cols={6} metrics={4} />
  if (tenderError || expenseError || securityError) return <LoadState title="Could not load reports" error={tenderError || expenseError || securityError} />

  const exportRows = () => {
    if (!sorted.length) return toast.error('No rows to export')
    const columns = config.columns
    const headers = columns.map(([, label]) => label)
    const data = sorted.map((row) => columns.map(([field]) => row[field] == null ? field === 'contract' ? 'Not awarded' : field === 'forecast' ? row.contract === null ? 'Not applicable' : 'Incomplete' : 'Unknown' : row[field]))
    const meta = `${config.title} — ${scope}; ${period ? `Transactions ${filters.from || 'any'} to ${filters.to || 'any'}` : 'All dated transactions'}; balances lifetime; ${notes.join(' ')}`
    const numericColumns = new Set(columns.flatMap(([field], index) => monetary.has(field) ? [index] : []))
    const csv = [rowsToCSV([meta], []), rowsToCSV(headers, data, numericColumns)].join('\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${tab}-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Report exported')
  }

  return <div className="reports-print-root space-y-5 pb-8 print:space-y-3">
    <div className="print:hidden"><PageHeader title="Reports" description="Project finances, expense payments and securities from recorded ledgers." actions={tab !== 'catalog' && <><Button variant="outline" size="sm" disabled={!sorted.length} onClick={exportRows}><Download className="h-4 w-4" /> Export CSV</Button><Button variant="outline" size="sm" disabled={!sorted.length} onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button></>} /></div>
    <nav aria-label="Report sections" className="flex gap-1 overflow-x-auto border-b print:hidden">{[...Object.entries(REPORTS).map(([key, value]) => [key, value.title]), ['catalog', 'Other Reports']].map(([key, title]) => <button key={key} type="button" onClick={() => changeTab(key)} aria-current={tab === key ? 'page' : undefined} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium ${tab === key ? 'border-emerald-700 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{title}</button>)}</nav>
    {tab === 'catalog' ? <ReportCatalog /> : <>
      <header className="space-y-1"><h1 className="text-xl font-semibold">{config.title}</h1><p className="text-sm text-muted-foreground">{scope} · {period ? `${filters.from || 'Any date'} to ${filters.to || 'Any date'} for transaction events` : 'All dated transaction events'}. Balances are lifetime values.</p><p className="hidden text-xs text-muted-foreground print:block">Generated {new Date().toLocaleString()}</p></header>
      <Card className="print:hidden"><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1"><Label htmlFor="report-project">Project</Label><Select value={filters.project} onValueChange={(value) => setFilter('project', value)}><SelectTrigger id="report-project"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All projects</SelectItem>{tab === 'expenses' && <SelectItem value="unassigned">Unassigned</SelectItem>}{tenders.map((item) => <SelectItem key={item.id} value={item.id}>{names(item)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="report-status">Status</Label><Select value={filters.status} onValueChange={(value) => setFilter('status', value)}><SelectTrigger id="report-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{statuses.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="report-from">Transaction from</Label><Input id="report-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilter('from', event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="report-to">Transaction to</Label><Input id="report-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilter('to', event.target.value)} /></div>
        <div className="flex items-end gap-2">{tab === 'expenses' && <Select value={filters.scope} onValueChange={(value) => setFilter('scope', value)}><SelectTrigger aria-label="Expense kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All kinds</SelectItem><SelectItem value="cost">Project cost</SelectItem><SelectItem value="overhead">Overhead</SelectItem><SelectItem value="owner-funding">Owner funding</SelectItem></SelectContent></Select>}<Button variant="outline" onClick={() => { setFilters(EMPTY); setPage(1) }}><RotateCcw className="h-4 w-4" /> Clear</Button></div>
      </CardContent></Card>
      <div className="flex justify-end print:hidden"><details className="relative text-sm"><summary className="cursor-pointer rounded-md border px-3 py-2 font-medium">Columns</summary><div className="absolute right-0 z-20 mt-1 min-w-52 space-y-2 rounded-lg border bg-card p-3 shadow-lg">{config.columns.slice(1).map(([field, label]) => <label key={field} className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={!hiddenColumns.includes(field)} onChange={() => setHiddenColumns((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field])} />{label}</label>)}</div></details></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{config.cards.map(([field, label, detail]) => <Card key={field}><CardContent className="min-w-0 space-y-1 p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="max-w-full overflow-x-auto whitespace-nowrap text-xl font-semibold tabular-nums sm:text-2xl">{money(view.totals[field])}</p><p className="text-xs leading-relaxed text-muted-foreground">{detail}</p></CardContent></Card>)}</div>
      <div role="note" className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><strong>Coverage:</strong> {notes.join(' ')} {tab === 'securities' && <Link to="/pay-orders?review=1" className="font-medium underline">Open existing review queue ({view.coverage.reviews})</Link>}</div>
      {sorted.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No records match this scope. Clear filters or select another report.</CardContent></Card> : <Card className="overflow-hidden"><CardContent className="p-0"><div className="space-y-2 p-3 md:hidden print:hidden">{visible.map((row, index) => <div key={row.id || index} className="space-y-2 rounded-lg border p-3">{displayColumns.map(([field, label]) => <div key={field} className="grid grid-cols-[108px_minmax(0,1fr)] gap-2 text-sm"><span className="text-xs text-muted-foreground">{label}</span><span className="min-w-0 break-words"><Value row={row} field={field} /></span></div>)}</div>)}</div><div className="hidden overflow-x-auto md:block print:hidden"><ReportTable rows={visible} columns={displayColumns} sort={sort} setSort={setSort} /></div><div className="hidden print:block"><ReportTable rows={sorted} columns={displayColumns} sort={sort} setSort={setSort} /></div></CardContent></Card>}
      <div className="flex items-center justify-between text-sm text-muted-foreground print:hidden"><span>Showing {sorted.length ? (currentPage - 1) * 10 + 1 : 0}–{Math.min(currentPage * 10, sorted.length)} of {sorted.length}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={currentPage >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
    </>}
  </div>
}
