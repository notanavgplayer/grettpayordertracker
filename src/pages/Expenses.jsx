import { useState, useMemo } from 'react'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatDate, EXPENSE_CATEGORIES } from '@/lib/utils'
import { exportExpensesCSV } from '@/lib/export'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import MetricCard from '@/components/shared/MetricCard'
import { PageTableSkeleton } from '@/components/shared/LoadingSkeletons'
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
  const { data: expenses, loading } = useCollection('expenses', 'date', 'desc')
  const { add, update, remove } = useFirestoreCRUD('expenses')
  const { isAdmin } = useAuth()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'month'

  const now = new Date()
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
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleString('default', { month: 'short' })
      const total = expenses.filter((e) => (e.date || '').startsWith(key)).reduce((s, e) => s + (Number(e.amount) || 0), 0)
      result.push({ month: label, total })
    }
    return result
  }, [expenses])

  const openDialog = (item = null) => {
    setEditItem(item)
    setForm(item ? { description: item.description || '', category: item.category || EXPENSE_CATEGORIES[0], amount: item.amount || '', date: item.date || '', tenderId: item.tenderId || '', note: item.note || '' } : { ...EMPTY, date: now.toISOString().slice(0, 10) })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.description) { toast.error('Description is required'); return }
    setSaving(true)
    try {
      const data = { ...form, amount: Number(form.amount) || 0 }
      if (editItem) { await update(editItem.id, data); toast.success('Expense updated') }
      else { await add(data); toast.success('Expense added') }
      setDialogOpen(false)
    } finally { setSaving(false) }
  }

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))

  if (loading) return <PageTableSkeleton rows={6} cols={5} metrics={3} />

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
            <Card>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Description</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Tender</TableHead>
                    {isAdmin && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayExpenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm font-medium max-w-[200px] truncate">{e.description}</TableCell>
                      <TableCell className="hidden sm:table-cell"><Badge variant="secondary" className="text-xs font-normal">{e.category}</Badge></TableCell>
                      <TableCell className="text-sm font-mono tabular-nums font-semibold text-right">{formatCurrency(e.amount)}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(e.date)}</TableCell>
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
                      stroke="hsl(var(--card))"
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
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Expense Sheet */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>{editItem ? 'Edit Expense' : 'New Expense'}</SheetTitle>
            <SheetDescription>
              {editItem ? 'Update expense details.' : 'Record a new project expense.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="e-desc">Description <span className="text-destructive">*</span></Label>
              <Input id="e-desc" value={form.description} onChange={setF('description')} placeholder="What was this expense for?" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={setF('category')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-amt">Amount (PKR)</Label>
                <Input id="e-amt" type="number" value={form.amount} onChange={setF('amount')} placeholder="0" className="font-mono tabular-nums" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="e-date">Date</Label>
                <Input id="e-date" type="date" value={form.date} onChange={setF('date')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-tender">Related Tender</Label>
                <Input id="e-tender" value={form.tenderId} onChange={setF('tenderId')} placeholder="Tender / NIT" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-note">Notes</Label>
              <Textarea id="e-note" value={form.note} onChange={setF('note')} rows={3} />
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
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
