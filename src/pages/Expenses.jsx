import { useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatDate, EXPENSE_CATEGORIES } from '@/lib/utils'
import { exportExpensesCSV } from '@/lib/export'
import { nonNegativeNumber } from '@/lib/data'
import { expenseAmounts, projectId, validateEvents } from '@/lib/financials'
import TransactionLedger from '@/components/shared/TransactionLedger'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import MetricCard from '@/components/shared/MetricCard'
import { PageTableSkeleton } from '@/components/shared/LoadingSkeletons'
import LoadState from '@/components/shared/LoadState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'
import ChartTooltip, { CHART_COLORS, AXIS_TICK } from '@/components/shared/ChartTooltip'
import { Plus, Download, Pencil, Trash2, Loader2, Receipt, TrendingUp, Wallet, CircleHelp, MoreHorizontal, Printer, SlidersHorizontal, Columns3 } from 'lucide-react'
import { toast } from 'sonner'

const CATEGORY_COLORS = CHART_COLORS

const EMPTY = { description: '', category: EXPENSE_CATEGORIES[0], amount: '', date: '', tenderId: '', tenderRef: '', note: '', v2: { kind: 'cost', payee: '', invoice: '', boqItemId: '', receiptUrl: '', payments: [] } }

export default function Expenses() {
  const { data: expenses, loading, error } = useCollection('expenses', 'date', 'desc')
  const { data: tenders } = useCollection('tenders', 'name', 'asc')
  const { add, update, remove } = useFirestoreCRUD('expenses')
  const { isAdmin } = useAuth()
  const searchParams = new URLSearchParams(window.location.search)

  const [dialogOpen, setDialogOpen] = useState(searchParams.get('create') === '1' && isAdmin)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(() => searchParams.get('create') === '1'
    ? { ...EMPTY, v2: { ...EMPTY.v2 }, date: new Date().toISOString().slice(0, 10) }
    : EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'month'
  const [projectFilter, setProjectFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [projectSearch, setProjectSearch] = useState('')
  const [formError, setFormError] = useState('')
  const [initialForm, setInitialForm] = useState('')
  const [discardOpen, setDiscardOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [moreFilters, setMoreFilters] = useState(false)
  const [showCategory, setShowCategory] = useState(false)
  const [sortBy, setSortBy] = useState('date-desc')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const savingRef = useRef(false)

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const displayExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (filter === 'month' && !(e.date || '').startsWith(thisMonthStr)) return false
      if (projectFilter === 'unassigned' && projectId(e)) return false
      if (!['all', 'unassigned'].includes(projectFilter) && projectId(e) !== projectFilter) return false
      const paid = expenseAmounts(e).paid
      if (paymentFilter === 'unknown' && paid !== null) return false
      if (paymentFilter === 'unpaid' && paid !== 0) return false
      if (paymentFilter === 'partial' && !(paid > 0 && paid < Number(e.amount))) return false
      if (paymentFilter === 'paid' && paid !== Number(e.amount)) return false
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
      if (scopeFilter !== 'all' && (e.v2?.kind || 'cost') !== scopeFilter) return false
      if (dateFrom && (!e.date || e.date < dateFrom)) return false
      if (dateTo && (!e.date || e.date > dateTo)) return false
      const project = tenders.find((item) => item.id === projectId(e))
      return `${e.description} ${e.category} ${e.v2?.payee || ''} ${project?.name || ''} ${e.v2?.invoice || ''}`.toLowerCase().includes(search.toLowerCase())
    })
  }, [expenses, filter, thisMonthStr, projectFilter, paymentFilter, search, categoryFilter, scopeFilter, dateFrom, dateTo, tenders])

  const sortedExpenses = useMemo(() => [...displayExpenses].sort((a, b) => {
    if (sortBy === 'cost-desc') return expenseAmounts(b).incurred - expenseAmounts(a).incurred
    if (sortBy === 'cost-asc') return expenseAmounts(a).incurred - expenseAmounts(b).incurred
    const dateOrder = (a.date || '').localeCompare(b.date || '')
    return sortBy === 'date-asc' ? dateOrder : -dateOrder
  }), [displayExpenses, sortBy])
  const pageCount = Math.max(1, Math.ceil(sortedExpenses.length / rowsPerPage))
  const currentPage = Math.min(page, pageCount)
  const pageExpenses = sortedExpenses.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
  const hasFilters = filter !== 'all' || projectFilter !== 'all' || paymentFilter !== 'all' || categoryFilter !== 'all' || scopeFilter !== 'all' || dateFrom || dateTo || search

  const totalAll = expenses.reduce((s, e) => s + expenseAmounts(e).incurred, 0)
  const knownPaid = expenses.filter((e) => ['cost', 'overhead'].includes(expenseAmounts(e).kind)).reduce((s, e) => s + (expenseAmounts(e).paid ?? 0), 0)
  const supplierDue = expenses.reduce((s, e) => s + (expenseAmounts(e).payable ?? 0), 0)
  const unknownPayments = expenses.filter((e) => expenseAmounts(e).payable === null).length
  const unassignedCount = expenses.filter((e) => !projectId(e)).length

  // Category chart
  const catData = useMemo(() => {
    const map = {}
    for (const e of displayExpenses) { map[e.category] = (map[e.category] || 0) + expenseAmounts(e).incurred }
    return Object.entries(map).map(([name, value], i) => ({ name: name.split('/')[0].trim(), value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] })).sort((a, b) => b.value - a.value)
  }, [displayExpenses])

  // Monthly trend (last 6 months)
  const monthlyData = useMemo(() => {
    const result = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleString('default', { month: 'short' })
      const total = expenses.filter((e) => (e.date || '').startsWith(key)).reduce((s, e) => s + expenseAmounts(e).incurred, 0)
      result.push({ month: label, total })
    }
    return result
  }, [currentMonth, currentYear, expenses])

  const openDialog = (item = null) => {
    const nextForm = item ? { ...EMPTY, ...item, amount: item.amount ?? '', tenderRef: projectId(item), v2: { ...EMPTY.v2, ...item.v2, payments: item.v2?.payments } } : { ...EMPTY, v2: { ...EMPTY.v2 }, date: now.toISOString().slice(0, 10) }
    setEditItem(item)
    setForm(nextForm)
    setInitialForm(JSON.stringify(nextForm))
    setFormError('')
    setProjectSearch('')
    setPaymentOpen(Boolean(item))
    setDialogOpen(true)
  }

  const requestClose = () => {
    if (savingRef.current) return
    if (JSON.stringify(form) !== initialForm) setDiscardOpen(true)
    else setDialogOpen(false)
  }

  const handleSave = async () => {
    if (!isAdmin) return
    if (savingRef.current) return
    if (!form.description.trim()) {
      setFormError('Description is required.')
      window.requestAnimationFrame(() => document.getElementById('e-desc')?.focus())
      return
    }
    const amount = nonNegativeNumber(form.amount)
    if (amount === null) {
      setFormError('Amount must be a non-negative number.')
      window.requestAnimationFrame(() => document.getElementById('e-amt')?.focus())
      return
    }
    const eventIssue = validateEvents(form.v2.payments || [], amount)
    if (eventIssue) { setFormError(eventIssue); return }
    if (form.v2.kind === 'overhead' && form.tenderRef) { setFormError('Firm overhead must be recorded without a project link.'); return }
    if (form.tenderRef && !tenders.some((item) => item.id === form.tenderRef)) { setFormError('Select an existing project.'); return }
    setFormError('')
    setSaving(true)
    savingRef.current = true
    try {
      const { payments, ...otherV2 } = form.v2
      const data = { description: form.description.trim(), category: form.category, amount,
        date: form.date, tenderId: form.tenderRef || '', tenderRef: form.tenderRef || '',
        note: form.note, v2: payments === undefined ? otherV2 : { ...otherV2, payments } }
      if (editItem) { await update(editItem.id, data); toast.success('Expense updated') }
      else { await add(data); toast.success('Expense added') }
      setDialogOpen(false)
    } catch (saveError) {
      setFormError(saveError?.message || 'Could not save expense. Please try again.')
    } finally { savingRef.current = false; setSaving(false) }
  }

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))
  const setV2 = (k) => (e) => setForm((p) => ({ ...p, v2: { ...p.v2, [k]: e.target?.value ?? e } }))

  if (loading) return <PageTableSkeleton rows={6} cols={5} metrics={3} />
  if (error) return <LoadState title="Could not load expenses" error={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Recorded costs, payments and outstanding balances"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportExpensesCSV(displayExpenses)}><Download className="h-4 w-4" /> Export</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            {isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add Expense</Button>}
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={Receipt} title="Recorded cost" value={formatCurrency(totalAll)} delta={`All records · ${expenses.length} entries`} />
        <MetricCard icon={Wallet} title="Known paid amount" value={formatCurrency(knownPaid)} delta={`All records · ${unknownPayments} payment histories unknown`} />
        <MetricCard icon={TrendingUp} title="Known outstanding" value={formatCurrency(supplierDue)} delta={`All records · excludes ${unknownPayments} unknown histories`} tone="warning" />
        <MetricCard icon={CircleHelp} title="Unassigned expenses" value={String(unassignedCount)} delta="All records · no project link" tone="neutral" />
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4 space-y-4">
          {/* Filter */}
          <div className="flex gap-2">
            {[['all', 'All Expenses'], ['month', 'This Month']].map(([val, label]) => (
              <button key={val} onClick={() => { setFilter(val); setPage(1) }} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === val ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-[220px] flex-1" aria-label="Search expenses" placeholder="Search expense, vendor or project" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
            <Button variant="outline" onClick={() => setMoreFilters((value) => !value)} aria-expanded={moreFilters}><SlidersHorizontal className="h-4 w-4" /> More filters</Button>
            <Button variant="outline" onClick={() => setShowCategory((value) => !value)} aria-pressed={showCategory}><Columns3 className="h-4 w-4" /> Columns</Button>
            {hasFilters && <Button variant="ghost" onClick={() => { setFilter('all'); setProjectFilter('all'); setPaymentFilter('all'); setCategoryFilter('all'); setScopeFilter('all'); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1) }}>Clear filters</Button>}
          </div>
          {moreFilters && <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select value={projectFilter} onValueChange={(value) => { setProjectFilter(value); setPage(1) }}><SelectTrigger aria-label="Filter project"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All projects</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{tenders.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
            <Select value={scopeFilter} onValueChange={(value) => { setScopeFilter(value); setPage(1) }}><SelectTrigger aria-label="Filter scope"><SelectValue /></SelectTrigger><SelectContent>{[['all','All scopes'],['cost','Project cost'],['overhead','Firm overhead'],['advance','Advance'],['deposit','Refundable deposit'],['transfer','Transfer'],['owner-funding','Owner funding']].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setPage(1) }}><SelectTrigger aria-label="Filter category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{Array.from(new Set([...EXPENSE_CATEGORIES, ...expenses.map((expense) => expense.category).filter(Boolean)])).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
            <Select value={paymentFilter} onValueChange={(value) => { setPaymentFilter(value); setPage(1) }}><SelectTrigger aria-label="Filter payment status"><SelectValue /></SelectTrigger><SelectContent>{[['all','All payments'],['unknown','Legacy payment unknown'],['unpaid','Unpaid'],['partial','Partially paid'],['paid','Paid']].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Input type="date" aria-label="Expense date from" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} />
            <Input type="date" aria-label="Expense date to" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} />
            <Select value={sortBy} onValueChange={setSortBy}><SelectTrigger aria-label="Sort expenses"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="date-desc">Newest first</SelectItem><SelectItem value="date-asc">Oldest first</SelectItem><SelectItem value="cost-desc">Highest cost</SelectItem><SelectItem value="cost-asc">Lowest cost</SelectItem></SelectContent></Select>
          </div>}
          {displayExpenses.length === 0 ? (
            <EmptyState icon={Receipt} title={expenses.length ? 'No matching expenses' : 'No expenses'} description={expenses.length ? 'Adjust or clear the filters to see more records.' : 'Start tracking your project expenses.'} action={!expenses.length && isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add Expense</Button>} />
          ) : (
            <Card className="overflow-hidden print:hidden">
              {/* Mobile: card per row */}
              <div className="xl:hidden p-3 space-y-3 bg-muted/30">
                {pageExpenses.map((e) => (
                  <Card key={e.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground break-words">{e.description}</p>
                          {e.v2?.payee && <p className="text-xs text-muted-foreground break-words">{e.v2.payee}</p>}
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs font-normal">{e.category}</Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(e.date)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-sm font-mono tabular-nums font-semibold text-foreground whitespace-nowrap">{formatCurrency(expenseAmounts(e).incurred)}</span>
                          {isAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openDialog(e)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteId(e.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 border-t pt-2 text-xs">
                        <div className="col-span-2 break-words"><span className="text-muted-foreground">Project / scope: </span>{projectId(e) ? tenders.some((tender) => tender.id === projectId(e)) ? <Link className="text-primary underline" to={`/tenders/${projectId(e)}`}>{tenders.find((tender) => tender.id === projectId(e)).name}</Link> : <span className="text-amber-700 dark:text-amber-300">Linked project missing · {projectId(e)}</span> : e.v2?.kind === 'overhead' ? 'Firm overhead' : 'Unassigned'}</div>
                        <div><span className="text-muted-foreground">Paid: </span>{expenseAmounts(e).paid === null ? 'Unknown' : formatCurrency(expenseAmounts(e).paid)}</div>
                        <div><span className="text-muted-foreground">Outstanding: </span>{expenseAmounts(e).payable === null ? 'Unknown' : formatCurrency(expenseAmounts(e).payable)}</div>
                        <div className="col-span-2"><span className="text-muted-foreground">Payment status: </span>{expenseAmounts(e).paid === null ? 'History unknown' : expenseAmounts(e).payable === null ? 'Not applicable' : expenseAmounts(e).payable === 0 ? 'Paid' : expenseAmounts(e).paid > 0 ? 'Partially paid' : 'Unpaid'}</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openDialog(e)}>{isAdmin ? 'View / Edit' : 'View expense'}</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden overflow-x-auto xl:block"><Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead><TableHead>Expense / vendor</TableHead><TableHead>Project / scope</TableHead>
                    {showCategory && <TableHead>Category</TableHead>}
                    <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead>Payment status</TableHead><TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageExpenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(e.date)}</TableCell>
                      <TableCell className="max-w-[230px]"><span title={e.description} className="line-clamp-3 break-words text-sm font-medium">{e.description}</span>{e.v2?.payee && <span className="block break-words text-xs text-muted-foreground">{e.v2.payee}</span>}</TableCell>
                      <TableCell className="max-w-[190px] text-sm">{projectId(e) ? tenders.some((tender) => tender.id === projectId(e)) ? <Link className="line-clamp-3 break-words text-primary hover:underline" to={`/tenders/${projectId(e)}`}>{tenders.find((tender) => tender.id === projectId(e)).name}</Link> : <span className="break-all text-amber-700 dark:text-amber-300">Linked project missing · {projectId(e)}</span> : e.v2?.kind === 'overhead' ? 'Firm overhead' : 'Unassigned'}</TableCell>
                      {showCategory && <TableCell><Badge variant="secondary" className="max-w-[150px] break-words text-xs font-normal">{e.category}</Badge></TableCell>}
                      <TableCell className="whitespace-nowrap text-right text-sm font-mono tabular-nums">{formatCurrency(expenseAmounts(e).incurred)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm font-mono tabular-nums">{expenseAmounts(e).paid === null ? 'Unknown' : formatCurrency(expenseAmounts(e).paid)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm font-mono tabular-nums">{expenseAmounts(e).payable === null ? 'Unknown' : formatCurrency(expenseAmounts(e).payable)}</TableCell>
                      <TableCell><Badge variant="secondary" className="whitespace-nowrap">{expenseAmounts(e).paid === null ? 'History unknown' : expenseAmounts(e).payable === null ? 'Not applicable' : expenseAmounts(e).payable === 0 ? 'Paid' : expenseAmounts(e).paid > 0 ? 'Partial' : 'Unpaid'}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" onClick={() => openDialog(e)}>{isAdmin ? 'View / Edit' : 'View'}</Button>
                          {isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDialog(e)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteId(e.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
                <span>Showing {sortedExpenses.length ? (currentPage - 1) * rowsPerPage + 1 : 0}–{Math.min(currentPage * rowsPerPage, sortedExpenses.length)} of {sortedExpenses.length}</span>
                <div className="flex items-center gap-2"><Select value={String(rowsPerPage)} onValueChange={(value) => { setRowsPerPage(Number(value)); setPage(1) }}><SelectTrigger aria-label="Rows per page" className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem></SelectContent></Select><Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>{currentPage} / {pageCount}</span><Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
              </div>
            </Card>
          )}
          {displayExpenses.length > 0 && <div className="hidden print:block"><h2 className="mb-3 text-lg font-semibold">Expenses · all filtered records</h2><table className="w-full text-xs"><thead><tr><th>Date</th><th>Expense / vendor</th><th>Project / scope</th><th>Cost</th><th>Paid</th><th>Outstanding</th><th>Payment status</th><th>Category</th></tr></thead><tbody>{sortedExpenses.map((e) => <tr key={e.id} className="border-t"><td>{formatDate(e.date)}</td><td>{e.description} · {e.v2?.payee || ''}</td><td>{tenders.find((item) => item.id === projectId(e))?.name || projectId(e) || e.v2?.kind || 'Unassigned'}</td><td>{formatCurrency(expenseAmounts(e).incurred)}</td><td>{expenseAmounts(e).paid === null ? 'Unknown' : formatCurrency(expenseAmounts(e).paid)}</td><td>{expenseAmounts(e).payable === null ? 'Unknown' : formatCurrency(expenseAmounts(e).payable)}</td><td>{expenseAmounts(e).paid === null ? 'History unknown' : expenseAmounts(e).payable === null ? 'Not applicable' : expenseAmounts(e).payable === 0 ? 'Paid' : expenseAmounts(e).paid > 0 ? 'Partial' : 'Unpaid'}</td><td>{e.category}</td></tr>)}</tbody></table></div>}
        </TabsContent>

        <TabsContent value="charts" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={catData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                      label={({ name }) => name}
                      labelLine={false}
                      stroke="oklch(var(--card))"
                      strokeWidth={2}
                    >
                      {catData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Trend (6 months)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="oklch(var(--border))" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'oklch(var(--muted))', opacity: 0.5 }} content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Bar dataKey="total" fill="oklch(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Expense Sheet */}
      <Sheet open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : requestClose()}>
        <SheetContent side="right" className="flex w-full min-w-0 flex-col gap-0 overflow-x-hidden p-0 sm:w-[min(100vw,720px)] sm:max-w-[720px]">
          <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-14 sm:px-6">
            <SheetTitle>{editItem ? 'Edit Expense' : 'New Expense'}</SheetTitle>
            <SheetDescription>
              {editItem ? 'Update expense details.' : 'Record a new project expense.'}
            </SheetDescription>
          </SheetHeader>
          <fieldset disabled={!isAdmin} className="min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5">
            <section className="space-y-3" aria-labelledby="expense-scope-heading">
              <h3 id="expense-scope-heading" className="text-sm font-semibold">1. Expense Scope &amp; Project</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="e-kind">Type</Label><Select value={form.v2.kind} onValueChange={setV2('kind')}><SelectTrigger id="e-kind"><SelectValue /></SelectTrigger><SelectContent>{[['cost','Project cost'],['overhead','Firm overhead'],['advance','Advance'],['deposit','Refundable deposit'],['transfer','Transfer'],['owner-funding','Owner funding']].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div><Label htmlFor="e-project-search">Project / tender</Label><Input id="e-project-search" placeholder="Search projects" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} /><Select value={form.tenderRef || 'firm'} onValueChange={(value) => setF('tenderRef')(value === 'firm' ? '' : value)}><SelectTrigger aria-label="Select project"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="firm">Firm / unassigned</SelectItem>{tenders.filter((item) => item.name?.toLowerCase().includes(projectSearch.toLowerCase()) || item.id === form.tenderRef).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
                {form.tenderRef && <Button variant="ghost" size="sm" onClick={() => setF('tenderRef')('')}>Clear selected project</Button>}
              </div>
            </section>
            <section className="space-y-3 border-t pt-4" aria-labelledby="expense-details-heading">
              <h3 id="expense-details-heading" className="text-sm font-semibold">2. Expense Details</h3>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="e-desc">Description <span className="text-destructive">*</span></Label>
              <Input id="e-desc" value={form.description} onChange={setF('description')} placeholder="What was this expense for?" className="h-10 w-full min-w-0 text-sm sm:h-11" />
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="e-category">Category</Label>
                <Select value={form.category} onValueChange={setF('category')}>
                  <SelectTrigger id="e-category" className="h-10 w-full min-w-0 text-sm sm:h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from(new Set([...EXPENSE_CATEGORIES, form.category].filter(Boolean))).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="e-amt">Amount (PKR) <span className="text-destructive">*</span></Label>
                <Input id="e-amt" type="number" min="0" step="0.01" value={form.amount} onChange={setF('amount')} placeholder="0" className="h-10 w-full min-w-0 font-mono text-sm tabular-nums sm:h-11" aria-invalid={Boolean(formError)} aria-describedby={formError ? 'expense-form-error' : undefined} />
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="e-date">Date</Label>
                <Input id="e-date" type="date" value={form.date} onChange={setF('date')} className="expense-date-input" />
              </div>
            </div>
            <div><Label htmlFor="e-payee">Supplier / payee</Label><Input id="e-payee" value={form.v2.payee} onChange={setV2('payee')} /></div>
            <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="e-invoice">Invoice / reference</Label><Input id="e-invoice" value={form.v2.invoice} onChange={setV2('invoice')} /></div><div><Label htmlFor="e-boq">BOQ allocation</Label><Select value={form.v2.boqItemId || 'none'} onValueChange={(value) => setV2('boqItemId')(value === 'none' ? '' : value)}><SelectTrigger id="e-boq"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unallocated</SelectItem>{(tenders.find((item) => item.id === form.tenderRef)?.boqItems || []).filter((item) => item.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.description || item.name || item.id}</SelectItem>)}</SelectContent></Select></div></div>
            </section>
            <section className="space-y-3 border-t pt-4" aria-labelledby="expense-payments-heading">
              <h3 id="expense-payments-heading" className="text-sm font-semibold">3. Payments</h3>
              <p className="text-xs text-muted-foreground">Expense cost is recorded separately. Only dated ledger entries count as known payments.</p>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm"><span>Known paid: <strong>{expenseAmounts(form).paid === null ? 'Unknown' : formatCurrency(expenseAmounts(form).paid)}</strong></span><span>Outstanding: <strong>{expenseAmounts(form).payable === null ? 'Unknown' : formatCurrency(expenseAmounts(form).payable)}</strong></span></div>
            {form.v2.payments === undefined
              ? <div className="rounded-lg border p-3 text-sm"><p>Legacy payment history is unknown. Check bank records before starting a new ledger.</p><Button className="mt-2" variant="outline" onClick={() => setV2('payments')([])}>Start reconciled payment ledger</Button></div>
              : <>{!paymentOpen && <Button variant="outline" onClick={() => setPaymentOpen(true)}>Record a payment</Button>}{paymentOpen && <TransactionLedger title={form.v2.kind === 'owner-funding' ? 'Funding receipts' : 'Payments'} amountLabel="Payment amount" addLabel="Add Payment" events={form.v2.payments} limit={Number(form.amount) || 0} onChange={setV2('payments')} />}</>}
            </section>
            <section className="space-y-3 border-t pt-4" aria-labelledby="expense-notes-heading">
              <h3 id="expense-notes-heading" className="text-sm font-semibold">4. Notes &amp; Supporting Details</h3>
              <div><Label htmlFor="e-receipt">Receipt URL</Label><Input id="e-receipt" type="url" value={form.v2.receiptUrl} onChange={setV2('receiptUrl')} /></div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="e-note">Notes</Label>
              <Textarea id="e-note" value={form.note} onChange={setF('note')} rows={3} className="min-h-24 text-sm sm:min-h-28" />
            </div>
            </section>
          </fieldset>
          {formError && <p id="expense-form-error" role="alert" className="px-4 pb-2 text-sm text-destructive sm:px-6">{formError}</p>}
          <SheetFooter className="gap-2 border-t border-border bg-background px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:justify-end sm:px-6 sm:pb-4">
            <Button variant="outline" className="h-10 sm:h-11" onClick={requestClose}>{isAdmin ? 'Cancel' : 'Close'}</Button>
            {isAdmin && <Button className="h-10 sm:h-11" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Add Expense'}
            </Button>}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>Your changes to this expense have not been saved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { setDiscardOpen(false); setDialogOpen(false) }}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={async () => { await remove(deleteId); toast.success('Expense deleted'); setDeleteId(null) }} title="Delete expense" description="This will permanently remove this expense record." />
    </div>
  )
}
