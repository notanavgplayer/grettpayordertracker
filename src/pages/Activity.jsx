import { useMemo, useState } from "react";
import { usePaginatedCollection } from "@/hooks/useFirestore";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTableSkeleton } from "@/components/shared/LoadingSkeletons";
import LoadState from "@/components/shared/LoadState";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Circle,
  Clock3,
  FileStack,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  StickyNote,
  Trash2,
  Upload,
  Users,
  WalletCards,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TYPE_META = {
  tender: { icon: FileStack, label: "Tender", tone: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/60" },
  payOrder: { icon: WalletCards, label: "Pay Order", tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60" },
  todo: { icon: CheckSquare, label: "Task", tone: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/60" },
  note: { icon: StickyNote, label: "Note", tone: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800" },
  expense: { icon: Receipt, label: "Expense", tone: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900/60" },
  contact: { icon: Users, label: "Contact", tone: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-900/60" },
  document: { icon: FileText, label: "Document", tone: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-900/60" },
  other: { icon: Activity, label: "Activity", tone: "bg-muted text-muted-foreground border-border" },
};

const ACTION_META = {
  created: {
    icon: Plus,
    label: "Created",
    verb: "created",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  updated: {
    icon: Pencil,
    label: "Updated",
    verb: "updated",
    tone: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  deleted: {
    icon: Trash2,
    label: "Deleted",
    verb: "deleted",
    tone: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
    dot: "bg-red-500",
  },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    verb: "completed",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  reopened: {
    icon: RotateCcw,
    label: "Reopened",
    verb: "reopened",
    tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  statusChanged: {
    icon: AlertCircle,
    label: "Status Changed",
    verb: "changed status for",
    tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  uploaded: {
    icon: Upload,
    label: "Document Uploaded",
    verb: "uploaded",
    tone: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/30 dark:text-purple-300",
    dot: "bg-purple-500",
  },
};

const FILTERS = ["All", "Tenders", "Pay Orders", "Tasks", "Other"];

function toDate(ts) {
  if (!ts) return null;
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatWhen(ts) {
  const date = toDate(ts);
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAbsolute(ts) {
  const date = toDate(ts);
  if (!date) return "";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByDay(logs) {
  const groups = new Map();
  for (const log of logs) {
    const date = toDate(log.createdAt);
    let key = "Earlier";
    if (date) {
      const today = startOfDay(new Date());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const day = startOfDay(date);
      if (day.getTime() === today.getTime()) key = "Today";
      else if (day.getTime() === yesterday.getTime()) key = "Yesterday";
      else {
        key = day.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  }
  return Array.from(groups.entries());
}

function matchesFilter(log, filter) {
  if (filter === "All") return true;
  if (filter === "Tenders") return log.type === "tender";
  if (filter === "Pay Orders") return log.type === "payOrder";
  if (filter === "Tasks") return log.type === "todo";
  if (filter === "Other") return !["tender", "payOrder", "todo"].includes(log.type);
  return true;
}

function getActionMeta(log) {
  const action = String(log.action || "").toLowerCase();
  if (action.includes("status")) return ACTION_META.statusChanged;
  if (action.includes("upload")) return ACTION_META.uploaded;
  return ACTION_META[action] || {
    icon: Circle,
    label: log.action || "Changed",
    verb: log.action || "changed",
    tone: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  };
}

function getActivityTitle(log, actionMeta) {
  if (!log.type && (log.po || log.ref || log.next)) return log.action || "Activity logged";
  const typeMeta = TYPE_META[log.type] || TYPE_META.other;
  return `${typeMeta.label} ${actionMeta.verb}`;
}

function getActivityDescription(log) {
  if (!log.type && (log.po || log.ref || log.next)) {
    const parts = [];
    if (log.po) parts.push(`PO ${log.po}`);
    if (log.ref) parts.push(log.ref);
    if (log.next) parts.push(`Next: ${log.next}`);
    return parts.join(" · ");
  }
  if (log.meta?.tender) return `Related to ${log.meta.tender}`;
  if (log.meta?.po) return `Related to PO ${log.meta.po}`;
  if (log.entityId) return `Record ID ${log.entityId}`;
  return "System activity update";
}

function getStats(logs) {
  const today = startOfDay(new Date());
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  return {
    today: logs.filter((log) => {
      const date = toDate(log.createdAt);
      return date && startOfDay(date).getTime() === today.getTime();
    }).length,
    week: logs.filter((log) => {
      const date = toDate(log.createdAt);
      return date && startOfDay(date) >= weekStart;
    }).length,
    tenders: logs.filter((log) => log.type === "tender").length,
    payOrders: logs.filter((log) => log.type === "payOrder").length,
  };
}

export default function ActivityPage() {
  const { data: logs, loading, loadingMore, error, hasMore, loadMore, retry } = usePaginatedCollection("activityLog", "createdAt", "desc", 50);
  const [filter, setFilter] = useState("All");

  const filtered = useMemo(
    () => logs.filter((log) => matchesFilter(log, filter)),
    [logs, filter],
  );
  const grouped = useMemo(() => groupByDay(filtered), [filtered]);
  const stats = useMemo(() => getStats(logs), [logs]);

  if (loading) return <PageTableSkeleton rows={8} cols={5} metrics={0} />;
  if (error && logs.length === 0) return <LoadState title="Activity could not be loaded" error={error} retry={retry} />;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Activity Log"
        description="Track recent actions and load older history when needed"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ActivitySummaryCard icon={Clock3} label="Today's Activity" value={stats.today} helper="Within loaded history" tone="emerald" />
        <ActivitySummaryCard icon={Activity} label="This Week" value={stats.week} helper="Within loaded history" tone="blue" />
        <ActivitySummaryCard icon={FileStack} label="Tender Updates" value={stats.tenders} helper="Within loaded history" tone="amber" />
        <ActivitySummaryCard icon={WalletCards} label="Pay Order Updates" value={stats.payOrders} helper="Within loaded history" tone="green" />
      </div>

      <Card className="rounded-xl">
        <CardHeader className="border-b p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Audit Trail</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {filtered.length} loaded {filtered.length === 1 ? "entry" : "entries"} shown
              </p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0" role="group" aria-label="Activity filter">
              {FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={`h-9 shrink-0 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    filter === option
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  aria-pressed={filter === option}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No activity recorded yet."
              description="Updates will appear here when you create or modify records."
            />
          ) : (
            <div className="space-y-7">
              {grouped.map(([day, entries]) => (
                <section key={day} aria-labelledby={`activity-${day}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <h2 id={`activity-${day}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {day}
                    </h2>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="relative space-y-3 before:absolute before:left-[18px] before:top-3 before:h-[calc(100%-1.5rem)] before:w-px before:bg-border">
                    {entries.map((log) => (
                      <TimelineItem key={log.id} log={log} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {(hasMore || loadingMore || error) && logs.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-2 border-t pt-4">
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {hasMore && (
                <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loadingMore ? "Loading…" : "Load 50 more"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivitySummaryCard({ icon: Icon, label, value, helper, tone }) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300",
    green: "border-green-200 bg-green-50/70 text-green-700 dark:border-green-900/60 dark:bg-green-950/25 dark:text-green-300",
    blue: "border-blue-200 bg-blue-50/70 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-blue-300",
    amber: "border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300",
  };

  return (
    <Card className={`rounded-xl ${toneClasses[tone] || toneClasses.emerald}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-background/30">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground/70">{label}</p>
          <p className="mt-1 text-2xl font-semibold leading-none text-foreground">{value}</p>
          <p className="mt-1 hidden truncate text-xs text-muted-foreground sm:block">{helper}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineItem({ log }) {
  const typeMeta = TYPE_META[log.type] || TYPE_META.other;
  const actionMeta = getActionMeta(log);
  const TypeIcon = typeMeta.icon;
  const ActionIcon = actionMeta.icon;
  const title = getActivityTitle(log, actionMeta);
  const description = getActivityDescription(log);

  return (
    <article className="relative pl-12">
      <div className="absolute left-0 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border bg-background" aria-hidden="true">
        <span className={`absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background ${actionMeta.dot}`}>
          <ActionIcon className="h-2.5 w-2.5 text-white" />
        </span>
        <TypeIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="rounded-xl border bg-card p-3.5 transition-colors hover:bg-accent/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`rounded-full ${typeMeta.tone}`}>
                {typeMeta.label}
              </Badge>
              <Badge variant="outline" className={`rounded-full ${actionMeta.tone}`}>
                {actionMeta.label}
              </Badge>
            </div>
            <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">
              {title}: {log.title || log.po || "(untitled)"}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
            {log.by && (
              <p className="mt-2 text-xs text-muted-foreground">
                Changed by <span className="font-medium text-foreground">{log.by}</span>
              </p>
            )}
          </div>
          <time
            className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground"
            title={formatAbsolute(log.createdAt)}
          >
            {formatWhen(log.createdAt)}
          </time>
        </div>
      </div>
    </article>
  );
}
