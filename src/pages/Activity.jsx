import { useMemo, useState } from "react";
import { useCollection } from "@/hooks/useFirestore";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTableSkeleton } from "@/components/shared/LoadingSkeletons";
import {
  Activity,
  FileStack,
  FileText,
  CheckSquare,
  StickyNote,
  Receipt,
  Users,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Circle,
} from "lucide-react";

const TYPE_META = {
  tender: { icon: FileStack, label: "Tender" },
  payOrder: { icon: FileText, label: "Pay Order" },
  todo: { icon: CheckSquare, label: "Task" },
  note: { icon: StickyNote, label: "Note" },
  expense: { icon: Receipt, label: "Expense" },
  contact: { icon: Users, label: "Contact" },
  other: { icon: Activity, label: "Activity" },
};

const ACTION_META = {
  created: {
    icon: Plus,
    verb: "created",
    tone: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  updated: {
    icon: Pencil,
    verb: "updated",
    tone: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  deleted: {
    icon: Trash2,
    verb: "deleted",
    tone: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
  completed: {
    icon: CheckCircle2,
    verb: "completed",
    tone: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  reopened: {
    icon: RotateCcw,
    verb: "reopened",
    tone: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
};

const FILTERS = ["All", "Tenders", "Pay Orders", "Tasks", "Other"];

function formatWhen(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAbsolute(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByDay(logs) {
  const groups = new Map();
  for (const l of logs) {
    const d = l.createdAt?.toDate
      ? l.createdAt.toDate()
      : l.createdAt
        ? new Date(l.createdAt)
        : null;
    let key = "Earlier";
    if (d && !isNaN(d)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      if (day.getTime() === today.getTime()) key = "Today";
      else if (day.getTime() === yesterday.getTime()) key = "Yesterday";
      else
        key = day.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  return Array.from(groups.entries());
}

function matchesFilter(l, f) {
  if (f === "All") return true;
  if (f === "Tenders") return l.type === "tender";
  if (f === "Pay Orders") return l.type === "payOrder";
  if (f === "Tasks") return l.type === "todo";
  if (f === "Other") return !["tender", "payOrder", "todo"].includes(l.type);
  return true;
}

export default function ActivityPage() {
  const { data: logs, loading } = useCollection(
    "activityLog",
    "createdAt",
    "desc",
  );
  const [filter, setFilter] = useState("All");

  const filtered = useMemo(
    () => logs.filter((l) => matchesFilter(l, filter)),
    [logs, filter],
  );
  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  if (loading) return <PageTableSkeleton rows={8} cols={5} metrics={0} />;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Activity"
        description="Real-time feed of changes across tenders, pay orders, and tasks"
      />

      {/* Filters */}
      <div
        className="flex gap-1.5 flex-wrap"
        role="group"
        aria-label="Activity filter"
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            aria-pressed={filter === f}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={
            filter === "All"
              ? "No activity yet"
              : `No ${filter.toLowerCase()} activity`
          }
          description="Changes will appear here in real time as you create, update, or delete records."
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([day, entries]) => (
            <section key={day}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {day}
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {entries.map((l) => {
                    const typeMeta = TYPE_META[l.type] || TYPE_META.other;
                    const actionMeta = ACTION_META[l.action] || {
                      icon: Circle,
                      verb: l.action || "changed",
                      tone: "text-muted-foreground",
                      dot: "bg-muted-foreground",
                    };
                    const TypeIcon = typeMeta.icon;
                    const ActionIcon = actionMeta.icon;
                    // legacy PO follow-up entries (no type/action verb, but have po/ref/next fields)
                    const isLegacy = !l.type && (l.po || l.ref || l.next);
                    return (
                      <li key={l.id}>
                        <CardContent className="flex items-start gap-3 py-3 px-4">
                          <div
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted flex-shrink-0 relative"
                            aria-hidden="true"
                          >
                            <TypeIcon className="h-4 w-4 text-muted-foreground" />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background ${actionMeta.dot}`}
                            >
                              <ActionIcon className="h-2.5 w-2.5 text-white" />
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            {isLegacy ? (
                              <>
                                <p className="text-sm text-foreground break-words">
                                  <span className="font-medium">
                                    {l.action || "Logged"}
                                  </span>
                                  {l.po && (
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {" "}
                                      · {l.po}
                                    </span>
                                  )}
                                </p>
                                {(l.ref || l.next) && (
                                  <p className="text-xs text-muted-foreground mt-1 break-words">
                                    {l.ref && (
                                      <span className="font-mono">{l.ref}</span>
                                    )}
                                    {l.ref && l.next && <span> · </span>}
                                    {l.next && <span>Next: {l.next}</span>}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-sm text-foreground break-words leading-snug">
                                  <Badge
                                    variant="secondary"
                                    className="mr-2 text-[10px] align-middle"
                                  >
                                    {typeMeta.label}
                                  </Badge>
                                  <span
                                    className={`font-medium ${actionMeta.tone}`}
                                  >
                                    {actionMeta.verb}
                                  </span>{" "}
                                  <span className="font-medium text-foreground">
                                    {l.title || "(untitled)"}
                                  </span>
                                </p>
                                {l.meta?.tender && (
                                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                                    on {l.meta.tender}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p
                              className="text-xs text-muted-foreground whitespace-nowrap"
                              title={formatAbsolute(l.createdAt)}
                            >
                              {formatWhen(l.createdAt)}
                            </p>
                            {l.by && (
                              <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate max-w-[120px]">
                                {l.by}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
