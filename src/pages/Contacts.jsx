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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Users,
  Phone,
  Mail,
  MessageCircle,
  Building2,
  Briefcase,
  Landmark,
  UserRound,
  Folder,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

const EMPTY = { name: '', role: '', organization: '', category: 'Agency Officer', phone: '', whatsapp: '', email: '', address: '', notes: '' }
const TYPE_FILTERS = ['All', 'Agency', 'Vendor', 'Bank', 'Officer', 'Contractor']

function getContactType(contact = {}) {
  const text = `${contact.category || ''} ${contact.organization || ''} ${contact.name || ''} ${contact.role || ''}`.toLowerCase()
  if (text.includes('bank')) return 'Bank'
  if (text.includes('vendor') || text.includes('supplier')) return 'Vendor'
  if (text.includes('subcontractor') || text.includes('contractor')) return 'Contractor'
  if (text.includes('officer')) return 'Officer'
  if (text.includes('agency') || text.includes('department') || text.includes('authority')) return 'Agency'
  return contact.category || 'Other'
}

function getLinkedProject(contact = {}) {
  return contact.linkedTender || contact.linkedProject || contact.tender || contact.project || contact.projectName || ''
}

function getContactTimestamp(contact = {}) {
  const value = contact.updatedAt || contact.createdAt
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function getTypeClasses(type) {
  const tones = {
    Agency: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Vendor: 'border-blue-200 bg-blue-50 text-blue-700',
    Bank: 'border-amber-200 bg-amber-50 text-amber-700',
    Officer: 'border-purple-200 bg-purple-50 text-purple-700',
    Contractor: 'border-slate-200 bg-slate-100 text-slate-700',
  }
  return tones[type] || 'border-slate-200 bg-slate-50 text-slate-700'
}

function getTypeIcon(type) {
  const icons = {
    Agency: Building2,
    Vendor: Briefcase,
    Bank: Landmark,
    Officer: UserRound,
    Contractor: Users,
  }
  return icons[type] || Users
}

export default function Contacts() {
  const { data: contacts, loading } = useCollection('contacts', 'name', 'asc')
  const { add, update, remove } = useFirestoreCRUD('contacts')
  const { isAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [selected, setSelected] = useState(null)

  const stats = useMemo(() => {
    const now = Date.now()
    const recentWindow = 1000 * 60 * 60 * 24 * 30
    return {
      total: contacts.length,
      agencies: contacts.filter((c) => getContactType(c) === 'Agency').length,
      vendors: contacts.filter((c) => getContactType(c) === 'Vendor').length,
      banks: contacts.filter((c) => getContactType(c) === 'Bank').length,
      recent: contacts.filter((c) => {
        const time = getContactTimestamp(c)
        return time && now - time <= recentWindow
      }).length,
    }
  }, [contacts])

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const type = getContactType(c)
      if (typeFilter !== 'All' && type !== typeFilter) return false
      if (!search) return true
      const q = search.toLowerCase()
      return [c.name, c.role, c.organization, c.phone, c.email, c.category, c.notes, getLinkedProject(c)]
        .some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [contacts, search, typeFilter])

  const hasFilters = search || typeFilter !== 'All'

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
    } catch (err) {
      console.error('Failed to save contact:', err)
      toast.error('Failed to save contact')
    } finally { setSaving(false) }
  }

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Manage agencies, vendors, banks, and project contacts"
        actions={isAdmin && (
          <Button onClick={() => openDialog()} className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard icon={Users} label="Total Contacts" value={stats.total} tone="emerald" />
        <SummaryCard icon={Building2} label="Agencies" value={stats.agencies} tone="green" />
        <SummaryCard icon={Briefcase} label="Vendors" value={stats.vendors} tone="blue" />
        <SummaryCard icon={Landmark} label="Banks" value={stats.banks} tone="amber" />
        <SummaryCard icon={UserRound} label="Recent Contacts" value={stats.recent} tone="purple" className="col-span-2 lg:col-span-1" />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="h-11 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                className="h-10 justify-center gap-2"
                onClick={() => { setSearch(''); setTypeFilter('All') }}
              >
                <X className="h-4 w-4" /> Clear filters
              </Button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin sm:flex-wrap">
            {TYPE_FILTERS.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={`h-9 flex-shrink-0 rounded-full border px-3 text-sm font-medium transition-colors ${
                  typeFilter === type
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                    : 'border-border bg-background text-muted-foreground hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts added yet."
          description="Add agencies, vendors, and officers to keep project communication organized."
          action={isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add first contact</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ContactTable
              contacts={filtered}
              selected={selected}
              isAdmin={isAdmin}
              onSelect={setSelected}
              onEdit={openDialog}
              onDelete={setDeleteId}
            />
            <MobileContactCards
              contacts={filtered}
              selected={selected}
              isAdmin={isAdmin}
              onSelect={setSelected}
              onEdit={openDialog}
              onDelete={setDeleteId}
            />
          </div>

          {selected && (
            <div className="lg:col-span-1">
              <Card className="sticky top-4 border-border/80 shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-12 w-12 flex-shrink-0">
                        <AvatarFallback className="bg-emerald-100 text-sm font-semibold text-emerald-700">{getInitials(selected.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{selected.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{selected.role || selected.organization || 'Contact'}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex flex-shrink-0 gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Edit contact" onClick={() => openDialog(contacts.find((c) => c.id === selected.id))}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Delete contact" className="text-destructive" onClick={() => setDeleteId(selected.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 text-sm">
                    <DetailRow label="Type" value={<TypeBadge contact={selected} />} />
                    {selected.organization && <DetailRow label="Organization" value={selected.organization} />}
                    {getLinkedProject(selected) && <DetailRow label="Linked Project" value={getLinkedProject(selected)} />}
                    {selected.phone && (
                      <div className="flex items-center gap-2">
                        <span className="w-24 flex-shrink-0 text-xs text-muted-foreground">Phone</span>
                        <a href={`tel:${selected.phone}`} className="truncate text-primary hover:underline">{selected.phone}</a>
                      </div>
                    )}
                    {(selected.whatsapp || selected.phone) && (
                      <div className="flex items-center gap-2">
                        <span className="w-24 flex-shrink-0 text-xs text-muted-foreground">WhatsApp</span>
                        <a href={`https://wa.me/${(selected.whatsapp || selected.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="truncate text-emerald-600 hover:underline">
                          {selected.whatsapp || selected.phone}
                        </a>
                      </div>
                    )}
                    {selected.email && (
                      <div className="flex items-center gap-2">
                        <span className="w-24 flex-shrink-0 text-xs text-muted-foreground">Email</span>
                        <a href={`mailto:${selected.email}`} className="truncate text-primary hover:underline">{selected.email}</a>
                      </div>
                    )}
                    {selected.address && <DetailRow label="Address" value={selected.address} />}
                    {selected.notes && (
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                        <p className="rounded-lg border border-border/70 bg-muted/40 p-3 text-sm leading-relaxed text-foreground">{selected.notes}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? 'Edit Contact' : 'New Contact'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
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

function SummaryCard({ icon: Icon, label, value, tone, className = '' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-purple-50 text-purple-700',
  }

  return (
    <Card className={`border-border/80 shadow-sm ${className}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.emerald}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function TypeBadge({ contact }) {
  const type = getContactType(contact)
  const Icon = getTypeIcon(type)
  return (
    <Badge variant="outline" className={`gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getTypeClasses(type)}`}>
      <Icon className="h-3 w-3" />
      {type}
    </Badge>
  )
}

function ContactTable({ contacts, selected, isAdmin, onSelect, onEdit, onDelete }) {
  return (
    <Card className="hidden overflow-hidden border-border/80 shadow-sm md:block">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Organization</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Linked Tender/Project</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-[96px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => (
            <TableRow
              key={contact.id}
              tabIndex={0}
              onClick={() => onSelect(contact)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(contact)
                }
              }}
              className={`cursor-pointer hover:bg-muted/35 ${selected?.id === contact.id ? 'bg-emerald-50/70' : ''}`}
            >
              <TableCell>
                <div className="flex min-w-[180px] items-center gap-3">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarFallback className="bg-emerald-100 text-xs font-semibold text-emerald-700">{getInitials(contact.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{contact.name || 'Untitled Contact'}</p>
                    <p className="truncate text-xs text-muted-foreground">{contact.role || 'Contact person'}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell><TypeBadge contact={contact} /></TableCell>
              <TableCell className="max-w-[190px] truncate text-sm text-muted-foreground">{contact.organization || '-'}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{contact.phone || '-'}</TableCell>
              <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{contact.email || '-'}</TableCell>
              <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{getLinkedProject(contact) || '-'}</TableCell>
              <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{contact.notes || '-'}</TableCell>
              <TableCell>
                {isAdmin && (
                  <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" aria-label="Edit contact" onClick={() => onEdit(contact)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete contact" className="text-destructive" onClick={() => onDelete(contact.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function MobileContactCards({ contacts, selected, isAdmin, onSelect, onEdit, onDelete }) {
  return (
    <div className="space-y-3 md:hidden">
      {contacts.map((contact) => (
        <Card
          key={contact.id}
          role="button"
          tabIndex={0}
          className={`border-border/80 shadow-sm transition hover:shadow-md ${selected?.id === contact.id ? 'ring-2 ring-emerald-500' : ''}`}
          onClick={() => onSelect(contact)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(contact)
            }
          }}
        >
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar className="h-11 w-11 flex-shrink-0">
                  <AvatarFallback className="bg-emerald-100 text-sm font-semibold text-emerald-700">{getInitials(contact.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-base font-semibold leading-snug text-foreground">{contact.name || 'Untitled Contact'}</p>
                  <div className="mt-1"><TypeBadge contact={contact} /></div>
                </div>
              </div>
              {isAdmin && (
                <div className="flex flex-shrink-0 gap-1" onClick={(event) => event.stopPropagation()}>
                  <Button variant="ghost" size="icon-sm" aria-label="Edit contact" onClick={() => onEdit(contact)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete contact" className="text-destructive" onClick={() => onDelete(contact.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/25 p-3 text-sm">
              {contact.organization && (
                <InfoRow icon={Building2} label="Organization" value={contact.organization} />
              )}
              {contact.phone && (
                <InfoRow icon={Phone} label="Phone" value={<a href={`tel:${contact.phone}`} onClick={(event) => event.stopPropagation()} className="text-primary hover:underline">{contact.phone}</a>} />
              )}
              {contact.email && (
                <InfoRow icon={Mail} label="Email" value={<a href={`mailto:${contact.email}`} onClick={(event) => event.stopPropagation()} className="break-all text-primary hover:underline">{contact.email}</a>} />
              )}
              {getLinkedProject(contact) && (
                <InfoRow icon={Folder} label="Linked" value={getLinkedProject(contact)} />
              )}
            </div>

            {(contact.whatsapp || contact.phone) && (
              <a
                href={`https://wa.me/${(contact.whatsapp || contact.phone).replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="grid grid-cols-[18px_86px_minmax(0,1fr)] items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-sm text-foreground">{value}</span>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 flex-shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-sm text-foreground">{value}</span>
    </div>
  )
}
