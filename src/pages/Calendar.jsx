import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useFirestoreCRUD } from '@/hooks/useFirestore'
import { useCollection } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Calendar as CalIcon, ExternalLink, FileStack, FolderOpen, Pencil } from 'lucide-react'
import { toast } from 'sonner'

const EVENT_COLORS = {
  submission: 'oklch(var(--chart-3))',
  opening: 'oklch(var(--chart-2))',
  custom: 'oklch(var(--chart-4))',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function Calendar() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [tenders, setTenders] = useState([])
  const { data: customEvents, loading } = useCollection('calendarEvents', 'date', 'asc')
  const { add, update, remove } = useFirestoreCRUD('calendarEvents')
  const { isAdmin } = useAuth()

  const [selectedDay, setSelectedDay] = useState(null)
  const [dayViewOpen, setDayViewOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEvent, setEditEvent] = useState(null)
  const [form, setForm] = useState({ title: '', date: '', notes: '', eventType: 'General' })
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    getDocs(collection(db, 'tenders'))
      .then((snap) => setTenders(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((err) => {
        console.error('Failed to load tenders:', err)
        toast.error('Failed to load tenders')
      })
  }, [])

  // Build all events for current month
  const allEvents = useMemo(() => {
    const events = []
    for (const t of tenders) {
      if (t.submissionDate) events.push({ id: `sub-${t.id}`, date: t.submissionDate, title: `📋 ${t.name || 'Untitled'}`, type: 'submission', color: EVENT_COLORS.submission, tenderId: t.id })
      if (t.openingDate) events.push({ id: `open-${t.id}`, date: t.openingDate, title: `📂 ${t.name || 'Untitled'} Opening`, type: 'opening', color: EVENT_COLORS.opening, tenderId: t.id })
    }
    for (const e of customEvents) {
      events.push({ id: e.id, date: e.date, title: e.title, type: 'custom', color: EVENT_COLORS.custom, notes: e.notes, eventType: e.eventType, _raw: e })
    }
    return events
  }, [tenders, customEvents])

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const e of allEvents) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return map
  }, [allEvents])

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const goMonth = (delta) => {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m)
    setYear(y)
  }

  const dateStr = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const openDayView = (d) => {
    setSelectedDay(dateStr(d))
    setDayViewOpen(true)
  }

  const openNewEvent = (dateOverride) => {
    if (!isAdmin) return
    setEditEvent(null)
    setForm({ title: '', date: dateOverride || selectedDay || todayStr, notes: '', eventType: 'General' })
    setDayViewOpen(false)
    setDialogOpen(true)
  }

  const openEditEvent = (event) => {
    if (!isAdmin || event.type !== 'custom') return
    setEditEvent(event._raw)
    setForm({ title: event.title, date: event.date, notes: event.notes || '', eventType: event.eventType || 'General' })
    setDayViewOpen(false)
    setDialogOpen(true)
  }

  const openTender = (tenderId) => {
    setDayViewOpen(false)
    navigate(`/tenders/${tenderId}`)
  }

  const handleSave = async () => {
    if (!form.title || !form.date) { toast.error('Title and date are required'); return }
    setSaving(true)
    try {
      if (editEvent) { await update(editEvent.id, form); toast.success('Event updated') }
      else { await add(form); toast.success('Event added') }
      setDialogOpen(false)
    } catch (err) {
      console.error('Failed to save event:', err)
      toast.error('Failed to save event')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!editEvent) return
    try {
      await remove(editEvent.id)
      toast.success('Event deleted')
      setDialogOpen(false)
    } catch (err) {
      console.error('Failed to delete event:', err)
      toast.error('Failed to delete event')
    }
  }

  // Upcoming events this month
  const todayStr = today.toISOString().slice(0, 10)
  const upcomingThisMonth = allEvents
    .filter((e) => e.date >= todayStr && e.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Tender deadlines and custom events"
        actions={isAdmin && <Button onClick={() => { setEditEvent(null); setForm({ title: '', date: todayStr, notes: '', eventType: 'General' }); setDialogOpen(true) }}><Plus className="h-4 w-4" /> Add Event</Button>}
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {[['Submission', EVENT_COLORS.submission], ['Opening', EVENT_COLORS.opening], ['Custom', EVENT_COLORS.custom]].map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: color }} />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => goMonth(-1)} aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></Button>
                <h2 className="text-base font-semibold">{MONTHS[month]} {year}</h2>
                <Button variant="ghost" size="icon" onClick={() => goMonth(1)} aria-label="Next month"><ChevronRight className="h-5 w-5" /></Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                ))}
              </div>
              {/* Date cells */}
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {cells.map((d, i) => {
                  if (!d) return <div key={`empty-${i}`} className="bg-muted/30 min-h-[72px]" />
                  const ds = dateStr(d)
                  const dayEvents = eventsByDate[ds] || []
                  const isToday = ds === todayStr
                  const isPast = ds < todayStr
                  return (
                    <div
                      key={d}
                      className={`min-h-[80px] p-1.5 cursor-pointer hover:bg-accent/50 transition-colors ${isToday ? 'bg-primary/5 ring-2 ring-primary ring-inset' : isPast ? 'bg-muted/20' : 'bg-card'}`}
                      onClick={() => openDayView(d)}
                      aria-label={`${d} ${MONTHS[month]} ${year}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}` : ''}`}
                    >
                      <span
                        className={`text-xs font-medium mb-1 flex h-5 w-5 items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : isPast ? 'text-muted-foreground' : 'text-foreground'}`}
                        {...(isToday ? { 'aria-current': 'date' } : {})}
                      >
                        {d}
                      </span>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <div
                            key={e.id}
                            className="text-[10px] leading-tight rounded px-1 py-0.5 text-white truncate"
                            style={{ background: e.color }}
                            title={e.title}
                          >
                            {e.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming events sidebar */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><CalIcon className="h-4 w-4" /> Remaining This Month</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {upcomingThisMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No upcoming events for the rest of the month</p>
              ) : (
                upcomingThisMonth.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      if (e.tenderId) openTender(e.tenderId)
                      else if (e.type === 'custom') openEditEvent(e)
                    }}
                    className="w-full flex items-start gap-2 rounded-lg p-2 hover:bg-muted transition-colors text-left"
                  >
                    <span className="h-3 w-3 rounded-full mt-0.5 flex-shrink-0" style={{ background: e.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground break-words line-clamp-2">{e.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(e.date)}</p>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Day View Dialog */}
      <Dialog open={dayViewOpen} onOpenChange={setDayViewOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {selectedDay ? formatDate(selectedDay) : ''}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {(eventsByDate[selectedDay] || []).length === 0 ? 'No events on this date' : `${(eventsByDate[selectedDay] || []).length} event(s)`}
            </p>
          </DialogHeader>

          <div className="space-y-2 py-1">
            {(eventsByDate[selectedDay] || []).map((e) => {
              const Icon = e.type === 'submission' ? FileStack : e.type === 'opening' ? FolderOpen : Pencil
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    if (e.tenderId) openTender(e.tenderId)
                    else if (e.type === 'custom') openEditEvent(e)
                  }}
                  className="w-full flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent transition-colors text-left"
                >
                  <span
                    className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 text-white"
                    style={{ background: e.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground break-words">{e.title}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">
                      {e.type === 'submission' ? 'Tender submission' : e.type === 'opening' ? 'Tender opening' : (e.eventType || 'Custom event')}
                    </p>
                    {e.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">{e.notes}</p>}
                  </div>
                  {e.tenderId && <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />}
                </button>
              )
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDayViewOpen(false)}>Close</Button>
            {isAdmin && (
              <Button onClick={() => openNewEvent(selectedDay)}>
                <Plus className="h-4 w-4" /> Add event
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editEvent ? 'Edit Event' : 'New Event'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Event title" />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Input value={form.eventType} onChange={(e) => setForm((p) => ({ ...p, eventType: e.target.value }))} placeholder="e.g. Meeting, Site Visit" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editEvent && (
              <Button variant="destructive" onClick={handleDelete} className="mr-auto">Delete</Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editEvent ? 'Save' : 'Add Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
