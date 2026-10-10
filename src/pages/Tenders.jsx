import { useEffect, useState, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCollection } from "@/hooks/useFirestore";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { queueTenderIntegrationSync } from "@/lib/tenderIntegrations";
import { tenderContractValue } from "@/lib/financials";
import { tenderListAmount, validTenderSubmissionDate } from "@/lib/tenderListPresentation";
import { tenderFeeExpenseNeedsSync, tenderSaveErrorMessage } from "@/lib/tenderSave";
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
import DeadlineBadge from "@/components/shared/DeadlineBadge";
import KpiCard from "@/components/shared/KpiCard";
import TenderEditor from "@/components/tenders/TenderEditor";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
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
  Columns3,
  ChevronDown,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { getTenderDeadline, matchesDeadlineFilter } from "@/lib/tenderDeadlines";

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
const DEADLINE_FILTERS = [
  ["all", "All Upcoming"],
  ["today", "Due Today"],
  ["three-days", "Next 3 Days"],
  ["seven-days", "Next 7 Days"],
  ["overdue", "Overdue"],
];
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

function TenderRowMenu({ tender, isAdmin, openDialog, setDeleteId, setQuickView }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${tender.name || 'tender'}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => setQuickView(tender)}>Quick view</DropdownMenuItem>
      <DropdownMenuItem asChild><Link to={`/tenders/${tender.id}`}><ExternalLink className="mr-2 h-4 w-4" /> View detail</Link></DropdownMenuItem>
      {isAdmin && <><DropdownMenuItem onClick={() => openDialog(tender)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(tender.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export default function Tenders() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [deadlineFilter, setDeadlineFilter] = useState(searchParams.get("deadline") || "none");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [dialogOpen, setDialogOpen] = useState(searchParams.get('create') === '1' && isAdmin);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_TENDER);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const initialDraft = useRef(JSON.stringify(EMPTY_TENDER));
  const [formErrors, setFormErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [optionalColumns, setOptionalColumns] = useState({ openingDate: false, estimatedCost: false, quotedAmount: false, quotedPercent: false });
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
        const deadline = getTenderDeadline(t);
        if (deadlineFilter !== "none" && !matchesDeadlineFilter(deadline, deadlineFilter)) return false;
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
    deadlineFilter,
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
  const hasDeadlineFilter = deadlineFilter !== "none";

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, filterAgency, submissionFrom, submissionTo, sortBy, rowsPerPage, deadlineFilter]);

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
          (tenderContractValue(item.tender) ?? 0),
        0,
      );
    const missingAwardContracts = summaries.filter((item) =>
      ["Awarded", "Won", "In Progress", "Completed"].some((status) =>
        isSameStatus(item.tender.displayStatus, status),
      ) && tenderContractValue(item.tender) === null,
    ).length;
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
        helper: missingAwardContracts ? `${missingAwardContracts} awarded contract amount${missingAwardContracts === 1 ? '' : 's'} not recorded` : "Recorded awards and revisions",
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
    ];
  }, [tendersResolved]);

  const clearFilters = () => {
    setSearch("");
    setFilterStatus("All");
    setFilterAgency("All");
    setSubmissionFrom("");
    setSubmissionTo("");
    setSortBy("submissionDate");
    setDeadlineFilter("none");
    setSearchParams({}, { replace: true });
  };

  const openDialog = (item = null) => {
    const nextForm = item ? { ...EMPTY_TENDER, ...item } : { ...EMPTY_TENDER };
    setEditItem(item);
    setForm(nextForm);
    initialDraft.current = JSON.stringify(nextForm);
    setFormErrors({});
    setSaveError("");
    setExtraOpen(Boolean(nextForm.notes || nextForm.contact));
    setDialogOpen(true);
  };

  const requestClose = () => {
    if (savingRef.current) return;
    if (JSON.stringify(form) !== initialDraft.current) setDiscardOpen(true);
    else setDialogOpen(false);
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    setSaveError("");
    const errors = {};
    if (!form.name?.trim()) errors.name = "Tender name is required";
    for (const [key, label, optional] of [
      ["value", "Tender value", false],
      ["estimatedCost", "Estimated cost", true],
      ["quotedAmount", "Quoted amount", true],
      ["tenderFee", "Tender fee", true],
    ]) {
      const raw = form[key];
      if (!(optional && (raw === "" || raw == null)) && (raw === "" || raw == null || !Number.isFinite(Number(raw)) || Number(raw) < 0)) errors[key] = `${label} must be a non-negative number.`;
    }
    if (editItem && form.status === "Completed" && editItem.status !== "Completed") {
      errors.status = "Complete this tender from its detail page so the completion snapshot is recorded.";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

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

    savingRef.current = true;
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
        const syncFeeExpense = tenderFeeExpenseNeedsSync(editItem, form);
        const existingExpRef = existingExpId ? doc(db, "expenses", existingExpId) : null;
        const linkedExpenseExists = syncFeeExpense && existingExpRef ? (await getDoc(existingExpRef)).exists() : false;
        if (syncFeeExpense && tenderFeeNum > 0 && linkedExpenseExists) {
          batch.update(doc(db, "expenses", existingExpId), {
            ...buildExpense(editItem.id),
            updatedAt: serverTimestamp(),
          });
        } else if (syncFeeExpense && tenderFeeNum > 0 && !linkedExpenseExists) {
          const expenseDoc = doc(collection(db, "expenses"));
          data.tenderFeeExpenseId = expenseDoc.id;
          batch.set(expenseDoc, {
            ...buildExpense(editItem.id),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (syncFeeExpense && tenderFeeNum <= 0 && linkedExpenseExists) {
          batch.delete(existingExpRef);
          data.tenderFeeExpenseId = null;
        } else if (syncFeeExpense && tenderFeeNum <= 0 && existingExpId) {
          data.tenderFeeExpenseId = null;
        }
        batch.update(tenderDoc, { ...data, updatedAt: serverTimestamp() });
        await batch.commit();
        queueTenderIntegrationSync(editItem.id);
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
        queueTenderIntegrationSync(newId);
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
      const message = tenderSaveErrorMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      savingRef.current = false;
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
    queueTenderIntegrationSync(deleteId);
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

  const setF = (k) => (e) => {
    setForm((p) => ({ ...p, [k]: e.target?.value ?? e }));
    setFormErrors((current) => ({ ...current, [k]: undefined }));
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
            {isAdmin && (
              <Button onClick={() => openDialog()}>
                <Plus className="h-4 w-4" /> Add Tender
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {pipelineCards.slice(0, 4).map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      <details className="rounded-xl border border-border/80 bg-card p-4"><summary className="cursor-pointer text-sm font-medium">Pipeline counts and financial basis</summary><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap gap-2">
          {pipelineCards.slice(4).map((card) => (
            <span key={card.label} className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground">
              <span>{card.label}</span>
              <strong className="font-mono text-foreground">{card.value}</strong>
            </span>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-3 sm:flex sm:flex-wrap sm:justify-end">
          {financeCards.map((card) => (
            <div key={card.label} className="min-w-0 sm:min-w-[128px]">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-0.5 overflow-x-auto whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-foreground">{card.value}</p>
              {card.helper && <p className="mt-0.5 max-w-[240px] break-words text-xs text-muted-foreground">{card.helper}</p>}
            </div>
          ))}
        </div>
      </div></details>

      {/* Tender table */}
      {filtered.length === 0 && !hasActiveFilters && !hasDeadlineFilter ? (
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
        <Card className="overflow-hidden rounded-xl border">
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
                disabled={!hasActiveFilters && !hasDeadlineFilter}
              >
                <X className="h-4 w-4" /> Clear filters
              </Button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" aria-label="Tender deadline filters">
              {DEADLINE_FILTERS.map(([value, label]) => {
                const active = deadlineFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      const next = active ? "none" : value;
                      setDeadlineFilter(next);
                      setSearchParams(next === "none" ? {} : { deadline: next }, { replace: true });
                    }}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>


            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search tenders" placeholder="Search tender, agency or NIT..." className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Columns3 className="h-4 w-4" /> Columns</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48">
                {[['openingDate','Opening date'],['estimatedCost','Estimate'],['quotedAmount','Quoted bid'],['quotedPercent','Quoted %']].map(([key,label]) => <DropdownMenuCheckboxItem key={key} checked={optionalColumns[key]} onCheckedChange={(checked) => setOptionalColumns((current) => ({ ...current, [key]: Boolean(checked) }))}>{label}</DropdownMenuCheckboxItem>)}
              </DropdownMenuContent></DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => exportTendersCSV(filtered)}><Download className="h-4 w-4" /> Export CSV</Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {['All','Bidding','Submitted'].map((status) => <button key={status} type="button" aria-pressed={filterStatus === status} onClick={() => setFilterStatus(status)} className={'rounded-full border px-3 py-1.5 text-xs font-medium ' + (filterStatus === status ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent')}>{status} <span className="ml-1 font-mono tabular-nums">{stageCounts[status] || 0}</span></button>)}
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm">More statuses <ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start">{FILTER_STATUSES.filter((status) => !['All','Bidding','Submitted'].includes(status)).map((status) => <DropdownMenuItem key={status} onClick={() => setFilterStatus(status)}>{status} ({stageCounts[status] || 0})</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
              {filterStatus !== 'All' && !['Bidding','Submitted'].includes(filterStatus) && <span className="text-xs text-muted-foreground">Selected: {filterStatus}</span>}
            </div>
            <details className="rounded-lg border bg-background px-3 py-2"><summary className="cursor-pointer text-sm font-medium">More filters <ChevronDown className="ml-1 inline h-4 w-4" /></summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select value={filterAgency} onValueChange={setFilterAgency}><SelectTrigger aria-label="Filter by agency"><SelectValue placeholder="Agency" /></SelectTrigger><SelectContent><SelectItem value="All">All agencies</SelectItem>{agencies.map((agency) => <SelectItem key={agency} value={agency}>{agency}</SelectItem>)}</SelectContent></Select>
                <Input type="date" className="mobile-date-input" value={submissionFrom} onChange={(e) => setSubmissionFrom(e.target.value)} aria-label="Submission date from" />
                <Input type="date" className="mobile-date-input" value={submissionTo} onChange={(e) => setSubmissionTo(e.target.value)} aria-label="Submission date to" />
                <Select value={sortBy} onValueChange={setSortBy}><SelectTrigger aria-label="Sort tenders"><SelectValue placeholder="Sort by" /></SelectTrigger><SelectContent>{SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
              </div>
            </details>
          </CardHeader>
          {filtered.length === 0 ? (
            <EmptyState
              icon={FileStack}
              title="No matching tenders"
              description="Try changing search or filters."
            />
          ) : (
            <>

              {/* Mobile: labelled cards */}
              <div className="space-y-3 bg-muted/30 p-3 md:hidden">
                {paginatedTenders.map((t) => {
                  const relevant = tenderListAmount(t);
                  const recordedDate = validTenderSubmissionDate(t.submissionDate);
                  const deadline = recordedDate ? getTenderDeadline(t) : null;
                  return <Card key={t.id} className="min-w-0"><CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1"><Link to={'/tenders/' + t.id} title={t.name || 'Untitled'} className="block break-words text-sm font-semibold leading-snug hover:underline">{t.name || 'Untitled'}</Link><p className="mt-1 break-all text-xs text-muted-foreground">NIT: {t.nit || 'Not recorded'}</p></div>
                      <StatusBadge status={t.displayStatus} />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Agency</dt><dd className="break-words">{t.agency || 'Not recorded'}</dd></div>
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Relevant amount</dt><dd className="font-mono tabular-nums [overflow-wrap:anywhere]">{relevant.amount === null ? 'Not recorded' : formatCurrencyPrecise(relevant.amount, 0)}</dd><dd className="text-xs text-muted-foreground">{relevant.label}</dd></div>
                      <div className="col-span-2"><dt className="text-xs text-muted-foreground">Submission date</dt><dd>{recordedDate ? formatDate(t.submissionDate) : 'Not recorded'} {deadline && <DeadlineBadge tender={t} />}</dd></div>
                    </dl>
                    <div className="flex items-center justify-between border-t pt-2"><Button asChild variant="outline" size="sm"><Link to={'/tenders/' + t.id}>View tender</Link></Button><TenderRowMenu tender={t} isAdmin={isAdmin} openDialog={openDialog} setDeleteId={setDeleteId} setQuickView={setQuickView} /></div>
                  </CardContent></Card>;
                })}
              </div>

              {/* Desktop: compact primary columns, optional secondary columns. */}
              <div className="hidden overflow-x-auto md:block">
                <Table className="min-w-[840px]"><TableHeader><TableRow>
                  <TableHead className="w-[27%]">Tender / NIT</TableHead><TableHead>Agency</TableHead><TableHead className="text-right">Relevant Amount</TableHead><TableHead>Submission date</TableHead><TableHead>Status</TableHead>
                  {optionalColumns.openingDate && <TableHead>Opening</TableHead>}
                  {optionalColumns.estimatedCost && <TableHead className="text-right">Estimate</TableHead>}
                  {optionalColumns.quotedAmount && <TableHead className="text-right">Quoted Bid</TableHead>}
                  {optionalColumns.quotedPercent && <TableHead className="text-right">Quoted %</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader><TableBody>
                  {paginatedTenders.map((t) => {
                    const relevant = tenderListAmount(t);
                    const recordedDate = validTenderSubmissionDate(t.submissionDate);
                    const deadline = recordedDate ? getTenderDeadline(t) : null;
                    const financials = calculateTenderFinancials(t);
                    return <TableRow key={t.id}>
                      <TableCell className="min-w-[210px] max-w-[330px]"><Link to={'/tenders/' + t.id} title={t.name || 'Untitled'} className="line-clamp-3 break-words text-sm font-medium hover:underline">{t.name || 'Untitled'}</Link><span className="mt-1 block break-all text-xs text-muted-foreground">{t.nit || 'NIT not recorded'}</span></TableCell>
                      <TableCell className="max-w-[190px] break-words text-sm">{t.agency || 'Not recorded'}</TableCell>
                      <TableCell className="table-amount whitespace-nowrap"><span className="block">{relevant.amount === null ? 'Not recorded' : formatCurrencyPrecise(relevant.amount, 0)}</span><span className="text-xs font-normal text-muted-foreground">{relevant.label}</span></TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{recordedDate ? formatDate(t.submissionDate) : 'Not recorded'}{deadline && <span className="ml-2"><DeadlineBadge tender={t} /></span>}</TableCell>
                      <TableCell className="whitespace-nowrap"><StatusBadge status={t.displayStatus} /></TableCell>
                      {optionalColumns.openingDate && <TableCell className="whitespace-nowrap text-sm">{t.openingDate ? formatDate(t.openingDate) : 'Not recorded'}</TableCell>}
                      {optionalColumns.estimatedCost && <TableCell className="table-amount whitespace-nowrap">{financials.estimatedCost === null ? 'Not recorded' : formatCurrencyPrecise(financials.estimatedCost, 0)}</TableCell>}
                      {optionalColumns.quotedAmount && <TableCell className="table-amount whitespace-nowrap">{financials.quotedAmount === null ? 'Not recorded' : formatCurrencyPrecise(financials.quotedAmount, 0)}</TableCell>}
                      {optionalColumns.quotedPercent && <TableCell className="table-amount whitespace-nowrap">{financials.percentage === null ? '—' : financials.percentage.toFixed(2) + '%'}</TableCell>}
                      <TableCell><div className="flex items-center justify-end gap-1"><Button asChild variant="outline" size="sm"><Link to={'/tenders/' + t.id}>View</Link></Button><TenderRowMenu tender={t} isAdmin={isAdmin} openDialog={openDialog} setDeleteId={setDeleteId} setQuickView={setQuickView} /></div></TableCell>
                    </TableRow>;
                  })}
                </TableBody></Table>
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
      <Sheet open={dialogOpen} onOpenChange={(open) => { if (!open) requestClose(); else setDialogOpen(true); }}>
        <SheetContent side="right" className="flex h-dvh w-full min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]">
          <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-14 text-left sm:px-6 sm:pr-14">
            <SheetTitle>{editItem ? "Edit Tender" : "New Tender"}</SheetTitle>
            <SheetDescription>{editItem ? "Update the recorded tender details and stage." : "Add a tender to the pipeline."}</SheetDescription>
          </SheetHeader>
          {saveError && <p role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6">{saveError}</p>}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
            <TenderEditor form={form} setF={setF} errors={formErrors} extraOpen={extraOpen} setExtraOpen={setExtraOpen} editItem={editItem} />
          </div>
          <SheetFooter className="shrink-0 gap-2 border-t border-border bg-background px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:justify-end sm:px-6">
            <Button variant="outline" type="button" onClick={requestClose} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? "Save Changes" : "Create Tender"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Discard unsaved changes?</DialogTitle><DialogDescription>Your tender edits have not been saved.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>Keep editing</Button>
            <Button variant="destructive" onClick={() => { setDiscardOpen(false); setDialogOpen(false); }}>Discard changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
