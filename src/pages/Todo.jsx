import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDelete from "@/components/shared/ConfirmDelete";
import KpiCard from "@/components/shared/KpiCard";
import LoadState from "@/components/shared/LoadState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useCollection, useFirestoreCRUD } from "@/hooks/useFirestore";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/firebase";
import { deriveCalendarEvents, filterTasks, taskDue, taskOverdue, taskTitle, todayInKarachi, validDateOnly } from "@/lib/calendarTodo";
import { cn, isTaskDone } from "@/lib/utils";

const STATUSES = ["Open", "Today", "Upcoming", "Overdue", "Completed", "No Due Date", "All"];
const PRIORITIES = ["low", "medium", "high"];
const blank = { text: "", priority: "medium", dueDate: "" };
function dateLabel(value) {
  const date = validDateOnly(value);
  return date ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "No due date";
}

export default function Todo() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkedTaskId = searchParams.get("task");
  const { data: todos, loading, error } = useCollection("todos", "createdAt", "desc");
  const { data: tenders } = useCollection("tenders");
  const { data: payOrders } = useCollection("payOrders");
  const { add, update, remove } = useFirestoreCRUD("todos");
  const { isAdmin, displayName } = useAuth();
  const today = todayInKarachi();
  const [status, setStatus] = useState("Open");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("All");
  const [project, setProject] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [form, setForm] = useState(blank);
  const [original, setOriginal] = useState(blank);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const toggleLock = useRef(new Set());
  const [pending, setPending] = useState([]);
  const [deleteId, setDeleteId] = useState(null);
  const projects = useMemo(() => [...new Set(todos.map((task) => task.project).filter(Boolean))].sort(), [todos]);
  const taskScope = useMemo(() => linkedTaskId ? todos.filter((task) => task.id === linkedTaskId) : todos, [todos, linkedTaskId]);
  const filtered = useMemo(() => filterTasks(taskScope, { status: linkedTaskId ? "All" : status, search, priority, project, today }), [taskScope, linkedTaskId, status, search, priority, project, today]);
  const scope = useMemo(() => filterTasks(taskScope, { status: "All", search, priority, project, today }), [taskScope, search, priority, project, today]);
  const followUps = useMemo(() => deriveCalendarEvents({ tenders, payOrders, today })
    .filter((event) => (event.kind === "payOrder" || (event.kind === "submission" && event.actionable)) && event.date >= today).slice(0, 5), [tenders, payOrders, today]);
  const stats = [
    { label: "Open", value: scope.filter((task) => !isTaskDone(task)).length, helper: "Manual tasks", icon: Clock3, tone: "emerald" },
    { label: "Today", value: scope.filter((task) => !isTaskDone(task) && taskDue(task) === today).length, helper: "Due today", icon: Clock3, tone: "blue" },
    { label: "Overdue", value: scope.filter((task) => taskOverdue(task, today)).length, helper: "Open tasks past due", icon: AlertTriangle, tone: "rose" },
    { label: "Completed", value: scope.filter(isTaskDone).length, helper: "Finished manual tasks", icon: CheckCircle2, tone: "amber" },
  ];
  const openForm = (task = null) => {
    if (!isAdmin) return;
    const next = task ? { text: taskTitle(task), priority: task.priority || "medium", dueDate: taskDue(task) } : { ...blank };
    setEditTask(task); setForm(next); setOriginal(next); setFormError(""); setDialogOpen(true);
  };
  const closeForm = (open) => {
    if (open || saving) return;
    if (JSON.stringify(form) !== JSON.stringify(original)) setDiscardOpen(true);
    else setDialogOpen(false);
  };
  const saveTask = async () => {
    if (saveLock.current) return;
    if (!form.text.trim() || form.text.trim().length > 1000) { setFormError("Enter a task title of 1–1000 characters."); return; }
    if (form.dueDate && !validDateOnly(form.dueDate)) { setFormError("Enter a valid due date."); return; }
    saveLock.current = true; setSaving(true); setFormError("");
    try {
      const data = { text: form.text.trim(), priority: form.priority, dueDate: form.dueDate || "" };
      if (editTask) {
        const changes = Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== original[key]));
        if (!Object.keys(changes).length) { setDialogOpen(false); return; }
        await update(editTask.id, changes);
        logActivity({ type: "todo", action: "updated", title: data.text, entityId: editTask.id, by: displayName });
      } else {
        const id = await add({ ...data, done: false });
        logActivity({ type: "todo", action: "created", title: data.text, entityId: id, by: displayName });
      }
      toast.success(editTask ? "Task updated" : "Task added"); setDialogOpen(false);
    } catch (err) { console.error("Task save failed", err); setFormError("Task could not be saved. Your entries are still here; check permissions and try again."); }
    finally { saveLock.current = false; setSaving(false); }
  };
  const toggleDone = async (task) => {
    if (!isAdmin || toggleLock.current.has(task.id)) return;
    toggleLock.current.add(task.id); setPending([...toggleLock.current]);
    const next = !isTaskDone(task);
    try {
      await updateDoc(doc(db, "todos", task.id), { done: next,
        ...(Object.hasOwn(task, "completed") ? { completed: deleteField() } : {}),
        ...(Object.hasOwn(task, "status") ? { status: deleteField() } : {}) });
      logActivity({ type: "todo", action: next ? "completed" : "reopened", title: taskTitle(task), entityId: task.id, by: displayName });
    } catch (err) { console.error("Task status failed", err); toast.error("Task status could not be changed. It remains as before."); }
    finally { toggleLock.current.delete(task.id); setPending([...toggleLock.current]); }
  };
  const clear = () => { setStatus("Open"); setSearch(""); setPriority("All"); setProject("All"); };
  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <LoadState title="Tasks could not be loaded" error={error} />;
  return <div className="mx-auto w-full max-w-7xl space-y-5 sm:space-y-6">
    <PageHeader title="To-Do" description="Manual tasks and linked follow-ups" actions={isAdmin && <Button onClick={() => openForm()} className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"><Plus className="h-4 w-4" /> Add Task</Button>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map((stat) => <KpiCard key={stat.label} {...stat} />)}</div>
    <Card><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        {linkedTaskId && <Button variant="outline" onClick={() => navigate("/todo")}>Show all tasks</Button>}
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></div>
        <select aria-label="Priority filter" value={priority} onChange={(event) => setPriority(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="All">All priorities</option>{PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        {projects.length > 0 && <select aria-label="Project filter" value={project} onChange={(event) => setProject(event.target.value)} className="h-10 max-w-full rounded-md border bg-background px-3 text-sm"><option value="All">All projects</option>{projects.map((name) => <option key={name} value={name}>{name}</option>)}</select>}
        {(status !== "Open" || search || priority !== "All" || project !== "All") && <Button variant="outline" onClick={clear}>Clear filters</Button>}
      </div>
      {!linkedTaskId && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Task status filters">{STATUSES.map((item) => <button key={item} type="button" onClick={() => setStatus(item)} aria-pressed={status === item} className={cn("shrink-0 rounded-full px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", status === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")}>{item}</button>)}</div>}
      <p className="text-xs text-muted-foreground">Showing {filtered.length} manual task{filtered.length === 1 ? "" : "s"} · dates use Asia/Karachi.</p>
    </CardContent></Card>
    {filtered.length === 0 ? <Card><CardContent className="p-8"><EmptyState icon={CheckCircle2} title="No matching tasks" description="Try another status or clear filters." /></CardContent></Card> : <Card className="overflow-hidden"><div className="divide-y">{filtered.map((task) => {
      const done = isTaskDone(task), due = taskDue(task), overdue = taskOverdue(task, today);
      const linkedId = task.tenderId || task.projectId;
      const linked = linkedId && tenders.some((tender) => tender.id === linkedId);
      return <div key={task.id} className="flex min-w-0 items-start gap-3 p-4 sm:items-center">
        <input type="checkbox" checked={done} disabled={!isAdmin || pending.includes(task.id)} onChange={() => toggleDone(task)} aria-label={`Mark ${taskTitle(task)} as ${done ? "open" : "done"}`} className="mt-1 h-5 w-5 shrink-0 accent-primary sm:mt-0" />
        <div className="min-w-0 flex-1"><p title={taskTitle(task)} className={cn("break-words text-sm font-medium", done && "text-muted-foreground line-through")}>{taskTitle(task)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className={cn(overdue && "font-semibold text-red-600 dark:text-red-400")}>{overdue ? "Overdue · " : ""}{dateLabel(due)}</span><span className="capitalize">{task.priority || "No"} priority</span>{task.project && <span className="break-words">Project: {task.project}</span>}{linked && <button type="button" className="font-medium text-primary underline" onClick={() => navigate(`/tenders/${linkedId}`)}>Open project <ExternalLink className="inline h-3 w-3" /></button>}<span>Manual task</span></div>
        </div>
        {isAdmin && <div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${taskTitle(task)}`} onClick={() => openForm(task)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon-sm" aria-label={`Delete ${taskTitle(task)}`} onClick={() => setDeleteId(task.id)}><Trash2 className="h-4 w-4" /></Button></div>}
      </div>;
    })}</div></Card>}
    <Card><CardContent className="space-y-3 p-4"><div><h2 className="font-semibold">Linked follow-ups</h2><p className="text-xs text-muted-foreground">Read-only dates from tender and pay-order records. Completing a manual task does not change them.</p></div>
      {followUps.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming recorded tender or pay-order follow-ups.</p> : followUps.map((event) => <button key={event.id} type="button" onClick={() => navigate(event.link)} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-accent"><span className="min-w-0"><span className="block break-words text-sm font-medium">{event.title}</span><span className="text-xs text-muted-foreground">{event.kind === "submission" ? "Tender submission" : "Pay-order follow-up"} · {dateLabel(event.date)}</span></span><ExternalLink className="h-4 w-4 shrink-0" /></button>)}
    </CardContent></Card>
    <Dialog open={dialogOpen} onOpenChange={closeForm}><DialogContent className="max-h-[100dvh] w-full max-w-xl rounded-none sm:max-h-[92dvh] sm:rounded-2xl">
      <DialogHeader><DialogTitle>{editTask ? "Edit Task" : "Add Task"}</DialogTitle><DialogDescription>Existing task fields only. Linked source records stay unchanged.</DialogDescription></DialogHeader>
      <div className="space-y-4 py-2"><div className="space-y-1.5"><Label htmlFor="todo-title">Task title *</Label><Input id="todo-title" autoFocus maxLength={1000} value={form.text} onChange={(event) => setForm((old) => ({ ...old, text: event.target.value }))} placeholder="What needs to be done?" /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="todo-priority">Priority</Label><select id="todo-priority" value={form.priority} onChange={(event) => setForm((old) => ({ ...old, priority: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{!PRIORITIES.includes(form.priority) && <option value={form.priority}>Existing: {form.priority}</option>}{PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><div className="space-y-1.5"><Label htmlFor="todo-due-date">Due date</Label><Input id="todo-due-date" type="date" className="mobile-date-input" value={form.dueDate} onChange={(event) => setForm((old) => ({ ...old, dueDate: event.target.value }))} /></div></div>
        {editTask && <p className="text-xs text-muted-foreground">Status: {isTaskDone(editTask) ? "Completed" : "Open"}. Use the list checkbox to change it.</p>}
        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}</div>
      <DialogFooter className="sticky bottom-0 border-t bg-popover pt-3"><Button variant="outline" onClick={() => closeForm(false)} disabled={saving}>Cancel</Button><Button onClick={saveTask} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editTask ? "Save Changes" : "Add Task"}</Button></DialogFooter>
    </DialogContent></Dialog>
    <ConfirmDelete open={discardOpen} onOpenChange={setDiscardOpen} title="Discard task changes?" description="Unsaved changes will be lost." confirmLabel="Discard" onConfirm={() => { setDialogOpen(false); setDiscardOpen(false); }} />
    <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete task" description="This manual task will be permanently deleted." onConfirm={async () => { const task = todos.find((item) => item.id === deleteId); await remove(deleteId); logActivity({ type: "todo", action: "deleted", title: task ? taskTitle(task) : "(unknown)", entityId: deleteId, by: displayName }); toast.success("Task deleted"); setDeleteId(null); }} />
  </div>;
}
