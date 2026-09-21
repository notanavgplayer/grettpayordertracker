import { useState, useMemo } from 'react'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatDate, EXPENSE_CATEGORIES } from '@/lib/utils'
import { exportExpensesCSV } from '@/lib/export'
import { nonNegativeNumber } from '@/lib/data'
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

const EMPTY = { description: '', category: EXPENSE_CATEGORIES[0], amount: '', date: '', tenderId: '', note: '' }

export default function Expenses() {
  const { data: expenses, loading, error } = useCollection('expenses', 'date', 'desc')
  const { add, update, remove } = useFirestoreCRUD('expenses')
  const { isAdmin } = useAuth()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'month'
  const [formError, setFormError] = useState('')

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const displayExpenses = useMemo(() => {
    if (filter === 'month') return expenses.filter((e) => (e.date || '').startsWith(thisMonthStr))
    return expenses
  }, [expenses, filter, thisMonthStr])

  const thisMonthExpenses = useMemo(() => expenses.filter((e) => (e.date || '').startsWith(thisMonthStr)), [expenses, thisMonthStr])

  const totalAll = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const totalMonth = thisMonthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  const topCat = useMemo(() => {
    const map = {}
    for (const e of thisMonthExpenses) { map[e.category] = (map[e.category] || 0) + (Number(e.amount) || 0) }
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
  }, [thisMonthExpenses])

  // Category chart
  const catData = useMemo(() => {
    const map = {}
    for (const e of displayExpenses) { map[e.category] = (map[e.category] || 0) + (Number(e.amount) || 0) }
    return Object.entries(map).map(([name, value], i) => ({ name: name.split('/')[0].trim(), value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] })).sort((a, b) => b.value - a.value)
  }, [displayExpenses])

  // Monthly trend (last 6 months)
  const monthlyData = useMemo(() => {
    const result = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleString('default', { month: 'short' })
      const total = expenses.filter((e) => (e.date || '').startsWith(key)).reduce((s, e) => s + (Number(e.amount) || 0), 0)
      result.push({ month: label, total })
    }
    return result
  }, [currentMonth, currentYear, expenses])

  const openDialog = (item = null) => {
    setEditItem(item)
    setForm(item ? { description: item.description || '', category: item.category || EXPENSE_CATEGORIES[0], amount: item.amount || '', date: item.date || '', tenderId: item.tenderId || '', note: item.note || '' } : { ...EMPTY, date: now.toISOString().slice(0, 10) })
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
    setFormError('')
    setSaving(true)
    try {
      const data = { ...form, description: form.description.trim(), amount }
      if (editItem) { await update(editItem.id, data); toast.success('Expense updated') }
      else { await add(data); toast.success('Expense added') }
      setDialogOpen(false)
    } finally { setSaving(false) }
  }

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))

  if (loading) return <PageTableSkeleton rows={6} cols={5} metrics={3} />
  if (error) return <LoadState title="Could not load expenses" error={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track and analyze project expenses"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportExpensesCSV(displayExpenses)}><Download className="h-4 w-4" /> Export</Button>
            {isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add Expense</Button>}
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard icon={Calendar}   title="This Month"      value={formatCurrency(totalMonth)} delta={`${thisMonthExpenses.length} entries`} deltaPositive={null} />
        <MetricCard icon={TrendingUp} title="All Time Total"  value={formatCurrency(totalAll)}   delta={`${expenses.length} entries`} deltaPositive={null} />
        <MetricCard icon={Tag}        title="Top Category"    value={topCat} mono={false} delta="This month" deltaPositive={null} className="hidden sm:flex" />
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
                      {e.tenderId && (
                        <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                          <span className="font-medium">Tender:</span> <span className="font-mono">{e.tenderId}</span>
                        </div>
                      )}
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
                      <TableCell className="text-sm text-muted-foreground">{formatDate(e.date)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{e.tenderId || '—'}</TableCell>
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
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="e-tender">Related Tender</Label>
                <Input id="e-tender" value={form.tenderId} onChange={setF('tenderId')} placeholder="Tender / NIT" className="h-10 w-full min-w-0 text-sm sm:h-11" />
              </div>
            </div>
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
