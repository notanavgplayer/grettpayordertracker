import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFirestoreCRUD, useCollection } from "@/hooks/useFirestore";
import { useAuth } from "@/context/AuthContext";
import { cn, formatDate, isTaskDone } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";
import KpiCard from "@/components/shared/KpiCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

function toLocalDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDate(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (typeof value?.toDate === "function") return toLocalDateString(value.toDate());
  if (value?.seconds) return toLocalDateString(new Date(value.seconds * 1000));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : toLocalDateString(parsed);
}

function addDays(dateString, count) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + count);
  return toLocalDateString(date);
}

function daysBetween(start, end) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.round((endDate - startDate) / 86400000);
}

function getTaskTitle(task) {
  return task.text || task.title || task.taskName || "Untitled task";
}

function isDateFieldKey(key) {
  return /date/i.test(key) || ["submitted", "paid", "due", "deadline"].includes(key);
}

function firstValidDateFrom(object, keys) {
  for (const key of keys) {
    const value = normalizeDate(object?.[key]);
    if (value) return value;
  }
  return "";
}

function eventSort(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.sortRank || 9) - (b.sortRank || 9);
}

export default function Calendar() {
  const now = new Date();
  const todayStr = toLocalDateString(now);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState("month");
  const [selectedDay, setSelectedDay] = useState(todayStr);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [form, setForm] = useState({ title: "", date: "", notes: "", eventType: "General" });
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: tenders, loading: tendersLoading } = useCollection("tenders");
  const { data: payOrders, loading: payOrdersLoading } = useCollection("payOrders");
  const { data: todos, loading: todosLoading } = useCollection("todos");
  const { data: customEvents, loading: customLoading } = useCollection("calendarEvents", "date", "asc");
  const { add, update, remove } = useFirestoreCRUD("calendarEvents");

  const allEvents = useMemo(() => {
    const events = [];

    for (const tender of tenders) {
      const tenderTitle = tender.name || tender.title || "Untitled tender";
      const submissionDate = normalizeDate(tender.submissionDate);
      const openingDate = normalizeDate(tender.openingDate);

      if (submissionDate) {
        events.push({
          id: `submission-${tender.id}`,
          date: submissionDate,
          title: tenderTitle,
          description: tender.agency || tender.nit || "Tender submission deadline",
          type: submissionDate < todayStr ? "overdue" : "submission",
          sourceType: "submission",
          entityId: tender.id,
          actionLabel: "View tender",
          sortRank: 1,
        });
      }

      if (openingDate) {
        events.push({
          id: `opening-${tender.id}`,
          date: openingDate,
          title: `${tenderTitle} opening`,
          description: tender.agency || tender.nit || "Bid opening",
          type: "opening",
          sourceType: "opening",
          entityId: tender.id,
          actionLabel: "View tender",
          sortRank: 2,
        });
      }

      const siteVisitDate = firstValidDateFrom(tender, ["siteVisitDate", "visitDate", "siteVisit"]);
      if (siteVisitDate) {
        events.push({
          id: `site-visit-${tender.id}`,
          date: siteVisitDate,
          title: tenderTitle,
          description: "Site visit",
          type: "siteVisit",
          sourceType: "siteVisit",
          entityId: tender.id,
          actionLabel: "View tender",
          sortRank: 5,
        });
      }

      for (const [index, bill] of (tender.raBills || []).entries()) {
        const billDate = firstValidDateFrom(bill, ["paid", "submitted", "dueDate", "date"]);
        if (!billDate) continue;
        events.push({
          id: `ra-${tender.id}-${bill.id || index}`,
          date: billDate,
          title: bill.no ? `RA bill ${bill.no}` : `${tenderTitle} RA bill`,
          description: tenderTitle,
          type: "payment",
          sourceType: "payment",
          entityId: tender.id,
          actionLabel: "View tender",
          sortRank: 6,
        });
      }
    }

    for (const payOrder of payOrders) {
      const poDate = firstValidDateFrom(payOrder, ["returnDate", "releaseDate", "released", "submitted", "date"]);
      if (!poDate) continue;
      events.push({
        id: `pay-order-${payOrder.id}`,
        date: poDate,
        title: payOrder.po ? `PO #${payOrder.po}` : "Pay order follow-up",
        description: payOrder.tender || payOrder.bank || payOrder.status || "Pay order activity",
        type: "payOrder",
        sourceType: "payOrder",
        entityId: payOrder.id,
        actionLabel: "Open pay orders",
        sortRank: 3,
      });
    }

    for (const task of todos) {
      const dueDate = normalizeDate(task.dueDate || task.due);
      if (!dueDate || isTaskDone(task)) continue;
      events.push({
        id: `task-${task.id}`,
        date: dueDate,
        title: getTaskTitle(task),
        description: task.category || task.project || "Task due date",
        type: dueDate < todayStr ? "overdue" : "task",
        sourceType: "task",
        entityId: task.id,
        actionLabel: "Open tasks",
        sortRank: 4,
      });
    }

    for (const customEvent of customEvents) {
      const customDate = normalizeDate(customEvent.date);
      if (!customDate) continue;
      const eventType = customEvent.eventType || "General";
      const customType = /site/i.test(eventType) ? "siteVisit" : "custom";
      events.push({
        id: customEvent.id,
        date: customDate,
        title: customEvent.title || "Custom event",
        description: customEvent.notes || eventType,
        type: customType,
        sourceType: "custom",
        eventType,
        notes: customEvent.notes,
        raw: customEvent,
        actionLabel: isAdmin ? "Edit event" : "",
        sortRank: 7,
      });
    }

    return events.sort(eventSort);
  }, [customEvents, isAdmin, payOrders, tenders, todayStr, todos]);

  const eventsByDate = useMemo(() => {
    return allEvents.reduce((map, event) => {
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
      return map;
    }, {});
  }, [allEvents]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const selectedEvents = eventsByDate[selectedDay] || [];
  const weekEnd = addDays(todayStr, 6);
  const thisWeekEvents = allEvents.filter((event) => event.date >= todayStr && event.date <= weekEnd);
  const overdueEvents = allEvents.filter((event) => event.date < todayStr && event.type === "overdue");
  const openingEvents = allEvents.filter((event) => event.type === "opening" && event.date >= todayStr);
  const monthEvents = allEvents.filter((event) => event.date.startsWith(currentMonthPrefix));
  const listEvents = view === "week" ? thisWeekEvents : allEvents.filter((event) => event.date >= todayStr).slice(0, 30);

  const summaryCards = [
    {
      label: "Due Today",
      value: allEvents.filter((event) => event.date === todayStr).length,
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
  };

  const goToday = () => {
    const date = new Date();
    setYear(date.getFullYear());
    setMonth(date.getMonth());
    setSelectedDay(toLocalDateString(date));
  };

  const dateStr = (day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const openNewEvent = (dateOverride) => {
    if (!isAdmin) return;
    setEditEvent(null);
    setForm({ title: "", date: dateOverride || selectedDay || todayStr, notes: "", eventType: "General" });
    setDialogOpen(true);
  };

  const openEditEvent = (event) => {
    if (!isAdmin || event.sourceType !== "custom") return;
    setEditEvent(event.raw);
    setForm({
      title: event.raw.title || "",
      date: normalizeDate(event.raw.date),
      notes: event.raw.notes || "",
      eventType: event.raw.eventType || "General",
    });
    setDialogOpen(true);
  };

  const openEvent = (event) => {
    if (event.sourceType === "custom") {
      openEditEvent(event);
      return;
    }
    if (event.sourceType === "payOrder") {
      navigate("/pay-orders");
      return;
    }
    if (event.sourceType === "task") {
      navigate("/todo");
      return;
    }
    if (event.entityId) navigate(`/tenders/${event.entityId}`);
  };

  const handleSave = async () => {
    if (!form.title || !form.date) {
      toast.error("Title and date are required");
      return;
    }
    setSaving(true);
    try {
      if (editEvent) {
        await update(editEvent.id, form);
        toast.success("Event updated");
      } else {
        await add(form);
        toast.success("Event added");
      }
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to save event:", err);
      toast.error("Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editEvent) return;
    try {
      await remove(editEvent.id);
      toast.success("Event deleted");
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to delete event:", err);
      toast.error("Failed to delete event");
    }
  };

  const loading = tendersLoading || payOrdersLoading || todosLoading || customLoading;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Track submissions, openings, pay orders, and tasks"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <div className="inline-flex w-full rounded-xl border bg-background p-1 shadow-sm sm:w-auto">
              {["month", "week", "list"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize text-muted-foreground transition-colors sm:flex-none sm:py-1.5",
                    view === option && "bg-primary text-primary-foreground shadow-sm",
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

      <Card className="overflow-hidden rounded-2xl border-emerald-100 bg-gradient-to-br from-emerald-50 via-background to-background shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/20">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Deadline Control Center</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {allEvents.length} tracked date{allEvents.length === 1 ? "" : "s"} across tenders and projects
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Monitor submission dates, bid openings, pay order follow-ups, task due dates, site visits, and payment activity from one calendar.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:w-[260px]">
            <MiniStat label="Today" value={allEvents.filter((event) => event.date === todayStr).length} />
            <MiniStat label="Month" value={monthEvents.length} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin sm:flex-wrap sm:overflow-visible sm:pb-0">
        {["submission", "opening", "payOrder", "task", "siteVisit", "overdue"].map((type) => {
          const meta = EVENT_TYPES[type];
          return (
            <span key={type} className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground">
              <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} />
              {meta.shortLabel}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden rounded-2xl border shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg md:text-xl">{view === "month" ? `${MONTHS[month]} ${year}` : view === "week" ? "This Week" : "Upcoming Deadlines"}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {view === "month" ? `${monthEvents.length} event${monthEvents.length === 1 ? "" : "s"} this month` : "Tender and project dates in order"}
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
                    <div key={day} className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
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
                              <div key={event.id} className={cn("hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:block", meta.pill)}>
                                <span className="block truncate">{event.title}</span>
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
                            <p className="hidden text-[11px] font-medium text-muted-foreground sm:block">+{dayEvents.length - 2} more</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <EventList events={listEvents} emptyText="No upcoming deadlines or activities." onOpen={openEvent} grouped />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92dvh]">
          <DialogHeader>
            <DialogTitle>{editEvent ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))} placeholder="Event title" />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Input value={form.eventType} onChange={(event) => setForm((previous) => ({ ...previous, eventType: event.target.value }))} placeholder="e.g. Meeting, Site Visit" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editEvent && (
              <Button variant="destructive" onClick={handleDelete} className="mr-auto">
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editEvent ? "Save" : "Add Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white/75 p-3 shadow-sm dark:border-emerald-900/40 dark:bg-background/50">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-none text-emerald-700 dark:text-emerald-300">{value}</p>
    </div>
  );
}

function SelectedDatePanel({ selectedDay, events, onOpen, onAdd }) {
  return (
    <Card className="rounded-2xl border shadow-sm xl:sticky xl:top-4 xl:self-start">
      <CardHeader className="border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Date Focus</CardTitle>
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
        const isPast = event.date < toLocalDateString(new Date());
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
                <Badge variant="outline" className={cn("h-6 rounded-full px-2 text-[11px]", meta.badge)}>
                  {isPast && event.type === "overdue" ? "Overdue" : meta.label}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDate(event.date)}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">{event.title}</p>
              {event.description && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{event.description}</p>
              )}
            </div>
            {event.actionLabel && (
              <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-emerald-700">
                <span className="hidden sm:inline">{event.actionLabel}</span>
                <ExternalLink className="h-4 w-4" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
