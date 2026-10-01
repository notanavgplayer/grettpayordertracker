import { useState, useMemo } from 'react'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'
import ChartTooltip, { CHART_COLORS, AXIS_TICK } from '@/components/shared/ChartTooltip'
import { Plus, Download, Pencil, Trash2, Loader2, Receipt, TrendingUp, Calendar, Tag, MoreHorizontal } from 'lucide-react'
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
      return `${e.description} ${e.category} ${e.v2?.payee || ''}`.toLowerCase().includes(search.toLowerCase())
    })
  }, [expenses, filter, thisMonthStr, projectFilter, paymentFilter, search])

  const thisMonthExpenses = useMemo(() => expenses.filter((e) => (e.date || '').startsWith(thisMonthStr)), [expenses, thisMonthStr])

  const totalAll = expenses.reduce((s, e) => s + expenseAmounts(e).incurred, 0)
  const totalMonth = thisMonthExpenses.reduce((s, e) => s + expenseAmounts(e).incurred, 0)
  const supplierDue = expenses.reduce((s, e) => s + (expenseAmounts(e).payable ?? 0), 0)
  const unknownPayments = expenses.filter((e) => expenseAmounts(e).payable === null).length

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
    setEditItem(item)
    setForm(item ? { ...EMPTY, ...item, amount: item.amount ?? '', tenderRef: projectId(item), v2: { ...EMPTY.v2, ...item.v2, payments: item.v2?.payments } } : { ...EMPTY, v2: { ...EMPTY.v2 }, date: now.toISOString().slice(0, 10) })
    setDialogOpen(true)
  }

  const handleSave = async () => {
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
    try {
      const { payments, ...otherV2 } = form.v2
      const data = { description: form.description.trim(), category: form.category, amount,
        date: form.date, tenderId: form.tenderRef || '', tenderRef: form.tenderRef || '',
        note: form.note, v2: payments === undefined ? otherV2 : { ...otherV2, payments } }
      if (editItem) { await update(editItem.id, data); toast.success('Expense updated') }
      else { await add(data); toast.success('Expense added') }
      setDialogOpen(false)
    } finally { setSaving(false) }
  }

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))
  const setV2 = (k) => (e) => setForm((p) => ({ ...p, v2: { ...p.v2, [k]: e.target?.value ?? e } }))

  if (loading) return <PageTableSkeleton rows={6} cols={5} metrics={3} />
  if (error) return <LoadState title="Could not load expenses" error={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Project costs, supplier dues and payment history"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportExpensesCSV(displayExpenses)}><Download className="h-4 w-4" /> Export</Button>
            {isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add Expense</Button>}
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard icon={Calendar} title="Costs this month" value={formatCurrency(totalMonth)} delta={`${thisMonthExpenses.length} entries`} deltaPositive={null} />
        <MetricCard icon={TrendingUp} title="Costs recorded" value={formatCurrency(totalAll)} delta={`${expenses.length} entries`} deltaPositive={null} />
        <MetricCard icon={Tag} title="Known supplier dues" value={formatCurrency(supplierDue)} delta={`${unknownPayments} legacy payment histories unknown`} deltaPositive={null} />
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
              <button key={val} onClick={() => setFilter(val)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === val ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>{label}</button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Search description or payee" placeholder="Search description or payee" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={projectFilter} onValueChange={setProjectFilter}><SelectTrigger aria-label="Filter project"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All scopes</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{tenders.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}><SelectTrigger aria-label="Filter payment status"><SelectValue /></SelectTrigger><SelectContent>{[['all','All payments'],['unknown','Legacy payment unknown'],['unpaid','Unpaid'],['partial','Partially paid'],['paid','Paid']].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          </div>
          {displayExpenses.length === 0 ? (
            <EmptyState icon={Receipt} title="No expenses" description="Start tracking your project expenses." action={isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add Expense</Button>} />
          ) : (
            <Card className="overflow-hidden">
              {/* Mobile: card per row */}
              <div className="md:hidden p-3 space-y-3 bg-muted/30">
                {displayExpenses.map((e) => (
                  <Card key={e.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground break-words">{e.description}</p>
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs font-normal">{e.category}</Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(e.date)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-sm font-mono tabular-nums font-semibold text-foreground whitespace-nowrap">{formatCurrency(e.amount)}</span>
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
                      {projectId(e) && (
                        <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                          <span className="font-medium">Project:</span> {tenders.find((tender) => tender.id === projectId(e))?.name || e.tenderId}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{expenseAmounts(e).paid === null ? 'Payment history unknown' : expenseAmounts(e).payable > 0 ? `${formatCurrency(expenseAmounts(e).payable)} due` : 'Settled'}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop: table */}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Payable</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Tender</TableHead>
                    {isAdmin && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayExpenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm font-medium max-w-[260px] truncate">{e.description}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs font-normal">{e.category}</Badge></TableCell>
                      <TableCell className="text-sm font-mono tabular-nums font-semibold text-right">{formatCurrency(e.amount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm font-mono tabular-nums">{expenseAmounts(e).payable === null ? 'Unknown' : formatCurrency(expenseAmounts(e).payable)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(e.date)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{tenders.find((tender) => tender.id === projectId(e))?.name || e.tenderId || 'Firm / unassigned'}</TableCell>
                      {isAdmin && (
                        <TableCell>
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
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
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
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent side="right" className="flex w-full min-w-0 flex-col gap-0 overflow-x-hidden p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
            <SheetTitle>{editItem ? 'Edit Expense' : 'New Expense'}</SheetTitle>
            <SheetDescription>
              {editItem ? 'Update expense details.' : 'Record a new project expense.'}
            </SheetDescription>
          </SheetHeader>
          <div className="min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-4 sm:space-y-4 sm:px-6 sm:py-5">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="e-desc">Description <span className="text-destructive">*</span></Label>
              <Input id="e-desc" value={form.description} onChange={setF('description')} placeholder="What was this expense for?" className="h-10 w-full min-w-0 text-sm sm:h-11" />
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="e-category">Category</Label>
                <Select value={form.category} onValueChange={setF('category')}>
                  <SelectTrigger id="e-category" className="h-10 w-full min-w-0 text-sm sm:h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="e-amt">Amount (PKR)</Label>
                <Input id="e-amt" type="number" min="0" step="0.01" value={form.amount} onChange={setF('amount')} placeholder="0" className="h-10 w-full min-w-0 font-mono text-sm tabular-nums sm:h-11" aria-invalid={Boolean(formError)} aria-describedby={formError ? 'expense-form-error' : undefined} />
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="e-date">Date</Label>
                <Input id="e-date" type="date" value={form.date} onChange={setF('date')} className="expense-date-input" />
              </div>
              <div className="min-w-0 space-y-1.5"><Label htmlFor="e-project-search">Project / tender</Label><Input id="e-project-search" placeholder="Search projects" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} /><Select value={form.tenderRef || 'firm'} onValueChange={(value) => setF('tenderRef')(value === 'firm' ? '' : value)}><SelectTrigger aria-label="Select project"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="firm">Firm / unassigned</SelectItem>{tenders.filter((item) => item.name?.toLowerCase().includes(projectSearch.toLowerCase()) || item.id === form.tenderRef).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="e-kind">Type</Label><Select value={form.v2.kind} onValueChange={setV2('kind')}><SelectTrigger id="e-kind"><SelectValue /></SelectTrigger><SelectContent>{[['cost','Project cost'],['overhead','Firm overhead'],['advance','Advance'],['deposit','Refundable deposit'],['transfer','Transfer'],['owner-funding','Owner funding']].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="e-payee">Supplier / payee</Label><Input id="e-payee" value={form.v2.payee} onChange={setV2('payee')} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="e-invoice">Invoice / reference</Label><Input id="e-invoice" value={form.v2.invoice} onChange={setV2('invoice')} /></div><div><Label htmlFor="e-boq">BOQ allocation</Label><Select value={form.v2.boqItemId || 'none'} onValueChange={(value) => setV2('boqItemId')(value === 'none' ? '' : value)}><SelectTrigger id="e-boq"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unallocated</SelectItem>{(tenders.find((item) => item.id === form.tenderRef)?.boqItems || []).filter((item) => item.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.description || item.name || item.id}</SelectItem>)}</SelectContent></Select></div></div>
            <div><Label htmlFor="e-receipt">Receipt URL</Label><Input id="e-receipt" type="url" value={form.v2.receiptUrl} onChange={setV2('receiptUrl')} /></div>
            {form.v2.payments === undefined
              ? <div className="rounded-lg border p-3 text-sm"><p>Legacy payment history is unknown. Check bank records before starting a new ledger.</p><Button className="mt-2" variant="outline" onClick={() => setV2('payments')([])}>Start reconciled payment ledger</Button></div>
              : <TransactionLedger title={form.v2.kind === 'owner-funding' ? 'Funding receipts' : 'Payments'} events={form.v2.payments} limit={Number(form.amount) || 0} onChange={setV2('payments')} />}
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="e-note">Notes</Label>
              <Textarea id="e-note" value={form.note} onChange={setF('note')} rows={3} className="min-h-24 text-sm sm:min-h-28" />
            </div>
          </div>
          {formError && <p id="expense-form-error" role="alert" className="px-4 pb-2 text-sm text-destructive sm:px-6">{formError}</p>}
          <SheetFooter className="gap-2 border-t border-border bg-background px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:justify-end sm:px-6 sm:pb-4">
            <Button variant="outline" className="h-10 sm:h-11" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="h-10 sm:h-11" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Add Expense'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={async () => { await remove(deleteId); toast.success('Expense deleted'); setDeleteId(null) }} title="Delete expense" description="This will permanently remove this expense record." />
    </div>
  )
}
