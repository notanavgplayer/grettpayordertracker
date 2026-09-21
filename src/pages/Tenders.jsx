import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "@/hooks/useFirestore";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  formatDate,
  formatCurrencyPrecise,
  calculateTenderFinancials,
  getTenderDisplayStatus,
  TENDER_STATUSES,
  uid,
} from "@/lib/utils";
import { exportTendersCSV } from "@/lib/export";
import { logActivity } from "@/lib/activity";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDelete from "@/components/shared/ConfirmDelete";
import TenderQuickView from "@/components/shared/TenderQuickView";
import KpiCard from "@/components/shared/KpiCard";
import { PageTableSkeleton } from "@/components/shared/LoadingSkeletons";
import LoadState from "@/components/shared/LoadState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  FileStack,
  Download,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Clock3,
  ExternalLink,
  Filter,
  Landmark,
  TrendingUp,
  X,
  CheckCircle,
  Calendar,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

const TERMINAL_STATUSES = ["Completed", "Lost", "Cancelled"];
const PIPELINE_STAGES = [
  "Draft",
  "Bidding",
  "Submitted",
  "Awarded",
  "In Progress",
  "Completed",
  "Lost",
  "Cancelled",
];
const FILTER_STATUSES = ["All", ...PIPELINE_STAGES, "Overdue"];
const SORT_OPTIONS = [
  { value: "submissionDate", label: "Submission Date" },
  { value: "openingDate", label: "Opening Date" },
  { value: "value", label: "Value" },
  { value: "status", label: "Status" },
];
const STATUS_TONES = {
  Bidding: {
    border: "border-amber-300/70 dark:border-amber-800/70",
    bg: "bg-amber-50/70 dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-400",
    active: "bg-amber-600 text-white",
  },
  Submitted: {
    border: "border-blue-300/70 dark:border-blue-800/70",
    bg: "bg-blue-50/70 dark:bg-blue-950/20",
    text: "text-blue-700 dark:text-blue-400",
    active: "bg-blue-600 text-white",
  },
  Awarded: {
    border: "border-teal-300/70 dark:border-teal-800/70",
    bg: "bg-teal-50/70 dark:bg-teal-950/20",
    text: "text-teal-700 dark:text-teal-400",
    active: "bg-teal-600 text-white",
  },
  "In Progress": {
    border: "border-violet-300/70 dark:border-violet-800/70",
    bg: "bg-violet-50/70 dark:bg-violet-950/20",
    text: "text-violet-700 dark:text-violet-400",
    active: "bg-violet-600 text-white",
  },
  Completed: {
    border: "border-emerald-300/70 dark:border-emerald-800/70",
    bg: "bg-emerald-50/70 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-400",
    active: "bg-emerald-600 text-white",
  },
  Lost: {
    border: "border-red-300/70 dark:border-red-800/70",
    bg: "bg-red-50/70 dark:bg-red-950/20",
    text: "text-red-700 dark:text-red-400",
    active: "bg-red-600 text-white",
  },
  Cancelled: {
    border: "border-slate-300/70 dark:border-slate-700/70",
    bg: "bg-slate-50/70 dark:bg-slate-900/30",
    text: "text-slate-700 dark:text-slate-400",
    active: "bg-slate-600 text-white",
  },
  Overdue: {
    border: "border-red-300/70 dark:border-red-800/70",
    bg: "bg-red-50/70 dark:bg-red-950/20",
    text: "text-red-700 dark:text-red-400",
    active: "bg-red-600 text-white",
  },
};

// Compute display status on read without touching Firestore.
function resolveStatus(t) {
  return getTenderDisplayStatus(t);
}

