import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFirestoreCRUD, useCollection } from "@/hooks/useFirestore";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { calendarDate, deriveCalendarEvents, shiftDate, todayInKarachi, validDateOnly } from "@/lib/calendarTodo";
import ConfirmDelete from "@/components/shared/ConfirmDelete";
import PageHeader from "@/components/shared/PageHeader";
import KpiCard from "@/components/shared/KpiCard";
import LoadState from "@/components/shared/LoadState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertTriangle,
  Briefcase,
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileStack,
  FolderOpen,
  Loader2,
  MapPin,
  Plus,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDate(value) {
  const date = validDateOnly(value);
  return date ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`)) : "—";
}

const EVENT_TYPES = {
  submission: {
    label: "Tender Submission",
    shortLabel: "Submission",
    icon: FileStack,
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  },
  opening: {
    label: "Bid Opening",
    shortLabel: "Opening",
    icon: FolderOpen,
    dot: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300",
    pill: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  },
  payOrder: {
    label: "Pay Order",
    shortLabel: "Pay Order",
    icon: WalletCards,
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  },
  task: {
    label: "Task",
    shortLabel: "Task",
    icon: CheckSquare,
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300",
    pill: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
  },
  siteVisit: {
    label: "Site Visit",
    shortLabel: "Site Visit",
    icon: MapPin,
    dot: "bg-teal-500",
    badge: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300",
    pill: "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200",
  },
  payment: {
    label: "Payment Follow-up",
    shortLabel: "Payment",
    icon: ReceiptText,
    dot: "bg-green-500",
    badge: "border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300",
    pill: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
  },
  billActivity: {
    label: "RA Bill Activity", shortLabel: "RA Bill", icon: ReceiptText,
    dot: "bg-green-500", badge: "border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300",
    pill: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
  },
  instrumentActivity: {
    label: "Instrument Activity", shortLabel: "Instrument", icon: WalletCards,
    dot: "bg-slate-500", badge: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300",
    pill: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
  },
  custom: {
    label: "Custom Event",
    shortLabel: "Event",
    icon: CalendarIcon,
    dot: "bg-slate-500",
    badge: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300",
    pill: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
  },
  overdue: {
    label: "Overdue",
    shortLabel: "Overdue",
    icon: AlertTriangle,
    dot: "bg-red-500",
    badge: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
    pill: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  },
};

export default function Calendar() {
  const now = new Date();
  const todayStr = todayInKarachi(now);
  const [year, setYear] = useState(Number(todayStr.slice(0, 4)));
  const [month, setMonth] = useState(Number(todayStr.slice(5, 7)) - 1);
  const [view, setView] = useState(() => window.matchMedia?.("(max-width: 639px)").matches ? "list" : "month");
  const [selectedDay, setSelectedDay] = useState(todayStr);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [form, setForm] = useState({ title: "", date: "", notes: "", eventType: "General" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [initialForm, setInitialForm] = useState(null);
  const [focusedEvent, setFocusedEvent] = useState(null);
  const [deleteEventId, setDeleteEventId] = useState(null);

  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: tenders, loading: tendersLoading, error: tendersError } = useCollection("tenders");
  const { data: payOrders, loading: payOrdersLoading, error: payOrdersError } = useCollection("payOrders");
  const { data: todos, loading: todosLoading, error: todosError } = useCollection("todos");
  const { data: customEvents, loading: customLoading, error: customEventsError } = useCollection("calendarEvents", "date", "asc");
  const { add, update, remove } = useFirestoreCRUD("calendarEvents");

  const allEvents = useMemo(() => deriveCalendarEvents({ tenders, payOrders, todos, customEvents, today: todayStr }),
    [tenders, payOrders, todos, customEvents, todayStr]);
  const visibleEvents = useMemo(() => allEvents.filter((event) =>
    (typeFilter === "all" || event.kind === typeFilter || (typeFilter === "overdue" && event.type === "overdue"))
    && (sourceFilter === "all" || event.sourceType === sourceFilter)), [allEvents, typeFilter, sourceFilter]);

  const eventsByDate = useMemo(() => {
    return visibleEvents.reduce((map, event) => {
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
      return map;
    }, {});
  }, [visibleEvents]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const selectedEvents = eventsByDate[selectedDay] || [];
  const weekEnd = shiftDate(todayStr, 6);
  const thisWeekEvents = visibleEvents.filter((event) => event.date >= todayStr && event.date <= weekEnd);
  const overdueEvents = visibleEvents.filter((event) => event.date < todayStr && event.type === "overdue");
  const openingEvents = visibleEvents.filter((event) => event.type === "opening" && event.date >= todayStr);
  const monthEvents = visibleEvents.filter((event) => event.date.startsWith(currentMonthPrefix));
  const listEvents = view === "week" ? thisWeekEvents : monthEvents;

  const summaryCards = [
    {
      label: "Due Today",
      value: visibleEvents.filter((event) => event.date === todayStr).length,
      helper: "Actions scheduled today",
      icon: Clock3,
      tone: "amber",
    },
    {
      label: "This Week",
      value: thisWeekEvents.length,
      helper: "Next 7 days",
      icon: CalendarIcon,
      tone: "blue",
    },
    {
      label: "Overdue",
      value: overdueEvents.length,
      helper: "Needs follow-up",
      icon: AlertTriangle,
      tone: "rose",
    },
    {
      label: "Upcoming Openings",
      value: openingEvents.length,
      helper: "Bid openings ahead",
      icon: FolderOpen,
      tone: "emerald",
    },
  ];

  const goMonth = (delta) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelectedDay(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`);
  };

  const goToday = () => {
    const date = todayInKarachi();
    setYear(Number(date.slice(0, 4)));
    setMonth(Number(date.slice(5, 7)) - 1);
    setSelectedDay(date);
  };

  const dateStr = (day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const openNewEvent = (dateOverride) => {
    if (!isAdmin) return;
    setEditEvent(null);
    const nextForm = { title: "", date: dateOverride || selectedDay || todayStr, notes: "", eventType: "General" };
    setForm(nextForm);
    setInitialForm(nextForm);
    setFormError("");
    setDialogOpen(true);
  };

  const openEditEvent = (event) => {
    if (!isAdmin || event.sourceType !== "custom") return;
    setEditEvent(event.raw);
    const nextForm = {
      title: event.raw.title || "",
      date: calendarDate(event.raw.date),
      notes: event.raw.notes || "",
      eventType: event.raw.eventType || "General",
    };
    setForm(nextForm);
    setInitialForm(nextForm);
    setFormError("");
    setDialogOpen(true);
  };

  const openEvent = (event) => {
    setFocusedEvent(event);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.title.trim() || !validDateOnly(form.date)) {
      setFormError("Enter a title and a valid date.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = { ...form, title: form.title.trim() };
      if (editEvent) {
        const changes = Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== initialForm[key]));
        if (!Object.keys(changes).length) { setDialogOpen(false); return; }
        await update(editEvent.id, changes);
        toast.success("Event updated");
      } else {
        await add(payload);
        toast.success("Event added");
      }
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to save event:", err);
      setFormError("Event could not be saved. Your entries are still here; please try again.");
      toast.error("Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const requestClose = (open) => {
    if (open) return;
    if (saving) return;
    if (initialForm && JSON.stringify(form) !== JSON.stringify(initialForm)) setDiscardOpen(true);
    else setDialogOpen(false);
  };

  const loading = tendersLoading || payOrdersLoading || todosLoading || customLoading;
  const loadError = tendersError || payOrdersError || todosError || customEventsError;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) return <LoadState title="Calendar could not be loaded" error={loadError} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Recorded deadlines, follow-ups and manual events"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <div className="inline-flex w-full rounded-xl border bg-background p-1 sm:w-auto">
              {["month", "week", "list"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize text-muted-foreground transition-colors sm:flex-none sm:py-1.5",
                    view === option && "bg-primary text-primary-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <Button variant="outline" className="h-10 w-full sm:w-auto" onClick={goToday}>
              Today
            </Button>
            {isAdmin && (
              <Button className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" onClick={() => openNewEvent(todayStr)}>
                <Plus className="h-4 w-4" /> Add Event
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 sm:p-4">
        <label className="min-w-[150px] flex-1 space-y-1 text-xs font-medium text-muted-foreground">
          Event type
          <select aria-label="Event type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground">
            <option value="all">All types</option>
            {Object.entries(EVENT_TYPES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
        </label>
        <label className="min-w-[150px] flex-1 space-y-1 text-xs font-medium text-muted-foreground">
          Source
          <select aria-label="Event source" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground">
            <option value="all">All sources</option>
            <option value="tender">Tenders and projects</option>
            <option value="payOrder">Pay orders</option>
            <option value="task">To-Do</option>
            <option value="custom">Manual events</option>
          </select>
        </label>
        {(typeFilter !== "all" || sourceFilter !== "all") && <Button variant="outline" onClick={() => { setTypeFilter("all"); setSourceFilter("all"); }}>Clear filters</Button>}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20 p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg md:text-xl">{view === "week" ? `Next 7 days · ${formatDate(todayStr)}–${formatDate(weekEnd)}` : `${MONTHS[month]} ${year}`}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {view === "week" ? `${thisWeekEvents.length} recorded event${thisWeekEvents.length === 1 ? "" : "s"}` : `${monthEvents.length} recorded event${monthEvents.length === 1 ? "" : "s"} this month`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={() => goMonth(-1)} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => goMonth(1)} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-4">
            {view === "month" ? (
              <>
                <div className="grid grid-cols-7 rounded-t-lg border border-b-0 bg-muted/40">
                  {DAYS.map((day) => (
                    <div key={day} className="px-1 py-2 text-center text-xs font-semibold text-muted-foreground">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 overflow-hidden rounded-b-lg border border-border">
                  {cells.map((day, index) => {
                    if (!day) return <div key={`empty-${index}`} className="min-h-[68px] border-b border-r bg-muted/20 sm:min-h-[112px] xl:min-h-[128px]" />;
                    const dayString = dateStr(day);
                    const dayEvents = eventsByDate[dayString] || [];
                    const isToday = dayString === todayStr;
                    const isSelected = dayString === selectedDay;
                    const isPast = dayString < todayStr;
                    return (
                      <button
                        key={dayString}
                        type="button"
                        onClick={() => setSelectedDay(dayString)}
                        className={cn(
                          "min-h-[68px] border-b border-r bg-card p-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[112px] sm:p-2 xl:min-h-[128px]",
                          isPast && "bg-muted/10",
                          isSelected && "bg-emerald-50/70 ring-2 ring-inset ring-emerald-500 dark:bg-emerald-950/20",
                        )}
                        aria-label={`${formatDate(dayString)}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}`}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                            isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                            isPast && !isToday && "text-muted-foreground",
                          )}
                          {...(isToday ? { "aria-current": "date" } : {})}
                        >
                          {day}
                        </span>
                        <div className="mt-1.5 space-y-1">
                          {dayEvents.slice(0, 2).map((event) => {
                            const meta = EVENT_TYPES[event.type] || EVENT_TYPES.custom;
                            return (
                              <div key={event.id} title={`${meta.label}: ${event.title}`} className={cn("hidden rounded-full px-2 py-0.5 text-xs font-medium sm:block", meta.pill)}>
                                <span className="block truncate">{meta.shortLabel}: {event.title}</span>
                              </div>
                            );
                          })}
                          <div className="flex flex-wrap gap-1 sm:hidden">
                            {dayEvents.slice(0, 4).map((event) => {
                              const meta = EVENT_TYPES[event.type] || EVENT_TYPES.custom;
                              return <span key={event.id} className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />;
                            })}
                          </div>
                          {dayEvents.length > 2 && (
                            <p className="hidden text-xs font-medium text-muted-foreground sm:block">+{dayEvents.length - 2} more · open day</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <EventList events={listEvents} emptyText="No recorded events in this range. Change the month or clear filters." onOpen={openEvent} grouped />
            )}
          </CardContent>
        </Card>

        <SelectedDatePanel
          selectedDay={selectedDay}
          events={selectedEvents}
          onOpen={openEvent}
          onAdd={isAdmin ? () => openNewEvent(selectedDay) : null}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={requestClose}>
        <DialogContent className="max-h-[100dvh] w-full max-w-lg overflow-x-hidden rounded-none sm:max-h-[92dvh] sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editEvent ? "Edit Event" : "New Event"}</DialogTitle>
            <DialogDescription>Only manual events can be changed here. Linked dates remain in their source records.</DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="calendar-event-title">Title *</Label>
              <Input id="calendar-event-title" value={form.title} onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))} placeholder="Event title" required maxLength={500} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calendar-event-date">Date *</Label>
              <Input id="calendar-event-date" type="date" value={form.date} onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))} className="mobile-date-input" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calendar-event-type">Type</Label>
              <Input id="calendar-event-type" value={form.eventType} onChange={(event) => setForm((previous) => ({ ...previous, eventType: event.target.value }))} placeholder="e.g. Meeting, Site Visit" maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calendar-event-notes">Notes</Label>
              <Textarea id="calendar-event-notes" value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} rows={3} maxLength={5000} />
            </div>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter className="sticky bottom-0 gap-2 border-t bg-popover pt-3">
            {editEvent && (
              <Button variant="destructive" onClick={() => setDeleteEventId(editEvent.id)} disabled={saving} className="w-full sm:mr-auto sm:w-auto">
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => requestClose(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editEvent ? "Save" : "Add Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!focusedEvent} onOpenChange={(open) => !open && setFocusedEvent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="pr-8">{focusedEvent?.title}</DialogTitle><DialogDescription>Recorded event details and source link.</DialogDescription></DialogHeader>
          {focusedEvent && <div className="space-y-3 text-sm">
            <p><span className="text-muted-foreground">Type:</span> {EVENT_TYPES[focusedEvent.type]?.label || "Event"}</p>
            <p><span className="text-muted-foreground">Date:</span> {formatDate(focusedEvent.date)} · date only</p>
            <p><span className="text-muted-foreground">Source:</span> {focusedEvent.source}</p>
            <p className="break-words text-muted-foreground">{focusedEvent.description}</p>
            {focusedEvent.sourceType === "custom" ? isAdmin && <Button onClick={() => { const event = focusedEvent; setFocusedEvent(null); openEditEvent(event); }}>Edit event</Button>
              : <Button onClick={() => { navigate(focusedEvent.link); setFocusedEvent(null); }}>Open record <ExternalLink className="h-4 w-4" /></Button>}
          </div>}
        </DialogContent>
      </Dialog>
      <ConfirmDelete open={discardOpen} onOpenChange={setDiscardOpen} title="Discard event changes?" description="Unsaved changes will be lost." confirmLabel="Discard" onConfirm={() => { setDialogOpen(false); setDiscardOpen(false); }} />
      <ConfirmDelete open={!!deleteEventId} onOpenChange={() => setDeleteEventId(null)} title="Delete manual event?" description="This manual event will be permanently deleted." onConfirm={async () => { await remove(deleteEventId); toast.success("Event deleted"); setDialogOpen(false); setDeleteEventId(null); }} />
    </div>
  );
}

function SelectedDatePanel({ selectedDay, events, onOpen, onAdd }) {
  return (
    <Card className="rounded-xl border xl:sticky xl:top-4 xl:self-start">
      <CardHeader className="border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Date Focus</CardTitle>
            <p className="mt-1 text-sm font-medium text-foreground">{formatDate(selectedDay)}</p>
            <p className="text-xs text-muted-foreground">
              {events.length ? `${events.length} event${events.length === 1 ? "" : "s"} scheduled` : "No deadlines or activities for this date."}
            </p>
          </div>
          {onAdd && (
            <Button variant="outline" size="sm" className="h-9" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <EventList events={events} emptyText="No deadlines or activities for this date." onOpen={onOpen} />
      </CardContent>
    </Card>
  );
}

function EventList({ events, emptyText, onOpen, grouped = false }) {
  if (!events.length) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
        <CalendarIcon className="mx-auto h-8 w-8 text-muted-foreground/70" />
        <p className="mt-3 text-sm font-medium text-foreground">{emptyText}</p>
      </div>
    );
  }

  if (grouped) {
    const groups = events.reduce((acc, event) => {
      if (!acc[event.date]) acc[event.date] = [];
      acc[event.date].push(event);
      return acc;
    }, {});

    return (
      <div className="space-y-4">
        {Object.entries(groups).map(([date, groupEvents]) => (
          <div key={date} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-sm font-semibold text-foreground">{formatDate(date)}</p>
              <span className="text-xs text-muted-foreground">{groupEvents.length} item{groupEvents.length === 1 ? "" : "s"}</span>
            </div>
            <EventList events={groupEvents} emptyText={emptyText} onOpen={onOpen} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const meta = EVENT_TYPES[event.type] || EVENT_TYPES.custom;
        const Icon = meta.icon || Briefcase;
        const isPast = event.date < todayInKarachi();
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onOpen(event)}
            className="group flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-emerald-200 hover:bg-emerald-50/40 dark:hover:border-emerald-900/50 dark:hover:bg-emerald-950/20"
          >
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.badge)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("h-6 rounded-full px-2 text-xs", meta.badge)}>
                  {isPast && event.type === "overdue" ? "Overdue" : meta.label}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDate(event.date)}</span>
              </div>
              <p title={event.title} className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">{event.title}</p>
              {event.description && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{event.description}</p>
              )}
            </div>
            {event.sourceType !== "custom" && (
              <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                <span className="hidden sm:inline">Details</span>
                <ExternalLink className="h-4 w-4" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
