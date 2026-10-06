import { useState, useMemo, useRef } from 'react'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { getInitials, CONTACT_CATEGORIES } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import LoadState from '@/components/shared/LoadState'
import { PageTableSkeleton } from '@/components/shared/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
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
const CONTACT_FIELDS = Object.keys(EMPTY)

function contactPayload(value = {}) {
  return Object.fromEntries(CONTACT_FIELDS.map((key) => [key, value[key] ?? EMPTY[key]]))
}
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
    Agency: 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    Vendor: 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    Bank: 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    Officer: 'border-purple-200 dark:border-purple-900/60 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
    Contractor: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300',
  }
  return tones[type] || 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
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
  const { data: contacts, loading, error } = useCollection('contacts', 'name', 'asc')
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
  const [initialForm, setInitialForm] = useState(EMPTY)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const savingRef = useRef(false)

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
    const value = item ? contactPayload(item) : { ...EMPTY }
    setEditItem(item)
    setForm(value)
    setInitialForm(value)
    setFormErrors({})
    setSaveError('')
    setDialogOpen(true)
  }

  const closeDialog = () => {
    if (savingRef.current) return
    if (JSON.stringify(form) !== JSON.stringify(initialForm)) setDiscardOpen(true)
    else setDialogOpen(false)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    const errors = {}
    if (!form.name.trim()) errors.name = 'Full name is required.'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.'
    setFormErrors(errors)
    if (Object.keys(errors).length) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    try {
      const payload = contactPayload(form)
      if (editItem) { await update(editItem.id, payload); toast.success('Contact updated'); setSelected({ ...editItem, ...payload }) }
      else { await add(payload); toast.success('Contact added') }
      setDialogOpen(false)
    } catch (err) {
      console.error('Failed to save contact:', err)
      setSaveError('Could not save this contact. Your entries are still here; please try again.')
    } finally { savingRef.current = false; setSaving(false) }
  }

  const setF = (k) => (e) => {
    setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))
    setFormErrors((p) => ({ ...p, [k]: '' }))
    setSaveError('')
  }

  if (loading) return <PageTableSkeleton rows={7} cols={5} metrics={4} />
  if (error) return <LoadState title="Could not load contacts" error={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Manage agencies, vendors, banks, and project contacts"
        actions={isAdmin && (
          <Button onClick={() => openDialog()} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
        )}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard icon={Users} label="Total Contacts" value={stats.total} tone="emerald" />
        <SummaryCard icon={Building2} label="Agencies" value={stats.agencies} tone="green" />
        <SummaryCard icon={Briefcase} label="Vendors" value={stats.vendors} tone="blue" />
        <SummaryCard icon={Landmark} label="Banks" value={stats.banks} tone="amber" />
      </div>

      <Card className="border-border/80">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="h-10 pl-9"
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
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-emerald-200 dark:hover:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300'
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
          title={hasFilters ? 'No contacts match these filters' : 'No contacts added yet.'}
          description={hasFilters ? 'Change the search or category to see other contacts.' : 'Add agencies, vendors, and officers to keep project communication organized.'}
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
              <Card className="sticky top-4 border-border/80">
                <CardContent className="p-5">
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-12 w-12 flex-shrink-0">
                        <AvatarFallback className="bg-emerald-100 dark:bg-emerald-950/60 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{getInitials(selected.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-foreground">{selected.name}</p>
                        <p className="break-words text-xs text-muted-foreground">{selected.role || selected.organization || 'Contact'}</p>
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

      <Sheet open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-4 py-4 text-left sm:px-6">
            <SheetTitle>{editItem ? 'Edit Contact' : 'New Contact'}</SheetTitle>
            <SheetDescription>Keep contact details and communication information together.</SheetDescription>
          </SheetHeader>
          <div className="grid flex-1 grid-cols-1 content-start gap-4 overflow-y-auto px-4 py-5 sm:grid-cols-2 sm:px-6">
            <h3 className="sm:col-span-2 text-sm font-semibold">Contact details</h3>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="contact-name">Full Name *</Label>
              <Input id="contact-name" value={form.name} onChange={setF('name')} required aria-invalid={!!formErrors.name} />
              {formErrors.name && <p role="alert" className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-role">Role / Title</Label>
              <Input id="contact-role" value={form.role} onChange={setF('role')} placeholder="e.g. Project Manager" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-category">Category</Label>
              <Select value={form.category} onValueChange={setF('category')}>
                <SelectTrigger id="contact-category"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTACT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="contact-organization">Organization</Label>
              <Input id="contact-organization" value={form.organization} onChange={setF('organization')} />
            </div>
            <h3 className="sm:col-span-2 border-t pt-3 text-sm font-semibold">Communication</h3>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input id="contact-phone" value={form.phone} onChange={setF('phone')} type="tel" placeholder="+92 300 0000000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-whatsapp">WhatsApp</Label>
              <Input id="contact-whatsapp" value={form.whatsapp} onChange={setF('whatsapp')} type="tel" placeholder="Same as phone if blank" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input id="contact-email" value={form.email} onChange={setF('email')} type="email" />
              {formErrors.email && <p role="alert" className="text-xs text-destructive">{formErrors.email}</p>}
            </div>
            <h3 className="sm:col-span-2 border-t pt-3 text-sm font-semibold">Additional details</h3>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="contact-address">Address</Label>
              <Input id="contact-address" value={form.address} onChange={setF('address')} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea id="contact-notes" value={form.notes} onChange={setF('notes')} rows={3} />
            </div>
          </div>
          <SheetFooter className="border-t bg-background px-4 py-4 sm:px-6">
            {saveError && <p role="alert" className="w-full text-sm text-destructive">{saveError}</p>}
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Add Contact'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Discard contact changes?</AlertDialogTitle><AlertDialogDescription>Your unsaved changes will be lost.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { setDiscardOpen(false); setDialogOpen(false) }}>Discard changes</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={async () => { await remove(deleteId); toast.success('Contact deleted'); setSelected(null); setDeleteId(null) }} title="Delete contact" description="This will permanently delete this contact." />
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, tone, className = '' }) {
  const tones = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    green: 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300',
    blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    purple: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
  }

  return (
    <Card className={`border-border/80 ${className}`}>
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
    <Card className="hidden overflow-hidden border-border/80 md:block">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Company / Role</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Project</TableHead>
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
              className={`cursor-pointer hover:bg-muted/35 ${selected?.id === contact.id ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : ''}`}
            >
              <TableCell>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarFallback className="bg-emerald-100 dark:bg-emerald-950/60 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{getInitials(contact.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-foreground">{contact.name || 'Untitled Contact'}</p>
                    <TypeBadge contact={contact} />
                  </div>
                </div>
              </TableCell>
              <TableCell className="max-w-[150px] break-words text-sm text-muted-foreground">{[contact.organization, contact.role].filter(Boolean).join(' · ') || '—'}</TableCell>
              <TableCell className="max-w-[170px] text-sm">
                <div className="flex flex-col gap-1 break-all">
                  {contact.phone && <a href={`tel:${contact.phone}`} onClick={(event) => event.stopPropagation()} className="text-primary hover:underline">{contact.phone}</a>}
                  {contact.email && <a href={`mailto:${contact.email}`} onClick={(event) => event.stopPropagation()} className="text-primary hover:underline">{contact.email}</a>}
                  {!contact.phone && !contact.email && <span className="text-muted-foreground">—</span>}
                </div>
              </TableCell>
              <TableCell className="max-w-[160px] break-words text-sm text-muted-foreground">{getLinkedProject(contact) || '—'}</TableCell>
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
          className={`border-border/80 transition hover:shadow-md ${selected?.id === contact.id ? 'ring-2 ring-emerald-500' : ''}`}
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
                  <AvatarFallback className="bg-emerald-100 dark:bg-emerald-950/60 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{getInitials(contact.name)}</AvatarFallback>
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
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
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