const EMPTY_TENDER = {
  name: "",
  nit: "",
  agency: "",
  value: "",
  estimatedCost: "",
  quotedAmount: "",
  tenderFee: "",
  status: "Bidding",
  submissionDate: "",
  openingDate: "",
  linkedPO: "",
  notes: "",
  contact: "",
  checklist: [],
  bills: [],
  raBills: [],
  documents: [],
  statusHistory: [],
};

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDateValue(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameStatus(status, target) {
  return String(status || "").trim().toLowerCase() === target.toLowerCase();
}

export default function Tenders() {
  const { data: tenders, loading, error } = useCollection(
    "tenders",
    "createdAt",
    "desc",
  );
  const { isAdmin, displayName } = useAuth();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterAgency, setFilterAgency] = useState("All");
  const [submissionFrom, setSubmissionFrom] = useState("");
  const [submissionTo, setSubmissionTo] = useState("");
  const [sortBy, setSortBy] = useState("submissionDate");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_TENDER);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [quickView, setQuickView] = useState(null);

  // Tenders enriched with computed display status (may be 'Overdue')
  const tendersResolved = useMemo(
    () => tenders.map((t) => ({ ...t, displayStatus: resolveStatus(t) })),
    [tenders],
  );

  const agencies = useMemo(() => {
    return Array.from(
      new Set(
        tendersResolved
          .map((t) => String(t.agency || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [tendersResolved]);

  const filtered = useMemo(() => {
    const from = parseDateValue(submissionFrom);
    const to = parseDateValue(submissionTo);
    return tendersResolved
      .filter((t) => {
        if (filterStatus !== "All" && t.displayStatus !== filterStatus)
          return false;
        if (filterAgency !== "All" && t.agency !== filterAgency) return false;
        const submissionDate = parseDateValue(t.submissionDate);
        if (from && (!submissionDate || submissionDate < from)) return false;
        if (to && (!submissionDate || submissionDate > to)) return false;
        if (!search) return true;
      const q = search.toLowerCase();
      return [t.name, t.agency, t.nit].some((v) =>
        (v || "").toLowerCase().includes(q),
      );
      })
      .sort((a, b) => {
        if (sortBy === "value") return toNumber(b.value) - toNumber(a.value);
        if (sortBy === "status") {
          return String(a.displayStatus || "").localeCompare(
            String(b.displayStatus || ""),
          );
        }
        const aDate = parseDateValue(a[sortBy])?.getTime() || Number.MAX_SAFE_INTEGER;
        const bDate = parseDateValue(b[sortBy])?.getTime() || Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      });
  }, [
    tendersResolved,
    search,
    filterStatus,
    filterAgency,
    submissionFrom,
    submissionTo,
    sortBy,
  ]);

  const numericRowsPerPage = rowsPerPage === "all" ? filtered.length || 1 : Number(rowsPerPage);
  const pageCount = rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / numericRowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageStart = rowsPerPage === "all" ? 0 : (currentPage - 1) * numericRowsPerPage;
  const pageEnd = rowsPerPage === "all" ? filtered.length : pageStart + numericRowsPerPage;
  const paginatedTenders = filtered.slice(pageStart, pageEnd);
  const displayStart = filtered.length === 0 ? 0 : pageStart + 1;
  const displayEnd = Math.min(pageEnd, filtered.length);
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((pageNumber) => pageCount <= 5 || Math.abs(pageNumber - currentPage) <= 2);
  const paginationText = filtered.length === 0
    ? "Showing 0 tenders"
    : rowsPerPage === "all" || filtered.length <= numericRowsPerPage
    ? `Showing all ${filtered.length} ${filtered.length === 1 ? "tender" : "tenders"}`
    : `Showing ${displayStart} to ${displayEnd} of ${filtered.length} tenders`;
  const showPaginationControls = rowsPerPage !== "all" && filtered.length > numericRowsPerPage;
  const hasActiveFilters =
    search ||
    filterStatus !== "All" ||
    filterAgency !== "All" ||
    submissionFrom ||
    submissionTo ||
    sortBy !== "submissionDate";

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, filterAgency, submissionFrom, submissionTo, sortBy, rowsPerPage]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const stageCounts = useMemo(() => {
    const counts = { All: tendersResolved.length };
    FILTER_STATUSES.forEach((status) => {
      if (status === "All") return;
      counts[status] = tendersResolved.filter((t) =>
        isSameStatus(t.displayStatus, status),
      ).length;
    });
    return counts;
  }, [tendersResolved]);

  const pipelineCards = useMemo(() => {
    const countAny = (statuses) =>
      tendersResolved.filter((t) =>
        statuses.some((status) => isSameStatus(t.displayStatus, status)),
      ).length;

    return [
      {
        label: "Total Tenders",
        value: tendersResolved.length,
        helper: "All records",
        icon: FileStack,
        tone: "emerald",
      },
      {
        label: "Draft",
        value: countAny(["Draft"]),
        helper: "Being prepared",
        icon: Pencil,
        tone: "slate",
      },
      {
        label: "Bidding",
        value: countAny(["Bidding"]),
        helper: "Submission pipeline",
        icon: Clock3,
        tone: "amber",
      },
      {
        label: "Submitted",
        value: countAny(["Submitted"]),
        helper: "Awaiting results",
        icon: CheckCircle,
        tone: "blue",
      },
      {
        label: "Awarded / Won",
        value: countAny(["Awarded", "Won"]),
        helper: "Converted projects",
        icon: BriefcaseBusiness,
        tone: "teal",
      },
      {
        label: "In Progress",
        value: countAny(["In Progress"]),
        helper: "Execution active",
        icon: TrendingUp,
        tone: "violet",
      },
      {
        label: "Completed",
        value: countAny(["Completed"]),
        helper: "Closed work",
        icon: CheckCircle,
        tone: "emerald",
      },
      {
        label: "Lost / Cancelled",
        value: countAny(["Lost", "Cancelled"]),
        helper: "Not active",
        icon: X,
        tone: "red",
      },
    ];
  }, [tendersResolved]);

  const financeCards = useMemo(() => {
    const summaries = tendersResolved.map((t) => ({
      tender: t,
      financials: calculateTenderFinancials(t),
    }));
    const estimatedTotal = summaries.reduce(
      (sum, item) => sum + toNumber(item.financials.estimatedCost),
      0,
    );
    const quotedTotal = summaries.reduce(
      (sum, item) => sum + toNumber(item.financials.quotedAmount),
      0,
    );
    const awardedValue = summaries
      .filter((item) =>
        ["Awarded", "Won", "In Progress", "Completed"].some((status) =>
          isSameStatus(item.tender.displayStatus, status),
        ),
      )
      .reduce(
        (sum, item) =>
          sum +
          toNumber(item.tender.value || item.financials.quotedAmount),
        0,
      );
    const activeValue = summaries
      .filter(
        (item) =>
          !TERMINAL_STATUSES.some((status) =>
            isSameStatus(item.tender.displayStatus, status),
          ),
      )
      .reduce(
        (sum, item) =>
          sum +
          toNumber(
            item.tender.value ||
              item.financials.quotedAmount ||
              item.financials.estimatedCost,
          ),
        0,
      );
    const percentages = summaries
      .map((item) => item.financials.percentage)
      .filter((value) => Number.isFinite(value));
    const averageQuotedPercent = percentages.length
      ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
      : null;

    return [
      {
        label: "Estimated Total",
        value: formatCurrencyPrecise(estimatedTotal, 0),
        helper: "Tender estimates",
        icon: Landmark,
      },
      {
        label: "Quoted Total",
        value: formatCurrencyPrecise(quotedTotal, 0),
        helper: "Submitted quote value",
        icon: Banknote,
      },
      {
        label: "Awarded Contract Value",
        value: formatCurrencyPrecise(awardedValue, 0),
        helper: "Awarded and active work",
        icon: BriefcaseBusiness,
      },
      {
        label: "Average Quoted %",
        value:
          averageQuotedPercent === null
            ? "â€”"
            : `${averageQuotedPercent.toFixed(2)}%`,
        helper: "Average variance",
        icon: BarChart3,
      },
      {
        label: "Active Tender Value",
        value: formatCurrencyPrecise(activeValue, 0),
        helper: "Open pipeline value",
        icon: TrendingUp,
      },
    ];
  }, [tendersResolved]);

  const clearFilters = () => {
    setSearch("");
    setFilterStatus("All");
    setFilterAgency("All");
    setSubmissionFrom("");
    setSubmissionTo("");
    setSortBy("submissionDate");
  };

  const openDialog = (item = null) => {
    setEditItem(item);
    setForm(item ? { ...EMPTY_TENDER, ...item } : { ...EMPTY_TENDER });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast.error("Tender name is required");
      return;
    }
    const invalidMoneyField = [
      ["Tender value", form.value, false],
      ["Estimated cost", form.estimatedCost, true],
      ["Quoted amount", form.quotedAmount, true],
      ["Tender fee", form.tenderFee, true],
    ].find(([, raw, optional]) => !(optional && raw === "") && (!Number.isFinite(Number(raw)) || Number(raw) < 0));
    if (invalidMoneyField) {
      toast.error(`${invalidMoneyField[0]} must be a non-negative number.`);
      return;
    }
    if (editItem && form.status === "Completed" && editItem.status !== "Completed") {
      toast.error("Complete this tender from its detail page so the completion snapshot is recorded.");
      return;
    }

    // Duplicate NIT detection
    if (form.nit && !editItem) {
      const dup = tenders.find(
        (t) => t.nit?.toLowerCase() === form.nit.toLowerCase(),
      );
      if (dup) {
        const ok = window.confirm(
          `⚠️ A tender with NIT/Ref "${form.nit}" already exists:\n\n"${dup.name || "Untitled"}" — ${dup.agency || "No agency"} (${dup.status || "—"})\n\nDo you still want to create this tender?`,
        );
        if (!ok) return;
      }
    }

    // Duplicate name + agency detection
    if (form.name && form.agency && !editItem) {
      const dup = tenders.find(
        (t) =>
          t.name?.toLowerCase() === form.name.toLowerCase() &&
          t.agency?.toLowerCase() === form.agency.toLowerCase(),
      );
      if (dup) {
        const ok = window.confirm(
          `⚠️ A tender with the same name and agency already exists:\n\n"${dup.name}" — ${dup.agency} (${dup.status || "—"})\n\nDo you still want to create this tender?`,
        );
        if (!ok) return;
      }
    }

    setSaving(true);
    try {
      const tenderFeeNum = Number(form.tenderFee) || 0;
      const { id: _formId, displayStatus: _displayStatus, ...formData } = form;
      const data = {
        ...formData,
        value: Number(form.value) || 0,
        estimatedCost: form.estimatedCost === "" ? null : Number(form.estimatedCost) || 0,
        quotedAmount: form.quotedAmount === "" ? null : Number(form.quotedAmount) || 0,
        tenderFee: tenderFeeNum,
        checklist: form.checklist || [],
        bills: form.bills || [],
        raBills: form.raBills || [],
        documents: form.documents || [],
        statusHistory: form.statusHistory || [],
      };

      // Sync tender fee as an expense
      const buildExpense = (tenderDocId) => ({
        description: `Tender fee — ${form.name || "Untitled"}`,
        category: "Tender Fees",
        amount: tenderFeeNum,
        date: form.submissionDate || new Date().toISOString().slice(0, 10),
        tenderId: form.nit || tenderDocId || "",
        note: `Auto-generated from tender fee`,
        source: "tender",
        tenderRef: tenderDocId || null,
      });

      if (editItem) {
        // Record status change if different
        if (editItem.status !== form.status) {
          data.statusHistory = [
            ...(editItem.statusHistory || []),
            {
              from: editItem.status,
              to: form.status,
              date: new Date().toISOString().slice(0, 10),
              ts: Date.now(),
            },
          ];
        }

        const batch = writeBatch(db);
        const tenderDoc = doc(db, "tenders", editItem.id);

        // Handle expense sync in the same commit as the tender.
        const existingExpId = editItem.tenderFeeExpenseId;
        if (tenderFeeNum > 0 && existingExpId) {
          batch.update(doc(db, "expenses", existingExpId), {
            ...buildExpense(editItem.id),
            updatedAt: serverTimestamp(),
          });
        } else if (tenderFeeNum > 0 && !existingExpId) {
          const expenseDoc = doc(collection(db, "expenses"));
          data.tenderFeeExpenseId = expenseDoc.id;
          batch.set(expenseDoc, {
            ...buildExpense(editItem.id),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (tenderFeeNum <= 0 && existingExpId) {
          batch.delete(doc(db, "expenses", existingExpId));
          data.tenderFeeExpenseId = null;
        }
        batch.update(tenderDoc, { ...data, updatedAt: serverTimestamp() });
        await batch.commit();
        logActivity({
          type: "tender",
          action: "updated",
          title: data.name,
          entityId: editItem.id,
          by: displayName,
        });
        toast.success("Tender updated");
      } else {
        const batch = writeBatch(db);
        const tenderDoc = doc(collection(db, "tenders"));
        const newId = tenderDoc.id;
        if (tenderFeeNum > 0) {
          const expenseDoc = doc(collection(db, "expenses"));
          data.tenderFeeExpenseId = expenseDoc.id;
          batch.set(expenseDoc, {
            ...buildExpense(newId),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        batch.set(tenderDoc, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        await batch.commit();
        logActivity({
          type: "tender",
          action: "created",
          title: data.name,
          entityId: newId,
          by: displayName,
        });
        toast.success("Tender created");
      }
      setDialogOpen(false);
    } catch (error) {
      console.error("Failed to save tender:", error);
      toast.error(
        error?.code === "permission-denied"
          ? "Your account does not have permission to save tenders. The Firestore rules or administrator role may need updating."
          : "Tender could not be saved. Please check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const t = tenders.find((x) => x.id === deleteId);
    const batch = writeBatch(db);
    if (t?.tenderFeeExpenseId) {
      batch.delete(doc(db, "expenses", t.tenderFeeExpenseId));
    }
    batch.delete(doc(db, "tenders", deleteId));
    await batch.commit();
    logActivity({
      type: "tender",
      action: "deleted",
      title: t?.name || "(unknown)",
      entityId: deleteId,
      by: displayName,
    });
    toast.success("Tender deleted");
    setDeleteId(null);
  };

  const setF = (k) => (e) =>
    setForm((p) => ({ ...p, [k]: e.target?.value ?? e }));

  const tenderFinancials = calculateTenderFinancials(form);
  const financialDirectionText =
    tenderFinancials.direction === "below"
      ? "Below"
      : tenderFinancials.direction === "above"
        ? "Above"
        : tenderFinancials.direction === "at"
          ? "At Estimate"
          : "";
  const financialTone =
    tenderFinancials.direction === "above"
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
      : tenderFinancials.direction === "at"
        ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";

  const getTenderFinancialSummary = (tender) => {
    const financials = calculateTenderFinancials(tender);
    if (financials.estimatedCost === null && financials.quotedAmount === null) {
      return null;
    }
    const directionText =
      financials.direction === "below"
        ? "Below"
        : financials.direction === "above"
          ? "Above"
          : financials.direction === "at"
            ? "At Estimate"
            : "";
    const percentText =
      financials.percentage === null
        ? "—"
        : `${financials.percentage.toFixed(2)}% ${directionText}`;
    return {
      estimate: formatCurrencyPrecise(financials.estimatedCost, 0),
      quoted: formatCurrencyPrecise(financials.quotedAmount, 0),
      percentText,
      direction: financials.direction,
    };
  };

  const formatMobileNitRef = (value) => {
    if (value === null || value === undefined || value === "") return "—";
    return String(value).replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim() || "—";
  };

  const getSubmissionDueLabel = (tender) => {
    if (tender.displayStatus === "Overdue") return "Overdue";
    const date = parseDateValue(tender.submissionDate);
    if (!date) return "—";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const days = Math.round((date - today) / 86400000);
    if (days === 0) return "Due Today";
    if (days === 1) return "Due Tomorrow";
    if (days > 1) return `Due in ${days} days`;
    return formatDate(tender.submissionDate) || "—";
  };

  if (loading) return <PageTableSkeleton rows={6} cols={6} metrics={5} />;
  if (error) return <LoadState title="Could not load tenders" error={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenders"
        description="Manage tender pipeline, submissions, pay orders, deadlines, and project status."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportTendersCSV(filtered)}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            {isAdmin && (
              <Button onClick={() => openDialog()}>
                <Plus className="h-4 w-4" /> Add Tender
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        {pipelineCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {financeCards.map((card) => (
          <KpiCard key={card.label} {...card} valueClassName="text-lg sm:text-xl" />
        ))}
      </div>

      {/* Tender table */}
      {filtered.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={FileStack}
          title="No tenders added yet"
          description="Add your first tender to start tracking submissions, pay orders, deadlines, and results."
          action={
            isAdmin && (
              <Button onClick={() => openDialog()}>
                <Plus className="h-4 w-4" /> Add first tender
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden rounded-xl border shadow-sm">
          <CardHeader className="space-y-4 border-b border-border bg-card/80 px-4 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Tender Pipeline
                </h2>
                <p className="text-sm text-muted-foreground">
                  {filtered.length} of {tendersResolved.length} tenders shown
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                <X className="h-4 w-4" /> Clear filters
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(5,minmax(150px,1fr))]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search tenders"
                  placeholder="Search tenders..."
                  className="h-10 min-w-0 pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-10 min-w-0" aria-label="Filter by status">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterAgency} onValueChange={setFilterAgency}>
                <SelectTrigger className="h-10 min-w-0" aria-label="Filter by agency">
                  <SelectValue placeholder="Agency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All agencies</SelectItem>
                  {agencies.map((agency) => (
                    <SelectItem key={agency} value={agency}>
                      {agency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="mobile-date-input"
                value={submissionFrom}
                onChange={(e) => setSubmissionFrom(e.target.value)}
                aria-label="Submission date from"
              />
              <Input
                type="date"
                className="mobile-date-input"
                value={submissionTo}
                onChange={(e) => setSubmissionTo(e.target.value)}
                aria-label="Submission date to"
              />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-10 min-w-0" aria-label="Sort tenders">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              {FILTER_STATUSES.map((s) => {
                const tone = STATUS_TONES[s];
                const active = filterStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                      active
                        ? tone?.active || "bg-primary text-primary-foreground border-primary"
                        : tone
                        ? `${tone.border} ${tone.text} ${tone.bg} hover:bg-accent`
                        : "border-transparent bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {s}
                    <span className="ml-1.5 rounded-full bg-background/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                      {stageCounts[s] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardHeader>
          {filtered.length === 0 ? (
            <EmptyState
              icon={FileStack}
              title="No matching tenders"
              description="Try changing search or filters."
            />
          ) : (
            <>
              {/* Mobile: card-per-row */}
              <div className="space-y-3 bg-muted/30 p-3 pb-4 md:hidden">
                {paginatedTenders.map((t) => {
                  const financialSummary = getTenderFinancialSummary(t);
                  const summaryTone =
                    financialSummary?.direction === "above"
                      ? "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
                      : financialSummary?.direction === "at"
                        ? "border-blue-200 bg-blue-50/70 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100"
                        : "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100";

                  return (
                  <Card key={t.id} className="overflow-hidden rounded-xl border-border shadow-sm">
                    <CardContent className="space-y-3.5 p-4">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setQuickView(t)}
                            className="block text-left w-full"
                          >
                            <p className="text-sm font-semibold leading-snug text-foreground hover:underline">
                              {t.name || "Untitled"}
                            </p>
                          </button>
                          <div className="mt-2 flex">
                            <StatusBadge status={t.displayStatus} />
                          </div>
                          {t.agency && (
                            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {t.agency}
                            </p>
                          )}
                          {financialSummary && (
                            <div
                              className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${summaryTone}`}
                            >
                              <div className="grid grid-cols-2 gap-2.5">
                                <div className="min-w-0 rounded-lg bg-white/60 px-2.5 py-2 dark:bg-background/30">
                                  <p className="text-[11px] font-medium tracking-normal opacity-75 sm:uppercase sm:tracking-wide">
                                    Estimate
                                  </p>
                                  <p className="mt-1 truncate font-mono text-[13px] font-semibold tabular-nums text-foreground">
                                    {financialSummary.estimate}
                                  </p>
                                </div>
                                <div className="min-w-0 rounded-lg bg-white/60 px-2.5 py-2 dark:bg-background/30">
                                  <p className="text-[11px] font-medium tracking-normal opacity-75 sm:uppercase sm:tracking-wide">
                                    Quoted
                                  </p>
                                  <p className="mt-1 truncate font-mono text-[13px] font-semibold tabular-nums text-foreground">
                                    {financialSummary.quoted}
                                  </p>
                                </div>
                              </div>
                              {financialSummary.percentText !== "—" && (
                                <span className="mt-2.5 inline-flex rounded-full border border-current/20 bg-white/75 px-2.5 py-1 text-[11px] font-semibold leading-none dark:bg-background/40">
                                  {financialSummary.percentText}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link
                                  to={`/tenders/${t.id}`}
                                  className="cursor-pointer"
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" /> View
                                  detail
                                </Link>
                              </DropdownMenuItem>
                              {isAdmin && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => openDialog(t)}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteId(t.id)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[11px] font-medium tracking-normal text-muted-foreground sm:uppercase sm:tracking-wide">
                          Contract value
                        </p>
                        <p className="mt-1 font-mono text-base font-semibold leading-none tabular-nums text-foreground">
                          {formatCurrencyPrecise(t.value, 0)}
                        </p>
                      </div>

                      <div className="space-y-3 border-t border-border pt-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-foreground">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate">
                              {formatDate(t.submissionDate) || "—"}
                            </span>
                            <span
                              className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                t.displayStatus === "Overdue"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {getSubmissionDueLabel(t)}
                            </span>
                          </div>
                          <p className="ml-[22px] mt-1 text-[11px] font-medium tracking-normal text-muted-foreground sm:uppercase sm:tracking-wide">
                            Submission
                          </p>
                        </div>
                        <div className="min-w-0 rounded-lg bg-muted/35 px-3 py-2">
                          <p className="text-[11px] font-medium tracking-normal text-muted-foreground sm:uppercase sm:tracking-wide">
                            NIT / Ref
                          </p>
                          <p
                            className="mt-1 line-clamp-2 break-words font-mono text-[13px] leading-5 text-foreground [overflow-wrap:anywhere]"
                            title={formatMobileNitRef(t.nit)}
                          >
                            {formatMobileNitRef(t.nit)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-sm">Tender Name</TableHead>
                    <TableHead className="text-sm">Agency</TableHead>
                    <TableHead className="text-sm">Status</TableHead>
                    <TableHead className="text-sm">Submission</TableHead>
                    <TableHead className="text-sm">Opening</TableHead>
                    <TableHead className="text-right text-sm">Estimated</TableHead>
                    <TableHead className="text-right text-sm">Quoted</TableHead>
                    <TableHead className="text-sm">Quoted %</TableHead>
                    <TableHead className="text-sm">NIT/Ref</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTenders.map((t) => {
                    const financialSummary = getTenderFinancialSummary(t);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="min-w-[200px] max-w-[320px]">
                          <button
                            type="button"
                            onClick={() => setQuickView(t)}
                            className="font-medium text-sm hover:underline text-foreground text-left whitespace-normal break-words"
                          >
                            {t.name || "Untitled"}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground min-w-[160px] max-w-[220px] whitespace-normal break-words">
                          {t.agency || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={t.displayStatus} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(t.submissionDate) || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(t.openingDate) || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums whitespace-nowrap">
                          {financialSummary?.estimate || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums whitespace-nowrap">
                          {financialSummary?.quoted || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {financialSummary?.percentText || "—"}
                        </TableCell>
                        <TableCell className="max-w-[220px] font-mono text-sm text-muted-foreground whitespace-normal break-words">
                          {t.nit || "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link
                                  to={`/tenders/${t.id}`}
                                  className="cursor-pointer"
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" /> View
                                  detail
                                </Link>
                              </DropdownMenuItem>
                              {isAdmin && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => openDialog(t)}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteId(t.id)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              <div className="flex flex-col gap-3 border-t border-border bg-card px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-sm text-muted-foreground sm:px-4 md:flex-row md:items-center md:justify-between">
                <span className="shrink-0">{paginationText}</span>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:justify-end">
                  {showPaginationControls && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-10"
                        disabled={currentPage <= 1 || filtered.length === 0}
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                      >
                        Previous
                      </Button>
                      {pageNumbers[0] > 1 && <span className="px-1">...</span>}
                      {pageNumbers.map((pageNumber) => (
                        <Button
                          key={pageNumber}
                          variant="outline"
                          size="sm"
                          className={`min-h-10 min-w-10 px-3 ${
                            pageNumber === currentPage
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : ""
                          }`}
                          onClick={() => setPage(pageNumber)}
                        >
                          {pageNumber}
                        </Button>
                      ))}
                      {pageNumbers[pageNumbers.length - 1] < pageCount && (
                        <span className="px-1">...</span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-10"
                        disabled={currentPage >= pageCount || filtered.length === 0}
                        onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                  <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
                    <SelectTrigger className="h-10 w-full min-w-0 sm:w-[148px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 rows</SelectItem>
                      <SelectItem value="20">20 rows</SelectItem>
                      <SelectItem value="50">50 rows</SelectItem>
                      <SelectItem value="all">All rows</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Tender Sheet */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg p-0 flex flex-col gap-0"
        >
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>{editItem ? "Edit Tender" : "New Tender"}</SheetTitle>
            <SheetDescription>
              {editItem
                ? "Update tender details and status."
                : "Add a new tender to the pipeline."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">
                Tender Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="t-name"
                value={form.name}
                onChange={setF("name")}
                placeholder="e.g. Supply of Office Equipment"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-nit">NIT / Reference</Label>
                <Input
                  id="t-nit"
                  value={form.nit}
                  onChange={setF("nit")}
                  placeholder="NIT-2024-001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-value">Value (PKR)</Label>
                <Input
                  id="t-value"
                  type="number"
                  value={form.value}
                  onChange={setF("value")}
                  placeholder="0"
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-agency">Procuring Agency</Label>
              <Input
                id="t-agency"
                value={form.agency}
                onChange={setF("agency")}
                placeholder="e.g. PPRA, NHA"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-fee">Tender Fee (PKR)</Label>
              <Input
                id="t-fee"
                type="number"
                value={form.tenderFee}
                onChange={setF("tenderFee")}
                placeholder="0"
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Automatically tracked as an expense under "Tender Fees".
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Financial Details
                </h3>
                <p className="text-xs text-muted-foreground">
                  Compare the official estimate with the submitted quote.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="t-estimated-cost">Estimated Cost</Label>
                  <Input
                    id="t-estimated-cost"
                    type="number"
                    value={form.estimatedCost ?? ""}
                    onChange={setF("estimatedCost")}
                    placeholder="2500000"
                    className="font-mono tabular-nums"
                  />
                  <p className="text-xs text-muted-foreground">
                    Official department / NIT estimate
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-quoted-amount">Quoted Amount</Label>
                  <Input
                    id="t-quoted-amount"
                    type="number"
                    value={form.quotedAmount ?? ""}
                    onChange={setF("quotedAmount")}
                    placeholder="2400000"
                    className="font-mono tabular-nums"
                  />
                  <p className="text-xs text-muted-foreground">
                    Submitted financial bid amount
                  </p>
                </div>
              </div>
              <div className={`mt-4 grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-3 ${financialTone}`}>
                <div>
                  <p className="font-medium opacity-75">Difference</p>
                  <p className="mt-1 font-semibold">
                    {tenderFinancials.difference === null
                      ? "—"
                      : `${formatCurrencyPrecise(tenderFinancials.difference, 2)} ${financialDirectionText}`}
                  </p>
                </div>
                <div>
                  <p className="font-medium opacity-75">Quoted %</p>
                  <p className="mt-1 font-semibold">
                    {tenderFinancials.percentage === null
                      ? "—"
                      : `${tenderFinancials.percentage.toFixed(2)}% ${financialDirectionText}`}
                  </p>
                </div>
                <div>
                  <p className="font-medium opacity-75">Status</p>
                  <p className="mt-1 font-semibold">{tenderFinancials.positionLabel}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-status">Status</Label>
                <Select value={form.status} onValueChange={setF("status")}>
                  <SelectTrigger id="t-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENDER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-po">Linked Pay Order</Label>
                <Input
                  id="t-po"
                  value={form.linkedPO}
                  onChange={setF("linkedPO")}
                  placeholder="PO-2024-001"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-sub">Submission Date</Label>
                <Input
                  id="t-sub"
                  type="date"
                  value={form.submissionDate}
                  onChange={setF("submissionDate")}
                  className="mobile-date-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-open">Opening Date</Label>
                <Input
                  id="t-open"
                  type="date"
                  value={form.openingDate}
                  onChange={setF("openingDate")}
                  className="mobile-date-input"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-notes">Notes</Label>
              <Textarea
                id="t-notes"
                value={form.notes}
                onChange={setF("notes")}
                rows={4}
                placeholder="Optional notes…"
              />
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? "Save Changes" : "Create Tender"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <TenderQuickView
        tender={quickView}
        open={!!quickView}
        onOpenChange={(v) => !v && setQuickView(null)}
        canEdit={isAdmin}
        onEdit={() => {
          const t = quickView;
          setQuickView(null);
          openDialog(t);
        }}
      />

      <ConfirmDelete
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete tender"
        description="This will permanently delete the tender and all related data."
      />
    </div>
  );
}
