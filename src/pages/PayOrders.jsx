import { useEffect, useState, useMemo, useId } from "react";
import { useCollection, useFirestoreCRUD } from "@/hooks/useFirestore";
import { useAuth } from "@/context/AuthContext";
import { exportPayOrdersCSV, exportPayOrdersPDF } from "@/lib/export";
import {
  formatCurrency,
  formatDate,
  PO_STATUSES,
  PO_PURPOSES,
  BID_RESULTS,
} from "@/lib/utils";
import {
  doc as fsDoc,
  collection as fsCollection,
  serverTimestamp as fsServerTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logActivity } from "@/lib/activity";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDelete from "@/components/shared/ConfirmDelete";
import PayOrderQuickView from "@/components/shared/PayOrderQuickView";
import KpiCard from "@/components/shared/KpiCard";
import PageHeader from "@/components/shared/PageHeader";
import { PageTableSkeleton } from "@/components/shared/LoadingSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LabelList,
} from "recharts";
import ChartTooltip, { CHART_SEMANTIC } from "@/components/shared/ChartTooltip";
import {
  Plus,
  FileText,
  Download,
  Printer,
  Search,
  Filter,
  Pencil,
  Trash2,
  Loader2,
  Banknote,
  Building2,
  BarChart3,
  AlertCircle,
  CheckCircle,
  MoreHorizontal,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

const EMPTY_PO = {
  po: "",
  bank: "",
  nit: "",
  amount: "",
  tender: "",
  agency: "",
  submitted: "",
  status: "Pending",
  bidResult: "N/A",
  notes: "",
  purpose: "Bid Security",
  tenderRef: "",
};

const PAY_ORDER_FIELDS = [
  "po",
  "bank",
  "nit",
  "amount",
  "tender",
  "agency",
  "submitted",
  "status",
  "bidResult",
  "notes",
  "purpose",
  "tenderRef",
  "createdAt",
  "createdBy",
  "updatedBy",
];

const EMPTY_FILTERS = {
  bank: "all",
  status: "all",
  bidResult: "all",
  submittedFrom: "",
  submittedTo: "",
  amountMin: "",
  amountMax: "",
};

function cleanPayOrderPayload(data) {
  return PAY_ORDER_FIELDS.reduce((payload, key) => {
    if (data[key] !== undefined) payload[key] = data[key];
    return payload;
  }, {});
}

const STATUS_CHART_COLORS = {
  Pending: CHART_SEMANTIC.positive,
  Held: CHART_SEMANTIC.warning,
  Encashed: "#61c554",
  Submitted: CHART_SEMANTIC.neutral,
  Returned: CHART_SEMANTIC.negative,
  Released: CHART_SEMANTIC.positive,
  Forfeited: CHART_SEMANTIC.negative,
};

function PayOrderKpiCard({ icon: Icon, label, value, helper, tone = "green" }) {
  const kpiTone = tone === "amber" ? "amber" : tone === "blue" ? "blue" : "emerald";
  return (
    <KpiCard
      icon={Icon}
      label={label}
      value={value}
      helper={helper}
      tone={kpiTone}
    />
  );
}

export default function PayOrders() {
  const { data: payOrders, loading } = useCollection(
    "payOrders",
    "createdAt",
    "desc",
  );
  const { data: activityLog } = useCollection(
    "activityLog",
    "createdAt",
    "desc",
  );
  const { data: tenders } = useCollection("tenders", "createdAt", "desc");
  const { data: banks } = useCollection("banks", "createdAt", "asc");
  const { remove } = useFirestoreCRUD("payOrders");
  const {
    add: addLog,
    remove: removeLog,
  } = useFirestoreCRUD("activityLog", { addUpdatedAt: false });
  const { add: addBank } = useFirestoreCRUD("banks");
  const { isAdmin, displayName } = useAuth();

  const [tenderMode, setTenderMode] = useState("existing"); // 'existing' | 'new' | 'none'
  const [newTenderFields, setNewTenderFields] = useState({
    name: "",
    nit: "",
    agency: "",
  });
  const [tenderSearch, setTenderSearch] = useState("");
  const [addBankOpen, setAddBankOpen] = useState(false);
  const [newBankName, setNewBankName] = useState("");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_PO);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [quickView, setQuickView] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState("10");

  // Activity log state
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logForm, setLogForm] = useState({
    date: "",
    po: "",
    ref: "",
    action: "",
    next: "",
    by: "",
  });
  const [savingLog, setSavingLog] = useState(false);
  const [deleteLogId, setDeleteLogId] = useState(null);

  const filtered = useMemo(() => {
    return payOrders.filter((p) => {
      if (filterStatus !== "All" && p.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          ![p.po, p.tender, p.agency, p.nit, p.bank].some((v) =>
            (v || "").toLowerCase().includes(q),
          )
        ) {
          return false;
        }
      }
      if (appliedFilters.bank !== "all" && (p.bank || "") !== appliedFilters.bank) return false;
      if (appliedFilters.status !== "all" && (p.status || "") !== appliedFilters.status) return false;
      if (appliedFilters.bidResult !== "all" && (p.bidResult || "N/A") !== appliedFilters.bidResult) return false;
      if (appliedFilters.submittedFrom && (!p.submitted || p.submitted < appliedFilters.submittedFrom)) return false;
      if (appliedFilters.submittedTo && (!p.submitted || p.submitted > appliedFilters.submittedTo)) return false;
      const amount = Number(p.amount) || 0;
      if (appliedFilters.amountMin !== "" && amount < Number(appliedFilters.amountMin)) return false;
      if (appliedFilters.amountMax !== "" && amount > Number(appliedFilters.amountMax)) return false;
      return true;
    });
  }, [payOrders, search, filterStatus, appliedFilters]);

  const bankOptions = useMemo(() => {
    const names = [
      ...banks.map((b) => b.name),
      ...payOrders.map((p) => p.bank),
    ].filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [banks, payOrders]);

  const hasPanelFilters = useMemo(
    () => Object.values(appliedFilters).some((value) => value !== "" && value !== "all"),
    [appliedFilters],
  );

  const numericRowsPerPage = rowsPerPage === "all" ? filtered.length || 1 : Number(rowsPerPage);
  const pageCount = rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / numericRowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageStart = rowsPerPage === "all" ? 0 : (currentPage - 1) * numericRowsPerPage;
  const pageEnd = rowsPerPage === "all" ? filtered.length : pageStart + numericRowsPerPage;
  const paginatedPayOrders = filtered.slice(pageStart, pageEnd);
  const displayStart = filtered.length === 0 ? 0 : pageStart + 1;
  const displayEnd = Math.min(pageEnd, filtered.length);
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((pageNumber) => pageCount <= 5 || Math.abs(pageNumber - currentPage) <= 2);
  const paginationText = filtered.length === 0
    ? "Showing 0 entries"
    : rowsPerPage === "all" || filtered.length <= numericRowsPerPage
    ? `Showing all ${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`
    : `Showing ${displayStart} to ${displayEnd} of ${filtered.length} entries`;

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, appliedFilters, rowsPerPage]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // Summary stats
  const total = payOrders.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const atRisk = payOrders.filter((p) => p.status === "Submitted").length;
  const returned = payOrders.filter((p) => p.status === "Returned").length;
  const encashed = payOrders.filter((p) => p.status === "Encashed").length;

  // Chart data
  const statusChart = PO_STATUSES.map((s) => ({
    status: s,
    count: payOrders.filter((p) => p.status === s).length,
  })).filter((d) => d.count > 0);

  const winData = [
    {
      name: "Won",
      value: payOrders.filter((p) => p.bidResult === "Won").length,
      color: CHART_SEMANTIC.positive,
    },
    {
      name: "Active",
      value: payOrders.filter((p) => ["N/A", "Awaiting"].includes(p.bidResult))
        .length,
      color: CHART_SEMANTIC.neutral,
    },
    {
      name: "Lost",
      value: payOrders.filter((p) => p.bidResult === "Lost").length,
      color: CHART_SEMANTIC.negative,
    },
  ].filter((d) => d.value > 0);

  const openDialog = (item = null) => {
    setEditItem(item);
    setForm(
      item
        ? { ...EMPTY_PO, ...item }
        : { ...EMPTY_PO, submitted: new Date().toISOString().slice(0, 10) },
    );
    setTenderMode(item?.tenderRef ? "existing" : "none");
    setNewTenderFields({
      name: item?.tender || "",
      nit: item?.nit || "",
      agency: item?.agency || "",
    });
    setTenderSearch("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.po) {
      toast.error("PO number is required");
      return;
    }
    if (form.amount === "" || !Number.isFinite(Number(form.amount)) || Number(form.amount) < 0) {
      toast.error("Amount must be a non-negative number");
      return;
    }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      let tenderRef = form.tenderRef || "";
      let tenderName = form.tender || "";
      let nit = form.nit || "";
      let agency = form.agency || "";
      const amountNum = Number(form.amount) || 0;

      if (tenderMode === "none") {
        tenderRef = "";
        tenderName = "";
        nit = "";
        agency = "";
      } else if (tenderMode === "new" && newTenderFields.name.trim()) {
        const stub = {
          name: newTenderFields.name.trim(),
          nit: newTenderFields.nit.trim(),
          agency: newTenderFields.agency.trim(),
          status: "Bidding",
          value: 0,
          tenderFee: form.purpose === "Tender Fee" ? amountNum : 0,
          bidSecurity: form.purpose === "Bid Security" ? amountNum : 0,
          submissionDate: form.submitted || "",
          createdAt: fsServerTimestamp(),
          updatedAt: fsServerTimestamp(),
        };
        const ref = fsDoc(fsCollection(db, "tenders"));
        batch.set(ref, stub);
        tenderRef = ref.id;
        tenderName = stub.name;
        nit = nit || stub.nit;
        agency = agency || stub.agency;
      } else if (tenderMode === "existing" && tenderRef) {
        const t = tenders.find((x) => x.id === tenderRef);
        if (t) {
          tenderName = t.name || tenderName;
          nit = nit || t.nit || "";
          agency = agency || t.agency || "";
          // Write bidSecurity on tender if this PO is Bid Security
          if (form.purpose === "Bid Security" && amountNum > 0) {
            batch.update(fsDoc(db, "tenders", tenderRef), {
              bidSecurity: amountNum,
              updatedAt: fsServerTimestamp(),
            });
          }
        }
      }

      const data = cleanPayOrderPayload({
        ...form,
        amount: amountNum,
        tenderRef,
        tender: tenderName,
        nit,
        agency,
      });
      if (editItem) {
        batch.update(fsDoc(db, "payOrders", editItem.id), {
          ...data,
          updatedAt: fsServerTimestamp(),
        });
        await batch.commit();
        logActivity({
          type: "payOrder",
          action: "updated",
          title: data.po || "(no PO#)",
          entityId: editItem.id,
          by: displayName,
          meta: { tender: tenderName },
        });
        toast.success("Pay order updated");
      } else {
        const payOrderDoc = fsDoc(fsCollection(db, "payOrders"));
        const newId = payOrderDoc.id;
        batch.set(payOrderDoc, {
          ...data,
          createdAt: fsServerTimestamp(),
          updatedAt: fsServerTimestamp(),
        });
        await batch.commit();
        logActivity({
          type: "payOrder",
          action: "created",
          title: data.po || "(no PO#)",
          entityId: newId,
          by: displayName,
          meta: { tender: tenderName },
        });
        toast.success("Pay order added");
      }
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const p = payOrders.find((x) => x.id === deleteId);
    await remove(deleteId);
    logActivity({
      type: "payOrder",
      action: "deleted",
      title: p?.po || "(unknown)",
      entityId: deleteId,
      by: displayName,
    });
    toast.success("Pay order deleted");
    setDeleteId(null);
  };

  const openLogDialog = () => {
    setLogForm({
      date: new Date().toISOString().slice(0, 10),
      po: "",
      ref: "",
      action: "",
      next: "",
      by: displayName || "",
    });
    setLogDialogOpen(true);
  };

  const handleSaveLog = async () => {
    if (!logForm.action) {
      toast.error("Action is required");
      return;
    }
    setSavingLog(true);
    try {
      await addLog({
        type: "payOrder",
        action: logForm.action.trim(),
        title: logForm.po.trim() || logForm.ref.trim() || logForm.action.trim(),
        entityId: null,
        by: logForm.by.trim() || displayName,
        meta: {
          date: logForm.date,
          po: logForm.po.trim(),
          ref: logForm.ref.trim(),
          next: logForm.next.trim(),
        },
      });
      toast.success("Log entry added");
      setLogDialogOpen(false);
    } finally {
      setSavingLog(false);
    }
  };

  const handleAddBank = async () => {
    const name = newBankName.trim();
    if (!name) {
      toast.error("Bank name is required");
      return;
    }
    if (
      banks.some((b) => (b.name || "").toLowerCase() === name.toLowerCase())
    ) {
      toast.error("Bank already exists");
      return;
    }
    try {
      await addBank({ name });
      setForm((p) => ({ ...p, bank: name }));
      setAddBankOpen(false);
      setNewBankName("");
      toast.success("Bank added");
    } catch (e) {
      console.error("Add bank failed:", e);
      toast.error("Failed to add bank: " + (e?.message || "unknown error"));
    }
  };

  const setF = (k) => (e) =>
    setForm((p) => ({ ...p, [k]: e.target?.value ?? e }));
  const setLF = (k) => (e) =>
    setLogForm((p) => ({ ...p, [k]: e.target?.value ?? e }));

  const getActivityMeta = (entry) =>
    entry?.meta && typeof entry.meta === "object" ? entry.meta : {};

  const getActivityDate = (entry) => {
    const value = getActivityMeta(entry).date || entry.date || entry.createdAt;
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (value.seconds) return new Date(value.seconds * 1000).toISOString();
    return value;
  };

  const getActivityPO = (entry) =>
    getActivityMeta(entry).po || entry.po || (entry.type === "payOrder" ? entry.title : "");

  const getActivityRef = (entry) =>
    getActivityMeta(entry).ref || entry.ref || entry.entityId || "";

  const getActivityNext = (entry) =>
    getActivityMeta(entry).next || entry.next || getActivityMeta(entry).tender || "";

  const closeFilterPanels = () => {
    setFilterOpen(false);
    setMobileFilterOpen(false);
  };

  const clearFilterPanel = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    closeFilterPanels();
  };

  const applyFilterPanel = () => {
    setAppliedFilters(draftFilters);
    closeFilterPanels();
  };

  const filterPanelContent = (
    <>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Bank</Label>
          <Select
            value={draftFilters.bank}
            onValueChange={(value) => setDraftFilters((filters) => ({ ...filters, bank: value }))}
          >
            <SelectTrigger className="h-10 md:h-9">
              <SelectValue placeholder="All banks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All banks</SelectItem>
              {bankOptions.map((bank) => (
                <SelectItem key={bank} value={bank}>{bank}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select
              value={draftFilters.status}
              onValueChange={(value) => setDraftFilters((filters) => ({ ...filters, status: value }))}
            >
              <SelectTrigger className="h-10 md:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PO_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bid Result</Label>
            <Select
              value={draftFilters.bidResult}
              onValueChange={(value) => setDraftFilters((filters) => ({ ...filters, bidResult: value }))}
            >
              <SelectTrigger className="h-10 md:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                {BID_RESULTS.map((result) => (
                  <SelectItem key={result} value={result}>{result}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Submitted from"
            type="date"
            value={draftFilters.submittedFrom}
            onChange={(event) => setDraftFilters((filters) => ({ ...filters, submittedFrom: event.target.value }))}
          />
          <Field
            label="Submitted to"
            type="date"
            value={draftFilters.submittedTo}
            onChange={(event) => setDraftFilters((filters) => ({ ...filters, submittedTo: event.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Min amount"
            type="number"
            value={draftFilters.amountMin}
            onChange={(event) => setDraftFilters((filters) => ({ ...filters, amountMin: event.target.value }))}
            placeholder="0"
          />
          <Field
            label="Max amount"
            type="number"
            value={draftFilters.amountMax}
            onChange={(event) => setDraftFilters((filters) => ({ ...filters, amountMax: event.target.value }))}
            placeholder="0"
          />
        </div>
      </div>
    </>
  );

  if (loading) return <PageTableSkeleton rows={8} cols={6} metrics={4} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pay Orders"
        description="Manage pay order entries and activity logs"
        actions={isAdmin && (
          <Button
            onClick={() => openDialog()}
            className="h-10 w-full shrink-0 gap-2 rounded-lg bg-emerald-600 px-4 text-white shadow-sm hover:bg-emerald-700 sm:h-11 sm:w-auto sm:px-5"
          >
            <Plus className="h-4 w-4" />
            Add Pay Order
          </Button>
        )}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PayOrderKpiCard
          icon={Banknote}
          label="Total Amount"
          value={formatCurrency(total)}
          tone="green"
        />
        <PayOrderKpiCard
          icon={FileText}
          label="Total Entries"
          value={payOrders.length}
          helper={`${returned} returned`}
          tone="blue"
        />
        <PayOrderKpiCard
          icon={AlertCircle}
          label="At Risk"
          value={atRisk}
          helper={atRisk > 0 ? "Submitted, awaiting result" : "All clear"}
          tone="amber"
        />
        <PayOrderKpiCard
          icon={CheckCircle}
          label="Encashed"
          value={encashed}
          helper={`${Math.round((encashed / (payOrders.length || 1)) * 100)}% of total`}
          tone="green"
        />
      </div>

      {/* Charts */}
      {payOrders.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="rounded-xl border bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>Status Distribution</span>
                <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={statusChart}
                  layout="vertical"
                  margin={{ left: 12, right: 34, top: 8, bottom: 8 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    stroke="oklch(var(--border))"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: "oklch(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="status"
                    type="category"
                    tick={{ fontSize: 13, fill: "oklch(var(--muted-foreground))" }}
                    width={78}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "oklch(var(--muted))", opacity: 0.5 }}
                    content={<ChartTooltip />}
                  />
                  <Bar
                    dataKey="count"
                    fill="oklch(var(--primary))"
                    radius={[0, 6, 6, 0]}
                    barSize={22}
                  >
                    {statusChart.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_CHART_COLORS[entry.status] || CHART_SEMANTIC.neutral}
                      />
                    ))}
                    <LabelList dataKey="count" position="right" className="fill-foreground" fontSize={13} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="rounded-xl border bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>Bid Results</span>
                <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid min-h-[190px] grid-cols-[0.9fr_1fr] items-center gap-3 sm:min-h-[220px] sm:gap-4">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie
                      data={winData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={66}
                      paddingAngle={2}
                      stroke="oklch(var(--card))"
                      strokeWidth={2}
                    >
                      {winData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <text
                      x="50%"
                      y="47%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-foreground text-lg font-semibold"
                    >
                      {payOrders.length}
                    </text>
                    <text
                      x="50%"
                      y="59%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-muted-foreground text-[10px]"
                    >
                      Total
                    </text>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2.5">
                  {winData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-3 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="ml-auto font-semibold tabular-nums text-foreground">{entry.value}</span>
                    </div>
                  ))}
                  <div className="flex border-t border-border pt-3 text-sm font-semibold">
                    <span>Total</span>
                    <span className="ml-auto tabular-nums">{payOrders.length}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="payorders">
        <div className="flex flex-col gap-3 border-b border-border pb-0 lg:flex-row lg:items-end lg:gap-4">
          <TabsList className="h-10 w-full justify-start rounded-none border-b bg-transparent p-0 sm:h-11 lg:w-auto lg:border-b-0">
            <TabsTrigger
              value="payorders"
              className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pr-7 text-sm text-muted-foreground shadow-none data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-emerald-700 data-[state=active]:shadow-none sm:h-11 sm:pr-8 sm:text-base"
            >
              Pay Orders
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 text-sm text-muted-foreground shadow-none data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-emerald-700 data-[state=active]:shadow-none sm:h-11 sm:text-base"
            >
              Activity Log
            </TabsTrigger>
          </TabsList>
          <div className="flex items-start gap-2 pb-2 lg:ml-auto">
            <div className="relative min-w-0 flex-1 sm:w-[360px] sm:flex-none">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search pay orders..."
                className="h-10 rounded-lg pl-10 sm:h-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <div className="relative hidden md:block">
                <Button
                  variant="outline"
                  size="icon"
                  className={`h-10 w-10 rounded-lg sm:h-11 sm:w-11 ${hasPanelFilters ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" : ""}`}
                  aria-label="Filter pay orders"
                  aria-expanded={filterOpen}
                  onClick={() => setFilterOpen((open) => !open)}
                >
                  <Filter className="h-4 w-4" />
                </Button>
                {filterOpen && (
                  <div className="absolute right-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">Filter pay orders</p>
                      {hasPanelFilters && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Active
                        </span>
                      )}
                    </div>
                    {filterPanelContent}
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearFilterPanel}
                      >
                        Clear
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={applyFilterPanel}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                className={`h-10 w-10 rounded-lg md:hidden ${hasPanelFilters ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" : ""}`}
                aria-label="Filter pay orders"
                aria-expanded={mobileFilterOpen}
                onClick={() => setMobileFilterOpen(true)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
                <SheetContent side="bottom" className="max-h-[calc(100dvh-1rem)] gap-0 overflow-hidden rounded-t-2xl p-0 md:hidden">
                  <SheetHeader className="border-b border-border px-4 py-4 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <SheetTitle>Filter pay orders</SheetTitle>
                      {hasPanelFilters && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Active
                        </span>
                      )}
                    </div>
                    <SheetDescription>
                      Narrow the list by bank, status, submission date, result, and amount.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    {filterPanelContent}
                  </div>
                  <SheetFooter className="gap-2 border-t border-border bg-background px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                    <Button type="button" variant="outline" className="h-10 w-full" onClick={clearFilterPanel}>
                      Clear
                    </Button>
                    <Button type="button" className="h-10 w-full" onClick={applyFilterPanel}>
                      Apply
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-lg sm:h-11 sm:w-11"
                title="Export CSV"
                aria-label="Export CSV"
                onClick={() => {
                  if (!exportPayOrdersCSV(filtered))
                    toast.error("Nothing to export");
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-lg sm:h-11 sm:w-11"
                title="Export PDF"
                aria-label="Export PDF"
                onClick={() => {
                  const result = exportPayOrdersPDF(filtered);
                  if (result === "popup-blocked")
                    toast.error("Popup blocked. Please allow popups to export PDF.");
                  else if (!result)
                    toast.error("Nothing to export");
                }}
              >
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <TabsContent value="payorders" className="mt-4">
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:flex-wrap sm:px-0">
            {["All", ...PO_STATUSES].map((s) => {
              const count = s === "All" ? payOrders.length : payOrders.filter((p) => p.status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`h-9 shrink-0 rounded-lg border px-4 text-sm font-medium transition-colors ${
                    filterStatus === s
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {s}
                  {s !== "All" && (
                    <span className="ml-1 tabular-nums">({count})</span>
                  )}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No pay orders found"
              description="Add your first pay order to get started."
              action={
                isAdmin && (
                  <Button onClick={() => openDialog()}>
                    <Plus className="h-4 w-4" /> Add Pay Order
                  </Button>
                )
              }
            />
          ) : (
            <>
              {/* Mobile: card-per-row */}
              <div className="space-y-3 md:hidden">
                {paginatedPayOrders.map((p) => (
                  <Card key={p.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <CardContent className="space-y-3 p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                          <FileText className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <button
                          type="button"
                          onClick={() => setQuickView(p)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-base font-semibold leading-tight text-foreground hover:underline">
                            PO #{p.po || "-"}
                          </p>
                          <p className="mt-1 truncate font-mono text-sm text-foreground">
                            {p.nit || "-"}
                          </p>
                          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                            {p.agency || "No agency"}
                          </p>
                        </button>
                        <div className="flex shrink-0 items-start">
                          {isAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-11 w-11 rounded-lg"
                                  aria-label="Open pay order actions"
                                >
                                  <MoreHorizontal className="h-5 w-5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openDialog(p)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteId(p.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pl-[60px]">
                        <StatusBadge status={p.status} />
                        <StatusBadge status={p.bidResult && p.bidResult !== "N/A" ? p.bidResult : "Awaiting"} />
                      </div>

                      {p.tender && (
                        <button
                          type="button"
                          onClick={() => setQuickView(p)}
                          className="block w-full rounded-lg bg-muted/30 px-3 py-2 text-left text-[15px] font-semibold leading-snug text-foreground"
                        >
                          {p.tender}
                        </button>
                      )}

                      <div className="grid gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 truncate text-foreground">
                            {p.bank || "No bank"}
                          </span>
                          <span className="mx-1 h-4 w-px bg-border" />
                          <span className="shrink-0">NIT/Ref:</span>
                          <span className="min-w-0 truncate font-mono text-foreground">
                            {p.nit || "-"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            Submitted: {formatDate(p.submitted) || "-"}
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-base font-semibold tabular-nums text-emerald-700">
                            {formatCurrency(p.amount)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="whitespace-nowrap text-xs font-semibold">PO #</TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-semibold">Bank</TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-semibold">NIT/Ref</TableHead>
                      <TableHead className="min-w-[260px] text-xs font-semibold">
                        Tender
                      </TableHead>
                      <TableHead className="min-w-[210px] text-xs font-semibold">Agency</TableHead>
                      <TableHead className="whitespace-nowrap text-right text-xs font-semibold">
                        Amount
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-semibold">Submitted</TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-semibold">Status</TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-semibold">
                        Bid Result
                      </TableHead>
                      {isAdmin && <TableHead className="w-14 text-xs font-semibold">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPayOrders.map((p) => (
                      <TableRow key={p.id} className="h-[72px] hover:bg-muted/30">
                        <TableCell className="font-mono text-sm font-semibold">
                          <button
                            type="button"
                            onClick={() => setQuickView(p)}
                            className="hover:underline text-left"
                          >
                            {p.po || "—"}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.bank || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {p.nit || "—"}
                        </TableCell>
                        <TableCell className="max-w-[320px] whitespace-normal text-sm font-semibold leading-5 text-foreground">
                          {p.tender || "—"}
                        </TableCell>
                        <TableCell className="max-w-[260px] whitespace-normal text-sm leading-5 text-muted-foreground">
                          {p.agency || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-sm tabular-nums">
                          {formatCurrency(p.amount)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(p.submitted)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.bidResult} />
                        </TableCell>
                        {isAdmin && (
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
                                <DropdownMenuItem onClick={() => openDialog(p)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteId(p.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </Card>
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm text-muted-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <span>{paginationText}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
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
                      onClick={() => setPage(pageNumber)}
                      className={
                        pageNumber === currentPage
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : ""
                      }
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
                    disabled={currentPage >= pageCount || filtered.length === 0}
                    onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  >
                    Next
                  </Button>
                  <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
                    <SelectTrigger className="h-9 w-[132px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 rows</SelectItem>
                      <SelectItem value="25">25 rows</SelectItem>
                      <SelectItem value="50">50 rows</SelectItem>
                      <SelectItem value="all">All rows</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="flex justify-end mb-4">
            {isAdmin && (
              <Button size="sm" onClick={() => openLogDialog()}>
                <Plus className="h-4 w-4" /> Add Entry
              </Button>
            )}
          </div>
          {activityLog.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No activity logged"
              description="Track your follow-up actions here."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Reference
                    </TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Next Step
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">By</TableHead>
                    {isAdmin && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLog.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(getActivityDate(l))}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {getActivityPO(l) || "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm font-mono">
                        {getActivityRef(l) || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {l.action || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {getActivityNext(l) || "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {l.by || "—"}
                      </TableCell>
                      {isAdmin && (
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
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteLogId(l.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Pay Order Sheet */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent
          side="right"
          className="flex w-full min-w-0 flex-col gap-0 overflow-x-hidden p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
            <SheetTitle>
              {editItem ? "Edit Pay Order" : "New Pay Order"}
            </SheetTitle>
            <SheetDescription>
              {editItem
                ? "Update pay order details."
                : "Record a new pay order entry."}
            </SheetDescription>
          </SheetHeader>
          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={
                  <>
                    PO Number <span className="text-destructive">*</span>
                  </>
                }
                value={form.po}
                onChange={setF("po")}
                placeholder="PO-2024-001"
                className="font-mono"
              />
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Select
                  value={form.bank}
                  onValueChange={(v) => {
                    if (v === "__add_bank__") {
                      setNewBankName("");
                      setAddBankOpen(true);
                      return;
                    }
                    setForm((p) => ({ ...p, bank: v }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No banks yet — add one below.
                      </div>
                    )}
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                    <div className="border-t border-border my-1" />
                    <SelectItem value="__add_bank__" className="text-primary">
                      + Add Bank
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="NIT / Reference"
                value={form.nit}
                onChange={setF("nit")}
                className="font-mono"
              />
              <Field
                label="Amount (PKR)"
                type="number"
                value={form.amount}
                onChange={setF("amount")}
                placeholder="0"
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <Select
                value={form.purpose || "Bid Security"}
                onValueChange={setF("purpose")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PO_PURPOSES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Attach to tender
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  ["none", "None"],
                  ["existing", "Existing"],
                  ["new", "Create new"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTenderMode(v)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${tenderMode === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {tenderMode === "existing" &&
                (() => {
                  const selected = tenders.find((t) => t.id === form.tenderRef);
                  const q = tenderSearch.trim().toLowerCase();
                  const matches = q
                    ? tenders
                        .filter(
                          (t) =>
                            (t.name || "").toLowerCase().includes(q) ||
                            (t.nit || "").toLowerCase().includes(q) ||
                            (t.agency || "").toLowerCase().includes(q),
                        )
                        .slice(0, 8)
                    : [];
                  return (
                    <div className="space-y-2">
                      {selected ? (
                        <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {selected.name || "Untitled"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {selected.nit || "—"}
                              {selected.agency ? ` · ${selected.agency}` : ""}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={() => {
                              setForm((p) => ({ ...p, tenderRef: "" }));
                              setTenderSearch("");
                            }}
                          >
                            Change
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              value={tenderSearch}
                              onChange={(e) => setTenderSearch(e.target.value)}
                              placeholder="Search tenders by name, NIT, or agency..."
                              className="pl-8 h-9"
                            />
                          </div>
                          {q && (
                            <div className="max-h-48 min-w-0 overflow-y-auto rounded-md border border-border">
                              {matches.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-3">
                                  No matching tenders.
                                </p>
                              ) : (
                                matches.map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                      setForm((p) => ({
                                        ...p,
                                        tenderRef: t.id,
                                      }));
                                      setTenderSearch("");
                                    }}
                                    className="w-full min-w-0 border-b border-border px-3 py-2 text-left hover:bg-accent last:border-0"
                                  >
                                    <p className="text-sm font-medium truncate">
                                      {t.name || "Untitled"}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {t.nit || "—"}
                                      {t.agency ? ` · ${t.agency}` : ""}
                                    </p>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                          {!q && tenders.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              No tenders yet — create one instead.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              {tenderMode === "new" && (
                <div className="space-y-2">
                  <Field
                    label="Tender name"
                    value={newTenderFields.name}
                    onChange={(e) =>
                      setNewTenderFields((p) => ({
                        ...p,
                        name: e.target.value,
                      }))
                    }
                  />
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field
                      label="NIT"
                      value={newTenderFields.nit}
                      onChange={(e) =>
                        setNewTenderFields((p) => ({
                          ...p,
                          nit: e.target.value,
                        }))
                      }
                      className="font-mono"
                    />
                    <Field
                      label="Agency"
                      value={newTenderFields.agency}
                      onChange={(e) =>
                        setNewTenderFields((p) => ({
                          ...p,
                          agency: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A new tender will be created with status Bidding
                    {form.purpose === "Bid Security"
                      ? " and this amount as bid security."
                      : form.purpose === "Tender Fee"
                      ? " and this amount as tender fee."
                      : "."}
                  </p>
                </div>
              )}
              {tenderMode === "none" && (
                <Field
                  label="Tender / Project (free-text)"
                  value={form.tender}
                  onChange={setF("tender")}
                />
              )}
            </div>
            <Field
              label="Agency"
              value={form.agency}
              onChange={setF("agency")}
            />
            <Field
              label="Date Submitted"
              type="date"
              value={form.submitted}
              onChange={setF("submitted")}
            />
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={setF("status")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PO_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bid Result</Label>
                <Select
                  value={form.bidResult}
                  onValueChange={setF("bidResult")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BID_RESULTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={setF("notes")}
                rows={4}
                placeholder="Optional remarks…"
              />
            </div>
          </div>
          <SheetFooter className="gap-2 border-t border-border bg-background px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:justify-end sm:px-6 sm:pb-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? "Save Changes" : "Add Pay Order"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Activity Log Sheet */}
      <Sheet open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <SheetContent
          side="right"
          className="flex w-full min-w-0 flex-col gap-0 overflow-x-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
            <SheetTitle>New Log Entry</SheetTitle>
            <SheetDescription>
              Track a follow-up action for this pay order.
            </SheetDescription>
          </SheetHeader>
          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Date"
                type="date"
                value={logForm.date}
                onChange={setLF("date")}
              />
              <Field
                label="PO Number"
                value={logForm.po}
                onChange={setLF("po")}
                className="font-mono"
              />
            </div>
            <Field
              label="Reference"
              value={logForm.ref}
              onChange={setLF("ref")}
              className="font-mono"
            />
            <Field
              label={
                <>
                  Action <span className="text-destructive">*</span>
                </>
              }
              value={logForm.action}
              onChange={setLF("action")}
              placeholder="What was done?"
            />
            <Field
              label="Next Step"
              value={logForm.next}
              onChange={setLF("next")}
              placeholder="What needs to happen next?"
            />
            <Field
              label="By"
              value={logForm.by}
              onChange={setLF("by")}
              placeholder="Who performed this?"
            />
          </div>
          <SheetFooter className="gap-2 border-t border-border bg-background px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:justify-end sm:px-6 sm:pb-4">
            <Button variant="outline" onClick={() => setLogDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLog} disabled={savingLog}>
              {savingLog && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Entry
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <PayOrderQuickView
        payOrder={quickView}
        open={!!quickView}
        onOpenChange={(v) => !v && setQuickView(null)}
        canEdit={isAdmin}
        onEdit={() => {
          const p = quickView;
          setQuickView(null);
          openDialog(p);
        }}
      />

      {/* Add Bank — Dialog stacks reliably on top of the PO Sheet */}
      <Dialog
        open={addBankOpen}
        onOpenChange={(v) => {
          setAddBankOpen(v);
          if (!v) setNewBankName("");
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Bank</DialogTitle>
            <DialogDescription>
              Add a new bank name to choose from.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-bank-name">Bank name</Label>
            <Input
              id="new-bank-name"
              value={newBankName}
              onChange={(e) => setNewBankName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddBank();
                }
              }}
              placeholder="e.g. HBL"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setAddBankOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddBank}>Add Bank</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete pay order"
        description="This will permanently remove the pay order record."
      />
      <ConfirmDelete
        open={!!deleteLogId}
        onOpenChange={() => setDeleteLogId(null)}
        onConfirm={async () => {
          await removeLog(deleteLogId);
          toast.success("Log deleted");
          setDeleteLogId(null);
        }}
        title="Delete log entry"
        description="This will remove this activity log entry."
      />
    </div>
  );
}

function Field({ label, className, inputClassName, ...props }) {
  const id = useId();
  const fieldClassName = props.type === "date" ? `mobile-date-input ${className || ""}` : className;
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className={fieldClassName} {...props} />
    </div>
  );
}
