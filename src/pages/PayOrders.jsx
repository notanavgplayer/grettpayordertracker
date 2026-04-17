import { useState, useMemo } from 'react'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { exportPayOrdersCSV, exportPayOrdersPDF } from '@/lib/export'
import { formatCurrency, formatDate, PO_STATUSES, BID_RESULTS, BANKS } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import MetricCard from '@/components/shared/MetricCard'
import PayOrderQuickView from '@/components/shared/PayOrderQuickView'
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
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts'
import ChartTooltip, { AXIS_TICK, CHART_SEMANTIC } from '@/components/shared/ChartTooltip'
import {
  Plus, FileText, Download, Printer, Search, Pencil, Trash2,
  Loader2, TrendingUp, DollarSign, AlertCircle, CheckCircle, MoreHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { serverTimestamp } from 'firebase/firestore'

const EMPTY_PO = { po: '', bank: '', nit: '', amount: '', tender: '', agency: '', submitted: '', status: 'Pending', bidResult: 'N/A', notes: '' }

export default function PayOrders() {
  const { data: payOrders, loading } = useCollection('payOrders', 'createdAt', 'desc')
  const { data: activityLog } = useCollection('activityLog', 'createdAt', 'desc')
  const { add, update, remove } = useFirestoreCRUD('payOrders')
  const { add: addLog, update: updateLog, remove: removeLog } = useFirestoreCRUD('activityLog')
  const { isAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_PO)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [quickView, setQuickView] = useState(null)

  // Activity log state
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [editLog, setEditLog] = useState(null)
  const [logForm, setLogForm] = useState({ date: '', po: '', ref: '', action: '', next: '', by: '' })
  const [savingLog, setSavingLog] = useState(false)
  const [deleteLogId, setDeleteLogId] = useState(null)

  const filtered = useMemo(() => {
    return payOrders.filter((p) => {
      if (filterStatus !== 'All' && p.status !== filterStatus) return false
      if (!search) return true
      const q = search.toLowerCase()
      return [p.po, p.tender, p.agency, p.nit, p.bank].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [payOrders, search, filterStatus])

  // Summary stats
  const total = payOrders.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const atRisk = payOrders.filter((p) => p.status === 'Submitted').length
  const returned = payOrders.filter((p) => p.status === 'Returned').length
  const encashed = payOrders.filter((p) => p.status === 'Encashed').length

  // Chart data
  const statusChart = PO_STATUSES.map((s) => ({
    status: s,
    count: payOrders.filter((p) => p.status === s).length,
  })).filter((d) => d.count > 0)

  const winData = [
    { name: 'Won', value: payOrders.filter((p) => p.bidResult === 'Won').length, color: CHART_SEMANTIC.positive },
    { name: 'Lost', value: payOrders.filter((p) => p.bidResult === 'Lost').length, color: CHART_SEMANTIC.negative },
    { name: 'Active', value: payOrders.filter((p) => ['N/A', 'Awaiting'].includes(p.bidResult)).length, color: CHART_SEMANTIC.neutral },
  ].filter((d) => d.value > 0)

  const openDialog = (item = null) => {
    setEditItem(item)
    setForm(item ? { ...EMPTY_PO, ...item } : { ...EMPTY_PO, submitted: new Date().toISOString().slice(0, 10) })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.po) { toast.error('PO number is required'); return }
    setSaving(true)
    try {
      const data = { ...form, amount: Number(form.amount) || 0 }
      if (editItem) {
        await update(editItem.id, data)
        toast.success('Pay order updated')
      } else {
        await add(data)
        toast.success('Pay order added')
      }
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    await remove(deleteId)
    toast.success('Pay order deleted')
    setDeleteId(null)
  }

  const openLogDialog = (item = null) => {
    setEditLog(item)
    setLogForm(item
      ? { date: item.date || '', po: item.po || '', ref: item.ref || '', action: item.action || '', next: item.next || '', by: item.by || '' }
      : { date: new Date().toISOString().slice(0, 10), po: '', ref: '', action: '', next: '', by: '' }
    )
    setLogDialogOpen(true)
  }

  const handleSaveLog = async () => {
    if (!logForm.action) { toast.error('Action is required'); return }
    setSavingLog(true)
    try {
      if (editLog) { await updateLog(editLog.id, logForm); toast.success('Log updated') }
      else { await addLog(logForm); toast.success('Log entry added') }
      setLogDialogOpen(false)
    } finally { setSavingLog(false) }
  }

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))
  const setLF = (k) => (e) => setLogForm((p) => ({ ...p, [k]: e.target?.value ?? e }))

  if (loading) return <PageTableSkeleton rows={8} cols={6} metrics={4} />

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Pay Orders"
        description="Manage all pay order entries and activity logs"
        actions={
          isAdmin && (
            <Button onClick={() => openDialog()} className="gap-2">
              <Plus className="h-4 w-4" /> Add Pay Order
            </Button>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign}   title="Total Amount"   value={formatCurrency(total)} />
        <MetricCard icon={FileText}     title="Total Entries"  value={payOrders.length} mono={false} delta={`${returned} returned`} deltaPositive={null} />
        <MetricCard icon={AlertCircle}  title="At Risk"        value={atRisk} mono={false} delta={atRisk > 0 ? 'Submitted, awaiting result' : 'All clear'} deltaPositive={atRisk === 0} />
        <MetricCard icon={CheckCircle}  title="Encashed"       value={encashed} mono={false} delta={encashed > 0 ? `${Math.round((encashed / (payOrders.length || 1)) * 100)}% of total` : undefined} deltaPositive={null} />
      </div>

      {/* Charts */}
      {payOrders.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Status Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={statusChart} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis dataKey="status" type="category" tick={AXIS_TICK} width={70} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} content={<ChartTooltip />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Bid Results</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={winData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {winData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs: Pay Orders | Activity Log */}
      <Tabs defaultValue="payorders">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <TabsList>
            <TabsTrigger value="payorders">Pay Orders</TabsTrigger>
            <TabsTrigger value="activity">Activity Log</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 flex-1 sm:ml-auto">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="icon" title="Export CSV" onClick={() => { if (!exportPayOrdersCSV(filtered)) toast.error('Nothing to export') }}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" title="Export PDF" onClick={() => { if (!exportPayOrdersPDF(filtered)) toast.error('Nothing to export') }}>
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="payorders" className="mt-4">
          {/* Filter chips */}
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-thin -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
            {['All', ...PO_STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {s} {s !== 'All' && <span className="font-mono tabular-nums">({payOrders.filter((p) => p.status === s).length})</span>}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={FileText} title="No pay orders found" description="Add your first pay order to get started." action={isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add Pay Order</Button>} />
          ) : (
            <>
              {/* Mobile: card-per-row */}
              <div className="md:hidden space-y-3">
                {filtered.map((p) => (
                  <Card key={p.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => setQuickView(p)} className="min-w-0 flex-1 text-left">
                          <p className="font-mono text-sm font-semibold text-foreground truncate hover:underline">{p.po || '—'}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{p.bank || '—'}{p.submitted ? ` · ${formatDate(p.submitted)}` : ''}</p>
                        </button>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <StatusBadge status={p.status} />
                          {isAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openDialog(p)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteId(p.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>

                      {(p.tender || p.agency) && (
                        <div className="space-y-0.5">
                          {p.tender && <p className="text-sm font-medium text-foreground break-words">{p.tender}</p>}
                          {p.agency && <p className="text-xs text-muted-foreground break-words">{p.agency}</p>}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs pt-2 border-t border-border">
                        <div className="min-w-0">
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-mono tabular-nums font-semibold text-foreground truncate">{formatCurrency(p.amount)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-muted-foreground">NIT/Ref</p>
                          <p className="font-mono text-foreground truncate">{p.nit || '—'}</p>
                        </div>
                        <div className="col-span-2 flex items-center justify-between gap-2 pt-1">
                          <span className="text-muted-foreground">Bid Result</span>
                          <StatusBadge status={p.bidResult} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop: table */}
              <Card className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">PO #</TableHead>
                      <TableHead className="text-xs">Bank</TableHead>
                      <TableHead className="text-xs">NIT/Ref</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Tender</TableHead>
                      <TableHead className="text-xs">Agency</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Submitted</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Bid Result</TableHead>
                      {isAdmin && <TableHead className="w-12"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs font-medium">
                          <button type="button" onClick={() => setQuickView(p)} className="hover:underline text-left">{p.po || '—'}</button>
                        </TableCell>
                        <TableCell className="text-xs">{p.bank || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{p.nit || '—'}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs min-w-[160px] max-w-[220px] whitespace-normal break-words">{p.tender || '—'}</TableCell>
                        <TableCell className="text-xs min-w-[140px] max-w-[200px] whitespace-normal break-words">{p.agency || '—'}</TableCell>
                        <TableCell className="text-xs font-mono tabular-nums text-right whitespace-nowrap">{formatCurrency(p.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.submitted)}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                        <TableCell className="hidden lg:table-cell"><StatusBadge status={p.bidResult} /></TableCell>
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
                                <DropdownMenuItem onClick={() => openDialog(p)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteId(p.id)}
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
            </>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="flex justify-end mb-4">
            {isAdmin && <Button size="sm" onClick={() => openLogDialog()}><Plus className="h-4 w-4" /> Add Entry</Button>}
          </div>
          {activityLog.length === 0 ? (
            <EmptyState icon={FileText} title="No activity logged" description="Track your follow-up actions here." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead className="hidden sm:table-cell">Reference</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden md:table-cell">Next Step</TableHead>
                    <TableHead className="hidden lg:table-cell">By</TableHead>
                    {isAdmin && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLog.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(l.date)}</TableCell>
                      <TableCell className="font-mono text-sm">{l.po || '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm font-mono">{l.ref || '—'}</TableCell>
                      <TableCell className="text-sm">{l.action || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{l.next || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{l.by || '—'}</TableCell>
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
                              <DropdownMenuItem onClick={() => openLogDialog(l)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteLogId(l.id)}
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
      </Tabs>

      {/* Pay Order Sheet */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>{editItem ? 'Edit Pay Order' : 'New Pay Order'}</SheetTitle>
            <SheetDescription>
              {editItem ? 'Update pay order details.' : 'Record a new pay order entry.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label={<>PO Number <span className="text-destructive">*</span></>} value={form.po} onChange={setF('po')} placeholder="PO-2024-001" className="font-mono" />
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Select value={form.bank} onValueChange={setF('bank')}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>{BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="NIT / Reference" value={form.nit} onChange={setF('nit')} className="font-mono" />
              <Field label="Amount (PKR)" type="number" value={form.amount} onChange={setF('amount')} placeholder="0" className="font-mono tabular-nums" />
            </div>
            <Field label="Tender / Project" value={form.tender} onChange={setF('tender')} />
            <Field label="Agency" value={form.agency} onChange={setF('agency')} />
            <Field label="Date Submitted" type="date" value={form.submitted} onChange={setF('submitted')} />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={setF('status')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bid Result</Label>
                <Select value={form.bidResult} onValueChange={setF('bidResult')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BID_RESULTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={setF('notes')} rows={4} placeholder="Optional remarks…" />
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Add Pay Order'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Activity Log Sheet */}
      <Sheet open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>{editLog ? 'Edit Log Entry' : 'New Log Entry'}</SheetTitle>
            <SheetDescription>Track a follow-up action for this pay order.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date" type="date" value={logForm.date} onChange={setLF('date')} />
              <Field label="PO Number" value={logForm.po} onChange={setLF('po')} className="font-mono" />
            </div>
            <Field label="Reference" value={logForm.ref} onChange={setLF('ref')} className="font-mono" />
            <Field label={<>Action <span className="text-destructive">*</span></>} value={logForm.action} onChange={setLF('action')} placeholder="What was done?" />
            <Field label="Next Step" value={logForm.next} onChange={setLF('next')} placeholder="What needs to happen next?" />
            <Field label="By" value={logForm.by} onChange={setLF('by')} placeholder="Who performed this?" />
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setLogDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveLog} disabled={savingLog}>
              {savingLog && <Loader2 className="h-4 w-4 animate-spin" />}
              {editLog ? 'Save Changes' : 'Add Entry'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <PayOrderQuickView
        payOrder={quickView}
        open={!!quickView}
        onOpenChange={(v) => !v && setQuickView(null)}
        canEdit={isAdmin}
        onEdit={() => { const p = quickView; setQuickView(null); openDialog(p) }}
      />

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete pay order" description="This will permanently remove the pay order record." />
      <ConfirmDelete open={!!deleteLogId} onOpenChange={() => setDeleteLogId(null)} onConfirm={async () => { await removeLog(deleteLogId); toast.success('Log deleted'); setDeleteLogId(null) }} title="Delete log entry" description="This will remove this activity log entry." />
    </div>
  )
}

function Field({ label, className, inputClassName, ...props }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input className={className} {...props} />
    </div>
  )
}
