import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { formatDate, formatCurrency, TENDER_STATUSES, uid } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import { ArrowLeft, Save, Plus, Trash2, Loader2, CheckSquare, DollarSign, History, User } from 'lucide-react'
import { toast } from 'sonner'

export default function TenderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [tender, setTender] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'tenders', id))
        if (!snap.exists()) { navigate('/tenders'); return }
        const data = { id: snap.id, ...snap.data() }
        setTender(data)
        setForm(data)
      } catch {
        toast.error('Failed to load tender')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const updateForm = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const data = { ...form, value: Number(form.value) || 0 }
      // Record status change
      if (tender.status !== form.status) {
        data.statusHistory = [...(tender.statusHistory || []), {
          from: tender.status, to: form.status,
          date: new Date().toISOString().slice(0, 10),
          ts: Date.now(),
        }]
      }
      await updateDoc(doc(db, 'tenders', id), { ...data, updatedAt: serverTimestamp() })
      setTender(data)
      setDirty(false)
      toast.success('Tender saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Checklist helpers
  const addChecklistItem = () => {
    const item = { id: uid(), label: '', done: false }
    updateForm('checklist', [...(form.checklist || []), item])
  }
  const updateChecklistItem = (itemId, patch) => {
    updateForm('checklist', (form.checklist || []).map((c) => c.id === itemId ? { ...c, ...patch } : c))
  }
  const removeChecklistItem = (itemId) => {
    updateForm('checklist', (form.checklist || []).filter((c) => c.id !== itemId))
  }

  // Bills helpers
  const addBill = () => {
    updateForm('bills', [...(form.bills || []), { id: uid(), desc: '', amount: 0, date: '', status: 'Pending' }])
  }
  const updateBill = (billId, patch) => {
    updateForm('bills', (form.bills || []).map((b) => b.id === billId ? { ...b, ...patch } : b))
  }
  const removeBill = (billId) => {
    updateForm('bills', (form.bills || []).filter((b) => b.id !== billId))
  }

  // RA Bills helpers
  const addRABill = () => {
    updateForm('raBills', [...(form.raBills || []), { id: uid(), no: '', amount: 0, submitted: '', paid: '', status: 'Submitted' }])
  }
  const updateRABill = (billId, patch) => {
    updateForm('raBills', (form.raBills || []).map((b) => b.id === billId ? { ...b, ...patch } : b))
  }
  const removeRABill = (billId) => {
    updateForm('raBills', (form.raBills || []).filter((b) => b.id !== billId))
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (!tender) return null

  const checklist = form.checklist || []
  const doneCount = checklist.filter((c) => c.done).length
  const pct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0

  const billTotal = (form.bills || []).reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const billPaid = (form.bills || []).filter((b) => b.status === 'Paid').reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const raBillTotal = (form.raBills || []).reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const raBillPaid = (form.raBills || []).filter((b) => b.status === 'Paid').reduce((s, b) => s + (Number(b.amount) || 0), 0)

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Back + Save */}
      <div className="flex items-center justify-between gap-4">
        <Link to="/tenders">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Tenders
          </Button>
        </Link>
        {isAdmin && dirty && (
          <Button onClick={save} disabled={saving} size="sm">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Save className="h-4 w-4" /> Save Changes
          </Button>
        )}
      </div>

      {/* Header info */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
              <Label>Tender Name</Label>
              <Input value={form.name || ''} onChange={(e) => updateForm('name', e.target.value)} disabled={!isAdmin} className="text-base font-semibold" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || ''} onValueChange={(v) => updateForm('status', v)} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TENDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>NIT / Reference</Label>
              <Input value={form.nit || ''} onChange={(e) => updateForm('nit', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Value (PKR)</Label>
              <Input type="number" value={form.value || ''} onChange={(e) => updateForm('value', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Procuring Agency</Label>
              <Input value={form.agency || ''} onChange={(e) => updateForm('agency', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Submission Date</Label>
              <Input type="date" value={form.submissionDate || ''} onChange={(e) => updateForm('submissionDate', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Opening Date</Label>
              <Input type="date" value={form.openingDate || ''} onChange={(e) => updateForm('openingDate', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Linked Pay Order</Label>
              <Input value={form.linkedPO || ''} onChange={(e) => updateForm('linkedPO', e.target.value)} disabled={!isAdmin} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bills">Bills ({(form.bills || []).length})</TabsTrigger>
          <TabsTrigger value="rabills">RA Bills ({(form.raBills || []).length})</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
        </TabsList>

        {/* Overview tab: checklist + notes + history */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Checklist */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckSquare className="h-4 w-4" /> Checklist
                  {checklist.length > 0 && <span className="text-muted-foreground font-normal">{doneCount}/{checklist.length}</span>}
                </CardTitle>
                {isAdmin && <Button size="sm" variant="outline" onClick={addChecklistItem}><Plus className="h-3.5 w-3.5" /> Add Item</Button>}
              </div>
              {checklist.length > 0 && <Progress value={pct} className="h-1.5 mt-2" />}
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {checklist.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No checklist items yet.</p>}
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-3 group">
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={(v) => updateChecklistItem(item.id, { done: v })}
                    disabled={!isAdmin}
                  />
                  <Input
                    value={item.label}
                    onChange={(e) => updateChecklistItem(item.id, { label: e.target.value })}
                    disabled={!isAdmin}
                    className={`flex-1 border-0 shadow-none focus-visible:ring-0 p-0 h-auto bg-transparent ${item.done ? 'line-through text-muted-foreground' : ''}`}
                    placeholder="Checklist item…"
                  />
                  {isAdmin && (
                    <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 text-destructive" onClick={() => removeChecklistItem(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={form.notes || ''} onChange={(e) => updateForm('notes', e.target.value)} disabled={!isAdmin} rows={4} placeholder="Add notes about this tender…" />
            </CardContent>
          </Card>

          {/* Status History */}
          {(form.statusHistory || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4" /> Status History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {(form.statusHistory || []).map((h, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{formatDate(h.date)}</span>
                    <StatusBadge status={h.from} />
                    <span className="text-muted-foreground">→</span>
                    <StatusBadge status={h.to} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Bills tab */}
        <TabsContent value="bills" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold">{formatCurrency(billTotal)}</p><p className="text-xs text-muted-foreground">Total Billed</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold text-green-600">{formatCurrency(billPaid)}</p><p className="text-xs text-muted-foreground">Received</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold text-amber-600">{formatCurrency(billTotal - billPaid)}</p><p className="text-xs text-muted-foreground">Outstanding</p></CardContent></Card>
          </div>
          {isAdmin && <Button size="sm" onClick={addBill}><Plus className="h-3.5 w-3.5" /> Add Bill</Button>}
          {(form.bills || []).map((bill) => (
            <Card key={bill.id}>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input value={bill.desc} onChange={(e) => updateBill(bill.id, { desc: e.target.value })} disabled={!isAdmin} placeholder="Bill description" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount (PKR)</Label>
                    <Input type="number" value={bill.amount} onChange={(e) => updateBill(bill.id, { amount: Number(e.target.value) })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={bill.date} onChange={(e) => updateBill(bill.id, { date: e.target.value })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={bill.status} onValueChange={(v) => updateBill(bill.id, { status: v })} disabled={!isAdmin}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => removeBill(bill.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {(form.bills || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No bills added yet.</p>}
        </TabsContent>

        {/* RA Bills tab */}
        <TabsContent value="rabills" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold">{formatCurrency(raBillTotal)}</p><p className="text-xs text-muted-foreground">Total RA Billed</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold text-green-600">{formatCurrency(raBillPaid)}</p><p className="text-xs text-muted-foreground">Received</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold text-amber-600">{formatCurrency(raBillTotal - raBillPaid)}</p><p className="text-xs text-muted-foreground">Outstanding</p></CardContent></Card>
          </div>
          {isAdmin && <Button size="sm" onClick={addRABill}><Plus className="h-3.5 w-3.5" /> Add RA Bill</Button>}
          {(form.raBills || []).map((bill) => (
            <Card key={bill.id}>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Bill No.</Label>
                    <Input value={bill.no} onChange={(e) => updateRABill(bill.id, { no: e.target.value })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount (PKR)</Label>
                    <Input type="number" value={bill.amount} onChange={(e) => updateRABill(bill.id, { amount: Number(e.target.value) })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Submitted</Label>
                    <Input type="date" value={bill.submitted} onChange={(e) => updateRABill(bill.id, { submitted: e.target.value })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Paid Date</Label>
                    <Input type="date" value={bill.paid} onChange={(e) => updateRABill(bill.id, { paid: e.target.value })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={bill.status} onValueChange={(v) => updateRABill(bill.id, { status: v })} disabled={!isAdmin}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Submitted', 'Under Review', 'Paid', 'Rejected'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => removeRABill(bill.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {(form.raBills || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No RA bills yet.</p>}
        </TabsContent>

        {/* Contact tab */}
        <TabsContent value="contact" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><User className="h-4 w-4" /> Contact Person</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {['name', 'phone', 'email', 'role'].map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label className="capitalize">{field}</Label>
                  <Input
                    value={(form.contactPerson || {})[field] || ''}
                    onChange={(e) => updateForm('contactPerson', { ...(form.contactPerson || {}), [field]: e.target.value })}
                    disabled={!isAdmin}
                  />
                </div>
              ))}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={(form.contactPerson || {}).notes || ''}
                  onChange={(e) => updateForm('contactPerson', { ...(form.contactPerson || {}), notes: e.target.value })}
                  disabled={!isAdmin}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating save for mobile */}
      {isAdmin && dirty && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button onClick={save} disabled={saving} size="lg" className="shadow-lg">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  )
}
