import { useState, useMemo } from 'react'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatDate, EXPENSE_CATEGORIES } from '@/lib/utils'
import { exportExpensesCSV } from '@/lib/export'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { Plus, Download, Pencil, Trash2, Loader2, Receipt, TrendingUp, Calendar } from 'lucide-react'
import { toast } from 'sonner'

const CATEGORY_COLORS = [
  '#0f2a4a', '#e8940a', '#185fa5', '#0e6b4a', '#c0392b',
  '#5d3fa5', '#2d5f9e', '#d68910', '#1a5276', '#6b7a90',
]

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

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalMonth)}</p>
          <p className="text-xs text-muted-foreground">This Month</p>
          <p className="text-xs text-muted-foreground mt-0.5">{thisMonthExpenses.length} entries</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalAll)}</p>
          <p className="text-xs text-muted-foreground">All Time Total</p>
          <p className="text-xs text-muted-foreground mt-0.5">{expenses.length} entries</p>
        </CardContent></Card>
        <Card className="hidden sm:block"><CardContent className="p-4">
          <p className="text-base font-bold text-foreground truncate">{topCat}</p>
          <p className="text-xs text-muted-foreground">Top Category (Month)</p>
        </CardContent></Card>
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
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Tender</TableHead>
                    {isAdmin && <TableHead className="w-20">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayExpenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm font-medium max-w-[200px] truncate">{e.description}</TableCell>
                      <TableCell className="hidden sm:table-cell"><Badge variant="secondary" className="text-xs">{e.category}</Badge></TableCell>
                      <TableCell className="text-sm font-semibold">{formatCurrency(e.amount)}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(e.date)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{e.tenderId || '—'}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => openDialog(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
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
                    <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name }) => name}>
                      {catData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Trend (6 months)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData} margin={{ left: 8 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Bar dataKey="total" fill="hsl(213 65% 18%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Edit Expense' : 'New Expense'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input value={form.description} onChange={setF('description')} placeholder="What was this expense for?" />
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
                <Label>Amount (PKR)</Label>
                <Input type="number" value={form.amount} onChange={setF('amount')} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={setF('date')} />
              </div>
              <div className="space-y-1.5">
                <Label>Related Tender</Label>
                <Input value={form.tenderId} onChange={setF('tenderId')} placeholder="Tender name / NIT" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.note} onChange={setF('note')} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Add Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={async () => { await remove(deleteId); toast.success('Expense deleted'); setDeleteId(null) }} title="Delete expense" description="This will permanently remove this expense record." />
    </div>
  )
}
