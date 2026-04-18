import { useState, useMemo } from 'react'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { getInitials, CONTACT_CATEGORIES } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Search, Pencil, Trash2, Loader2, Users, Phone, Mail, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'

const EMPTY = { name: '', role: '', organization: '', category: 'Agency Officer', phone: '', whatsapp: '', email: '', address: '', notes: '' }

export default function Contacts() {
  const { data: contacts, loading } = useCollection('contacts', 'name', 'asc')
  const { add, update, remove } = useFirestoreCRUD('contacts')
  const { isAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [selected, setSelected] = useState(null)

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (filterCat !== 'All' && c.category !== filterCat) return false
      if (!search) return true
      const q = search.toLowerCase()
      return [c.name, c.role, c.organization, c.phone, c.email].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [contacts, search, filterCat])

  const openDialog = (item = null) => {
    setEditItem(item)
    setForm(item ? { ...EMPTY, ...item } : { ...EMPTY })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      if (editItem) { await update(editItem.id, form); toast.success('Contact updated'); setSelected({ id: editItem.id, ...form }) }
      else { await add(form); toast.success('Contact added') }
      setDialogOpen(false)
    } finally { setSaving(false) }
  }

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Manage your network of agencies, consultants, and suppliers"
        actions={isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add Contact</Button>}
      />

      {/* Filter + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-thin -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {['All', ...CONTACT_CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${filterCat === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No contacts found" description="Build your network by adding contacts." action={isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add Contact</Button>} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact list */}
          <div className="lg:col-span-2 space-y-2">
            {filtered.map((c) => (
              <Card
                key={c.id}
                className={`cursor-pointer hover:shadow-sm transition-all ${selected?.id === c.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelected(c)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">{getInitials(c.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.role}{c.organization ? ` — ${c.organization}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs hidden sm:inline-flex">{c.category}</Badge>
                    {c.phone && (
                      <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground">
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                    {(c.whatsapp || c.phone) && (
                      <a href={`https://wa.me/${(c.whatsapp || c.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300">
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Contact detail */}
          {selected && (
            <div className="lg:col-span-1">
              <Card className="sticky top-4">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">{getInitials(selected.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-foreground">{selected.name}</p>
                        <p className="text-xs text-muted-foreground">{selected.role}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openDialog(contacts.find((c) => c.id === selected.id))}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleteId(selected.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 text-sm">
                    {selected.organization && <DetailRow label="Organization" value={selected.organization} />}
                    <DetailRow label="Category" value={<Badge variant="secondary">{selected.category}</Badge>} />
                    {selected.phone && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24">Phone</span>
                        <a href={`tel:${selected.phone}`} className="text-primary hover:underline">{selected.phone}</a>
                      </div>
                    )}
                    {(selected.whatsapp || selected.phone) && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24">WhatsApp</span>
                        <a href={`https://wa.me/${(selected.whatsapp || selected.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline">
                          {selected.whatsapp || selected.phone}
                        </a>
                      </div>
                    )}
                    {selected.email && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24">Email</span>
                        <a href={`mailto:${selected.email}`} className="text-primary hover:underline truncate">{selected.email}</a>
                      </div>
                    )}
                    {selected.address && <DetailRow label="Address" value={selected.address} />}
                    {selected.notes && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm text-foreground bg-muted rounded-md p-2">{selected.notes}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? 'Edit Contact' : 'New Contact'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={setF('name')} placeholder="e.g. Ahmed Khan" />
            </div>
            <div className="space-y-1.5">
              <Label>Role / Title</Label>
              <Input value={form.role} onChange={setF('role')} placeholder="e.g. Project Manager" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={setF('category')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONTACT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Organization</Label>
              <Input value={form.organization} onChange={setF('organization')} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={setF('phone')} type="tel" placeholder="+92 300 0000000" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={setF('whatsapp')} type="tel" placeholder="Same as phone if blank" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={setF('email')} type="email" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={setF('address')} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={setF('notes')} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={async () => { await remove(deleteId); toast.success('Contact deleted'); setSelected(null); setDeleteId(null) }} title="Delete contact" description="This will permanently delete this contact." />
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}
