import { useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Clock3,
  Flag,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDelete from "@/components/shared/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useCollection, useFirestoreCRUD } from "@/hooks/useFirestore";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/firebase";
import { cn, daysUntil, isTaskDone, shouldShowTaskOverdue } from "@/lib/utils";

const PRIORITY_STYLES = {
  high: { dot: "bg-red-500", text: "text-red-700 dark:text-red-300", label: "High" },
  medium: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", label: "Medium" },
  low: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", label: "Low" },
  none: { dot: "bg-slate-400", text: "text-muted-foreground", label: "None" },
};

const FILTERS = ["All", "Open", "Done", "High Priority", "Overdue", "Today"];
const PRIORITIES = ["low", "medium", "high"];

function normalizePriority(priority) {
  return (priority || "none").toLowerCase();
}

function getTaskTitle(todo) {
  return todo.text || todo.title || todo.taskName || "Untitled task";
}

function getTaskDueDate(todo) {
  return todo.dueDate || todo.due || "";
}

function shortDate(dateStr) {
  if (!dateStr) return "No due date";
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function Todo() {
  const { data: todos, loading } = useCollection("todos", "createdAt", "desc");
  const { add, remove } = useFirestoreCRUD("todos");
  const { isAdmin, displayName } = useAuth();

  const [text, setText] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [filter, setFilter] = useState("Open");
  const [deleteId, setDeleteId] = useState(null);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!text.trim()) return;
    setAdding(true);
    try {
      const newId = await add({
        text: text.trim(),
        priority,
        dueDate: dueDate || "",
        done: false,
      });
      logActivity({
        type: "todo",
        action: "created",
        title: text.trim(),
        entityId: newId,
        by: displayName,
      });
      setText("");
      setDueDate("");
      setPriority("medium");
    } catch (error) {
      console.error("Failed to add todo", error);
      toast.error("Could not add task. Please check your permissions.");
    } finally {
      setAdding(false);
    }
  };

  const toggleDone = async (todo) => {
    const nextDone = !isTaskDone(todo);
    try {
      await updateDoc(doc(db, "todos", todo.id), { done: nextDone });
      logActivity({
        type: "todo",
        action: nextDone ? "completed" : "reopened",
        title: getTaskTitle(todo),
        entityId: todo.id,
        by: displayName,
      });
    } catch (error) {
      console.error("Failed to update todo", error);
      toast.error("Could not update task. Please check your permissions.");
    }
  };

  const filtered = useMemo(() => {
    return todos.filter((todo) => {
      const done = isTaskDone(todo);
      const due = getTaskDueDate(todo);
      const taskPriority = normalizePriority(todo.priority);

      switch (filter) {
        case "Open":
          return !done;
        case "Done":
          return done;
        case "High Priority":
          return !done && taskPriority === "high";
        case "Overdue":
          return shouldShowTaskOverdue(todo);
        case "Today":
          return !done && daysUntil(due) === 0;
        default:
          return true;
      }
    });
  }, [todos, filter]);

  const open = todos.filter((todo) => !isTaskDone(todo)).length;
  const done = todos.filter((todo) => isTaskDone(todo)).length;
  const highPriority = todos.filter((todo) => !isTaskDone(todo) && normalizePriority(todo.priority) === "high").length;
  const overdue = todos.filter((todo) => {
    return shouldShowTaskOverdue(todo);
  }).length;

  const stats = [
    {
      title: "Open",
      value: open,
      helper: "Active items to complete",
      icon: ClipboardList,
      className: "border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300",
      iconClassName: "bg-emerald-500 text-white",
    },
    {
      title: "Done",
      value: done,
      helper: "Completed tasks",
      icon: CheckCircle2,
      className: "border-blue-200 bg-blue-50/70 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-blue-300",
      iconClassName: "bg-blue-500 text-white",
    },
    {
      title: "High Priority",
      value: highPriority,
      helper: "Need immediate attention",
      icon: Flag,
      className: "hidden border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300 sm:block",
      iconClassName: "bg-amber-400 text-white",
    },
    {
      title: "Overdue",
      value: overdue,
      helper: "Past due tasks",
      icon: Clock3,
      className: "hidden border-red-200 bg-red-50/70 text-red-700 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-300 sm:block",
      iconClassName: "bg-red-400 text-white",
    },
  ];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 sm:space-y-6">
      <PageHeader
        title="To-Do"
        description="Track tasks and follow-ups"
        className="pt-1 sm:pt-0"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className={cn("overflow-hidden rounded-xl border shadow-sm", stat.className)}>
              <CardContent className="flex items-center gap-3 p-4 sm:p-5">
                <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm sm:h-12 sm:w-12", stat.iconClassName)}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground/70 sm:text-sm">{stat.title}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{stat.value}</p>
                    <span className="hidden text-xs text-muted-foreground sm:inline">tasks</span>
                  </div>
                  <p className="mt-1 hidden truncate text-xs text-muted-foreground sm:block">{stat.helper}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isAdmin && (
        <Card className="overflow-hidden rounded-xl border shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(320px,1fr)_240px_180px_auto] 2xl:items-end">
              <div className="min-w-0 space-y-2 lg:col-span-2 2xl:col-span-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="todo-title">
                  Task
                </label>
                <div className="relative">
                  <CheckSquare className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="todo-title"
                    placeholder="What needs to be done?"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleAdd()}
                    className="h-11 w-full min-w-0 rounded-xl pl-10 text-sm shadow-none sm:h-12 sm:rounded-lg"
                    aria-label="Task title"
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Priority</p>
                <div className="grid h-11 w-full min-w-0 grid-cols-3 rounded-xl border bg-background p-1 sm:h-12 sm:rounded-lg 2xl:w-[240px]">
                  {PRIORITIES.map((priorityOption) => (
                    <button
                      key={priorityOption}
                      type="button"
                      onClick={() => setPriority(priorityOption)}
                      className={cn(
                        "rounded-md px-3 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        priority === priorityOption
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-accent"
                      )}
                      aria-pressed={priority === priorityOption}
                    >
                      {priorityOption}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0 space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="todo-due-date">
                  Due date
                </label>
                <Input
                  id="todo-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="block h-11 w-full min-w-0 max-w-full appearance-none rounded-xl text-left text-sm shadow-none sm:h-12 sm:rounded-lg 2xl:w-[180px]"
                  aria-label="Due date"
                />
              </div>

              <Button
                onClick={handleAdd}
                disabled={adding || !text.trim()}
                className="h-11 w-full rounded-xl bg-emerald-600 px-5 shadow-sm hover:bg-emerald-700 sm:h-12 sm:rounded-lg lg:self-end"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Task
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {FILTERS.map((filterOption) => (
            <button
              key={filterOption}
              onClick={() => setFilter(filterOption)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === filterOption
                  ? filterOption === "Overdue"
                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                    : "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              aria-pressed={filter === filterOption}
            >
              {filterOption}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm sm:flex">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          Sort by: Due date
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="p-8">
            <EmptyState
              icon={CheckSquare}
              title="No tasks"
              description={filter === "Open" ? "You're all caught up!" : "No tasks match this filter."}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 bg-transparent shadow-none sm:overflow-hidden sm:rounded-xl sm:border sm:bg-card sm:shadow-sm">
          <div className="space-y-3 sm:space-y-0 sm:divide-y sm:divide-border">
            {filtered.map((todo) => {
              const taskDone = isTaskDone(todo);
              const due = getTaskDueDate(todo);
              const days = due ? daysUntil(due) : null;
              const isOverdue = shouldShowTaskOverdue(todo);
              const taskPriority = normalizePriority(todo.priority);
              const priorityStyle = PRIORITY_STYLES[taskPriority] || PRIORITY_STYLES.none;
              const title = getTaskTitle(todo);

              return (
                <div
                  key={todo.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent/30 sm:items-center sm:rounded-none sm:border-0 sm:px-5 sm:shadow-none",
                    isOverdue && !taskDone && "bg-red-50/60 hover:bg-red-50 dark:bg-red-950/10 dark:hover:bg-red-950/20"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={taskDone}
                    onChange={() => toggleDone(todo)}
                    className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-border accent-primary sm:mt-0"
                    aria-label={`Mark ${title} as ${taskDone ? "open" : "done"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px] font-medium leading-5 text-foreground sm:text-sm", taskDone && "text-muted-foreground line-through")}>
                      {title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className={cn(isOverdue && !taskDone && "font-medium text-red-600 dark:text-red-400")}>
                          {isOverdue && !taskDone
                            ? `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""}`
                            : shortDate(due)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-0.5 sm:min-w-[142px] sm:justify-end sm:pt-0">
                    {isOverdue && !taskDone && (
                      <AlertTriangle className="hidden h-4 w-4 text-red-500 sm:block" aria-label="Overdue" />
                    )}
                    {taskPriority !== "none" && (
                      <span className={cn("inline-flex items-center gap-2 text-xs font-medium", priorityStyle.text)}>
                        <span className={cn("h-2 w-2 rounded-full", priorityStyle.dot)} aria-hidden="true" />
                        <span className="hidden sm:inline">{priorityStyle.label}</span>
                      </span>
                    )}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(todo.id)}
                        aria-label={`Delete ${title}`}
                      >
                        <MoreVertical className="h-4 w-4 sm:hidden" />
                        <Trash2 className="hidden h-3.5 w-3.5 sm:block" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <ConfirmDelete
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={async () => {
          const task = todos.find((todo) => todo.id === deleteId);
          try {
            await remove(deleteId);
            logActivity({
              type: "todo",
              action: "deleted",
              title: task ? getTaskTitle(task) : "(unknown)",
              entityId: deleteId,
              by: displayName,
            });
            toast.success("Task deleted");
            setDeleteId(null);
          } catch (error) {
            console.error("Failed to delete todo", error);
            toast.error("Could not delete task. Please check your permissions.");
          }
        }}
        title="Delete task"
        description="This task will be permanently deleted."
      />
    </div>
  );
}
