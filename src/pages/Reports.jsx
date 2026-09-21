import { useMemo, useState } from "react";
import {
  BarChart3,
  Banknote,
  BriefcaseBusiness,
  Camera,
  ClipboardList,
  Download,
  Eye,
  FileStack,
  FileText,
  Filter,
  FolderOpen,
  Landmark,
  MapPin,
  MoreHorizontal,
  Printer,
  Receipt,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { useCollection } from "@/hooks/useFirestore";
import {
  calculateTenderFinancials,
  formatCurrencyPrecise,
  formatDate,
  getTenderDisplayStatus,
} from "@/lib/utils";
import { billAmounts, billDate, billNumber, tenderContractValue } from "@/lib/financials";
import { rowsToCSV } from "@/lib/csv";
import EmptyState from "@/components/shared/EmptyState";
import KpiCard from "@/components/shared/KpiCard";
import PageHeader from "@/components/shared/PageHeader";
import { PageTableSkeleton } from "@/components/shared/LoadingSkeletons";
import LoadState from "@/components/shared/LoadState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ALL = "all";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function isInDateRange(value, from, to) {
  const key = dateKey(value);
  if (from && (!key || key < from)) return false;
  if (to && (!key || key > to)) return false;
  return true;
}

function getTenderName(tender = {}) {
  return tender.name || tender.title || tender.projectName || tender.tenderName || "Untitled tender";
}

function getTenderIdFromRow(row = {}) {
  return row._tenderId || row.tenderId || row.tenderRef || "";
}

function getDocumentTitle(document = {}) {
  return document.title || document.name || document.fileName || document.type || document.category || "Untitled document";
}

function getDocumentKind(document = {}) {
  const source = [
    document.kind,
    document.type,
    document.category,
    document.mimeType,
    document.fileType,
    document.fileName,
    document.name,
    document.url,
    document.fileUrl,
  ].join(" ").toLowerCase();
  if (source.includes("image") || /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/.test(source)) return "Image";
  if (source.includes("pdf") || /\.pdf(\?|$)/.test(source)) return "PDF";
  if (source.includes("excel") || source.includes("spreadsheet") || /\.(xls|xlsx|csv)(\?|$)/.test(source)) return "Excel";
  if (source.includes("word") || /\.(doc|docx)(\?|$)/.test(source)) return "Word";
  return "Other";
}

function normalizePhotos(photos) {
  if (Array.isArray(photos)) return photos;
  if (photos && typeof photos === "object") return Object.values(photos);
  return [];
}

function getBillBalance(bill = {}) {
  return billAmounts(bill).balance;
}

function downloadRowsCSV(report, rows) {
  if (!rows.length) {
    toast.error("No rows to export");
    return false;
  }
  const csv = rowsToCSV(
    report.columns.map((column) => column.label),
    rows.map((row) => report.columns.map((column) => row[column.key] ?? "")),
  );
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast.success("Report exported");
  return true;
}

function printReport(reportName) {
  setTimeout(() => {
    document.title = `${reportName} - Reports`;
    window.print();
  }, 100);
}

function buildReportRows({ tenders, payOrders, expenses, documents, bills, siteVisits }) {
  const tenderSummary = tenders.map((tender) => {
    const financials = calculateTenderFinancials(tender);
    return {
      _tenderId: tender.id,
      _date: tender.submissionDate,
      _status: getTenderDisplayStatus(tender),
      _category: "Tender",
      name: getTenderName(tender),
      agency: safeText(tender.agency),
      status: getTenderDisplayStatus(tender),
      estimatedCost: formatCurrencyPrecise(financials.estimatedCost, 0),
      quotedAmount: formatCurrencyPrecise(financials.quotedAmount, 0),
      submissionDate: formatDate(tender.submissionDate),
      openingDate: formatDate(tender.openingDate),
    };
  });

  const tenderPipeline = tenders.map((tender) => ({
    _tenderId: tender.id,
    _date: tender.submissionDate,
    _status: getTenderDisplayStatus(tender),
    _category: "Tender",
    name: getTenderName(tender),
    agency: safeText(tender.agency),
    status: getTenderDisplayStatus(tender),
    value: formatCurrencyPrecise(tender.value, 0),
    submissionDate: formatDate(tender.submissionDate),
    nit: safeText(tender.nit),
  }));

  const awardRows = tenders
    .filter((tender) => ["Awarded", "Won", "In Progress", "Completed"].includes(getTenderDisplayStatus(tender)))
    .map((tender) => ({
      _tenderId: tender.id,
      _date: tender.siteHandoverDate || tender.completionDate || tender.submissionDate,
      _status: getTenderDisplayStatus(tender),
      _category: "Award",
      name: getTenderName(tender),
      agency: safeText(tender.agency),
      status: getTenderDisplayStatus(tender),
      workOrder: safeText(tender.awardWorkOrder?.workOrderNumber || tender.workOrderNo || tender.workOrder || tender.awardRef),
      value: formatCurrencyPrecise(tenderContractValue(tender), 0),
      handoverDate: formatDate(tender.awardWorkOrder?.siteHandoverDate || tender.siteHandoverDate),
    }));

  const boqProfit = tenders.map((tender) => {
    const financials = calculateTenderFinancials(tender);
    const expenseTotal = expenses
      .filter((expense) => expense.tenderRef === tender.id || expense.tenderId === tender.id || expense.tenderId === tender.nit)
      .reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const received = [...asArray(tender.bills), ...asArray(tender.raBills)]
      .reduce((sum, bill) => sum + billAmounts(bill).received, 0);
    return {
      _tenderId: tender.id,
      _date: tender.submissionDate,
      _status: getTenderDisplayStatus(tender),
      _category: "BOQ / Profit",
      name: getTenderName(tender),
      status: getTenderDisplayStatus(tender),
      estimatedCost: formatCurrencyPrecise(financials.estimatedCost, 0),
      quotedAmount: formatCurrencyPrecise(financials.quotedAmount, 0),
      expenses: formatCurrencyPrecise(expenseTotal, 0),
      received: formatCurrencyPrecise(received, 0),
      cashPosition: formatCurrencyPrecise(received - expenseTotal, 0),
    };
  });

  const billRows = bills.map((bill) => ({
    _tenderId: bill.tenderId,
    _date: billDate(bill),
    _status: bill.status || bill.type || "Bill",
    _category: bill.reportType,
    billNo: safeText(billNumber(bill) || bill.number || bill.invoiceNo || bill.id),
    type: bill.reportType,
    tender: bill.tenderName,
    submitted: formatCurrencyPrecise(billAmounts(bill).submitted, 0),
    approved: formatCurrencyPrecise(billAmounts(bill).approved, 0),
    received: formatCurrencyPrecise(billAmounts(bill).received, 0),
    balance: formatCurrencyPrecise(getBillBalance(bill), 0),
    status: safeText(bill.status || bill.paymentStatus),
  }));

  const expenseRows = expenses.map((expense) => ({
    _tenderId: expense.tenderRef || expense.tenderId,
    _date: expense.date,
    _status: expense.status || expense.type || "Expense",
    _category: expense.category || "Other",
    date: formatDate(expense.date),
    category: safeText(expense.category || "Other"),
    description: safeText(expense.description),
    amount: formatCurrencyPrecise(expense.amount, 0),
    status: safeText(expense.status || expense.type || "Expense"),
    tender: safeText(expense.tenderName || expense.tenderId || expense.tenderRef),
  }));

  const receivables = bills
    .filter((bill) => getBillBalance(bill) > 0)
    .map((bill) => ({
      _tenderId: bill.tenderId,
      _date: billDate(bill),
      _status: bill.status || bill.type || "Receivable",
      _category: "Receivable",
      billNo: safeText(billNumber(bill) || bill.number || bill.invoiceNo || bill.id),
      type: bill.reportType,
      tender: bill.tenderName,
      approved: formatCurrencyPrecise(billAmounts(bill).approved, 0),
      received: formatCurrencyPrecise(billAmounts(bill).received, 0),
      balance: formatCurrencyPrecise(getBillBalance(bill), 0),
      status: safeText(bill.status || bill.paymentStatus),
    }));

  const payOrderRows = payOrders.map((payOrder) => ({
    _tenderId: payOrder.tenderRef,
    _date: payOrder.submitted || payOrder.encashedDate || payOrder.updatedAt,
    _status: payOrder.status || payOrder.bidResult,
    _category: payOrder.purpose || "Pay Order",
    po: safeText(payOrder.po),
    tender: safeText(payOrder.tender || payOrder.nit),
    nit: safeText(payOrder.nit),
    bank: safeText(payOrder.bank),
    amount: formatCurrencyPrecise(payOrder.amount, 0),
    status: safeText(payOrder.status),
    result: safeText(payOrder.bidResult || payOrder.result),
    submitted: formatDate(payOrder.submitted),
  }));

  const siteVisitRows = siteVisits.map((visit) => ({
    _tenderId: visit.tenderId,
    _date: visit.visitDate || visit.date,
    _status: visit.status || "Site Visit",
    _category: visit.status || "Site Visit",
    date: formatDate(visit.visitDate || visit.date),
    location: safeText(visit.location || visit.tenderName),
    workCompleted: safeText(visit.workCompleted || visit.notes),
    labourMaterial: safeText([visit.labourUsed, visit.materialUsed].filter(Boolean).join(" / ")),
    issues: safeText(visit.issues),
    photos: normalizePhotos(visit.photos).length,
  }));

  const sitePhotoRows = siteVisits
    .filter((visit) => normalizePhotos(visit.photos).length > 0)
    .map((visit) => ({
      _tenderId: visit.tenderId,
      _date: visit.visitDate || visit.date,
      _status: visit.status || "Site Photo",
      _category: "Site Photos",
      date: formatDate(visit.visitDate || visit.date),
      tender: visit.tenderName,
      location: safeText(visit.location),
      photos: normalizePhotos(visit.photos).length,
      notes: safeText(visit.notes || visit.workCompleted),
    }));

  const documentRows = documents.map((document) => ({
    _tenderId: document.tenderId,
    _date: document.uploadedAt || document.createdAt || document.addedAt,
    _status: document.kind,
    _category: document.category,
    fileName: safeText(document.fileName || document.title),
    type: document.kind,
    category: safeText(document.category || "Other"),
    linkedTender: document.tenderName,
    uploadedDate: formatDate(document.uploadedAt || document.createdAt || document.addedAt),
  }));

  return {
    tenderSummary,
    tenderPipeline,
    awardRows,
    boqProfit,
    billRows,
    expenseRows,
    receivables,
    payOrderRows,
    siteVisitRows,
    sitePhotoRows,
    workProgress: siteVisitRows,
    documentRows,
  };
}

const REPORT_GROUPS = [
  {
    title: "Tender Reports",
    key: "tender",
    reports: [
      {
        id: "tender-summary-report",
        name: "Tender Summary Report",
        description: "Core tender status, agency, estimate, quote, and submission dates.",
        icon: FileStack,
        rowsKey: "tenderSummary",
        columns: [
          { key: "name", label: "Tender name" },
          { key: "agency", label: "Agency" },
          { key: "status", label: "Status" },
          { key: "estimatedCost", label: "Estimated cost" },
          { key: "quotedAmount", label: "Quoted amount" },
          { key: "submissionDate", label: "Submission date" },
          { key: "openingDate", label: "Opening date" },
        ],
      },
      {
        id: "tender-pipeline-report",
        name: "Tender Pipeline Report",
        description: "Pipeline view by tender status, value, submission date, and NIT reference.",
        icon: BarChart3,
        rowsKey: "tenderPipeline",
        columns: [
          { key: "name", label: "Tender name" },
          { key: "agency", label: "Agency" },
          { key: "status", label: "Status" },
          { key: "value", label: "Value" },
          { key: "submissionDate", label: "Submission" },
          { key: "nit", label: "NIT / Ref" },
        ],
      },
      {
        id: "award-work-order-report",
        name: "Award / Work Order Report",
        description: "Awarded and active work with work order references where available.",
        icon: BriefcaseBusiness,
        rowsKey: "awardRows",
        columns: [
          { key: "name", label: "Tender name" },
          { key: "agency", label: "Agency" },
          { key: "status", label: "Status" },
          { key: "workOrder", label: "Work order" },
          { key: "value", label: "Value" },
          { key: "handoverDate", label: "Handover date" },
        ],
      },
    ],
  },
  {
    title: "Financial Reports",
    key: "financial",
    reports: [
      {
        id: "boq-profit-report",
        name: "BOQ / Profit Report",
        description: "Estimate, quote, expenses, received amounts, and cash position.",
        icon: TrendingUp,
        rowsKey: "boqProfit",
        columns: [
          { key: "name", label: "Tender" },
          { key: "status", label: "Status" },
          { key: "estimatedCost", label: "Estimated" },
          { key: "quotedAmount", label: "Quoted" },
          { key: "expenses", label: "Expenses" },
          { key: "received", label: "Received" },
          { key: "cashPosition", label: "Cash position" },
        ],
      },
      {
        id: "bills-ra-bills-report",
        name: "Bills / RA Bills Report",
        description: "Submitted, approved, received, outstanding, and status by bill.",
        icon: Receipt,
        rowsKey: "billRows",
        columns: [
          { key: "billNo", label: "Bill no" },
          { key: "type", label: "Type" },
          { key: "tender", label: "Tender" },
          { key: "submitted", label: "Submitted" },
          { key: "approved", label: "Approved" },
          { key: "received", label: "Received" },
          { key: "balance", label: "Balance" },
          { key: "status", label: "Status" },
        ],
      },
      {
        id: "expenses-report",
        name: "Expenses Report",
        description: "Project expense register by date, category, description, amount, and status.",
        icon: WalletCards,
        rowsKey: "expenseRows",
        columns: [
          { key: "date", label: "Date" },
          { key: "category", label: "Category" },
          { key: "description", label: "Description" },
          { key: "amount", label: "Amount" },
          { key: "status", label: "Status / Type" },
          { key: "tender", label: "Tender" },
        ],
      },
      {
        id: "receivables-report",
        name: "Receivables Report",
        description: "Outstanding bill and RA bill balances that still need collection.",
        icon: Banknote,
        rowsKey: "receivables",
        columns: [
          { key: "billNo", label: "Bill no" },
          { key: "type", label: "Type" },
          { key: "tender", label: "Tender" },
          { key: "approved", label: "Approved" },
          { key: "received", label: "Received" },
          { key: "balance", label: "Balance" },
          { key: "status", label: "Status" },
        ],
      },
      {
        id: "pay-order-report",
        name: "Pay Order Report",
        description: "Pay order register with tender, NIT, bank, amount, status, and result.",
        icon: Landmark,
        rowsKey: "payOrderRows",
        columns: [
          { key: "po", label: "PO number" },
          { key: "tender", label: "Tender / NIT ref" },
          { key: "bank", label: "Bank" },
          { key: "amount", label: "Amount" },
          { key: "status", label: "Status" },
          { key: "result", label: "Bid / lost status" },
          { key: "submitted", label: "Submitted" },
        ],
      },
    ],
  },
  {
    title: "Site / Progress Reports",
    key: "site",
    reports: [
      {
        id: "site-visit-report",
        name: "Site Visit Report",
        description: "Site visit activity with location, work completed, labour/material, and issues.",
        icon: MapPin,
        rowsKey: "siteVisitRows",
        columns: [
          { key: "date", label: "Date" },
          { key: "location", label: "Location" },
          { key: "workCompleted", label: "Work completed" },
          { key: "labourMaterial", label: "Labour / Material" },
          { key: "issues", label: "Issues" },
          { key: "photos", label: "Photos" },
        ],
      },
      {
        id: "site-visit-photo-report",
        name: "Site Visit Photo Report",
        description: "Site visits that include attached progress photos.",
        icon: Camera,
        rowsKey: "sitePhotoRows",
        requiresRows: true,
        columns: [
          { key: "date", label: "Date" },
          { key: "tender", label: "Tender" },
          { key: "location", label: "Location" },
          { key: "photos", label: "Photos count" },
          { key: "notes", label: "Notes" },
        ],
      },
      {
        id: "work-progress-report",
        name: "Work Progress Report",
        description: "Progress-oriented view of work completed and issues from site visits.",
        icon: ClipboardList,
        rowsKey: "workProgress",
        columns: [
          { key: "date", label: "Date" },
          { key: "location", label: "Location" },
          { key: "workCompleted", label: "Work completed" },
          { key: "labourMaterial", label: "Labour / Material" },
          { key: "issues", label: "Issues" },
        ],
      },
    ],
  },
  {
    title: "Document Reports",
    key: "document",
    reports: [
      {
        id: "documents-register",
        name: "Documents Register",
        description: "All uploaded tender documents with type, category, linked tender, and upload date.",
        icon: FolderOpen,
        rowsKey: "documentRows",
        columns: [
          { key: "fileName", label: "File name" },
          { key: "type", label: "Type" },
          { key: "category", label: "Category" },
          { key: "linkedTender", label: "Linked tender" },
          { key: "uploadedDate", label: "Uploaded date" },
        ],
      },
      {
        id: "tender-documents-report",
        name: "Tender Documents Report",
        description: "Tender-linked document report for BOQs, work orders, letters, drawings, and files.",
        icon: FileText,
        rowsKey: "documentRows",
        columns: [
          { key: "linkedTender", label: "Tender" },
          { key: "fileName", label: "File name" },
          { key: "type", label: "Type" },
          { key: "category", label: "Category" },
          { key: "uploadedDate", label: "Uploaded date" },
        ],
      },
    ],
  },
];

function getReportRows(report, rowsByKey, filters) {
  return (rowsByKey[report.rowsKey] || []).filter((row) => {
    if (filters.tenderId !== ALL && getTenderIdFromRow(row) !== filters.tenderId) return false;
    if (!isInDateRange(row._date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.status !== ALL && String(row._status || "") !== filters.status) return false;
    if (filters.category !== ALL && String(row._category || "") !== filters.category) return false;
    return true;
  });
}

export default function Reports() {
  const { data: tenders, loading: tendersLoading, error: tendersError } = useCollection("tenders", "createdAt", "desc");
  const { data: payOrders, loading: payOrdersLoading, error: payOrdersError } = useCollection("payOrders", "createdAt", "desc");
  const { data: expenses, loading: expensesLoading, error: expensesError } = useCollection("expenses", "date", "desc");
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [filters, setFilters] = useState({
    tenderId: ALL,
    dateFrom: "",
    dateTo: "",
    status: ALL,
    category: ALL,
  });

  const documents = useMemo(() => tenders.flatMap((tender) =>
    asArray(tender.documents).map((document, index) => ({
      ...document,
      id: document.id || `${tender.id}-${index}`,
      tenderId: tender.id,
      tenderName: getTenderName(tender),
      kind: getDocumentKind(document),
      category: document.category || document.type || "Other",
      fileName: document.fileName || document.name || getDocumentTitle(document),
    })),
  ), [tenders]);

  const bills = useMemo(() => tenders.flatMap((tender) => [
    ...asArray(tender.bills).map((bill, index) => ({
      ...bill,
      id: bill.id || `${tender.id}-bill-${index}`,
      tenderId: tender.id,
      tenderName: getTenderName(tender),
      reportType: "Bill",
    })),
    ...asArray(tender.raBills).map((bill, index) => ({
      ...bill,
      id: bill.id || `${tender.id}-ra-${index}`,
      tenderId: tender.id,
      tenderName: getTenderName(tender),
      reportType: "RA Bill",
    })),
  ]), [tenders]);

  const siteVisits = useMemo(() => tenders.flatMap((tender) =>
    asArray(tender.siteVisits).map((visit, index) => ({
      ...visit,
      id: visit.id || `${tender.id}-visit-${index}`,
      tenderId: tender.id,
      tenderName: getTenderName(tender),
    })),
  ), [tenders]);

  const rowsByKey = useMemo(
    () => buildReportRows({ tenders, payOrders, expenses, documents, bills, siteVisits }),
    [bills, documents, expenses, payOrders, siteVisits, tenders],
  );

  const reportGroups = useMemo(() => REPORT_GROUPS.map((group) => ({
    ...group,
    reports: group.reports.filter((report) => !report.requiresRows || (rowsByKey[report.rowsKey] || []).length > 0),
  })), [rowsByKey]);

  const reports = useMemo(() => reportGroups.flatMap((group) => group.reports), [reportGroups]);
  const selectedReport = reports.find((report) => report.id === selectedReportId) || reports[0];
  const selectedRows = selectedReport ? getReportRows(selectedReport, rowsByKey, filters) : [];
  const statusOptions = Array.from(new Set((rowsByKey[selectedReport?.rowsKey] || []).map((row) => row._status).filter(Boolean))).sort();
  const categoryOptions = Array.from(new Set((rowsByKey[selectedReport?.rowsKey] || []).map((row) => row._category).filter(Boolean))).sort();
  const loading = tendersLoading || payOrdersLoading || expensesLoading;

  const summaryCards = [
    { icon: FileStack, label: "Total Reports Available", value: reports.length, helper: "Across all categories", tone: "emerald" },
    { icon: BriefcaseBusiness, label: "Tender Reports", value: reportGroups.find((group) => group.key === "tender")?.reports.length || 0, helper: `${tenders.length} tenders`, tone: "blue" },
    { icon: Banknote, label: "Financial Reports", value: reportGroups.find((group) => group.key === "financial")?.reports.length || 0, helper: `${bills.length + expenses.length + payOrders.length} records`, tone: "amber" },
    { icon: MapPin, label: "Site Reports", value: reportGroups.find((group) => group.key === "site")?.reports.length || 0, helper: `${siteVisits.length} visits`, tone: "violet" },
    { icon: FolderOpen, label: "Document Reports", value: reportGroups.find((group) => group.key === "document")?.reports.length || 0, helper: `${documents.length} documents`, tone: "emerald" },
  ];

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const previewReport = (report) => {
    setSelectedReportId(report.id);
    document.getElementById("report-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const exportReport = (report) => {
    const rows = getReportRows(report, rowsByKey, filters);
    downloadRowsCSV(report, rows);
  };

  const handlePrint = (report) => {
    const rows = getReportRows(report, rowsByKey, filters);
    if (!rows.length) {
      toast.error("No rows to print");
      return;
    }
    setSelectedReportId(report.id);
    printReport(report.name);
  };

  if (loading) return <PageTableSkeleton rows={8} cols={6} metrics={5} />;
  const loadError = tendersError || payOrdersError || expensesError;
  if (loadError) return <LoadState title="Could not load reports" error={loadError} />;

  return (
    <div className="space-y-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:space-y-7 sm:pb-6">
      <PageHeader
        title="Reports"
        description="Generate tender, financial, document, and site progress reports."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedReport && exportReport(selectedReport)}
              disabled={!selectedReport || selectedRows.length === 0}
              className="min-h-9 sm:min-h-10"
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button
              size="sm"
              onClick={() => selectedReport && handlePrint(selectedReport)}
              disabled={!selectedReport || selectedRows.length === 0}
              className="min-h-9 sm:min-h-10"
            >
              <Printer className="h-4 w-4" /> Print Report
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {summaryCards.map((card) => (
          <KpiCard
            key={card.label}
            {...card}
            contentClassName="gap-2.5 p-3.5 sm:gap-3 sm:p-5"
            valueClassName="text-xl sm:text-2xl"
          />
        ))}
      </div>

      <Card className="rounded-xl border bg-card print:hidden">
        <CardHeader className="px-4 pb-2 pt-4 sm:px-5">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Filter className="h-4 w-4" />
            </span>
            <span>Report Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(150px,1fr))]">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="report-tender" className="text-xs font-medium text-muted-foreground">Tender / Project</Label>
              <Select value={filters.tenderId} onValueChange={(value) => setFilter("tenderId", value)}>
                <SelectTrigger id="report-tender" className="h-10 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All tenders</SelectItem>
                  {tenders.map((tender) => (
                    <SelectItem key={tender.id} value={tender.id}>
                      {getTenderName(tender)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="report-date-from" className="text-xs font-medium text-muted-foreground">Date From</Label>
              <Input id="report-date-from" className="mobile-date-input" type="date" value={filters.dateFrom} onChange={(event) => setFilter("dateFrom", event.target.value)} />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="report-date-to" className="text-xs font-medium text-muted-foreground">Date To</Label>
              <Input id="report-date-to" className="mobile-date-input" type="date" value={filters.dateTo} onChange={(event) => setFilter("dateTo", event.target.value)} />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="report-status" className="text-xs font-medium text-muted-foreground">Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilter("status", value)}>
                <SelectTrigger id="report-status" className="h-10 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="report-category" className="text-xs font-medium text-muted-foreground">Category / Type</Label>
              <Select value={filters.category} onValueChange={(value) => setFilter("category", value)}>
                <SelectTrigger id="report-category" className="h-10 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {reportGroups.map((group) => (
        <section key={group.key} className="scroll-mt-24 space-y-3 pt-2 print:hidden sm:space-y-4 sm:pt-1">
          <div className="border-b border-border/70 pb-2.5 sm:pb-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">{group.title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{group.reports.length} reports available with the current data set</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 2xl:grid-cols-3">
            {group.reports.map((report) => {
              const Icon = report.icon;
              const rows = getReportRows(report, rowsByKey, filters);
              const isSelected = selectedReportId === report.id;
              return (
                <Card
                  key={report.id}
                  className={`rounded-xl border bg-card transition-all hover:border-emerald-200 hover:shadow-md dark:hover:border-emerald-900 ${
                    isSelected ? "border-emerald-300 ring-2 ring-emerald-100 dark:border-emerald-800 dark:ring-emerald-950" : ""
                  }`}
                >
                  <CardContent className="flex h-full flex-col gap-3 p-3.5 sm:gap-4 sm:p-5">
                    <div className="flex items-start gap-3 sm:gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/50 sm:h-12 sm:w-12">
                        <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 text-base font-semibold leading-snug text-foreground">{report.name}</h3>
                          <Badge variant="outline" className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {rows.length} {rows.length === 1 ? "record" : "records"}
                          </Badge>
                        </div>
                        <p className="text-sm leading-snug text-muted-foreground">{report.description}</p>
                      </div>
                    </div>
                    <div className="mt-auto flex items-center gap-2 border-t border-border/70 pt-3">
                      <Button variant={isSelected ? "secondary" : "outline"} size="sm" className="flex-1 justify-center" onClick={() => previewReport(report)}>
                        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Preview
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${report.name}`}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => exportReport(report)} disabled={rows.length === 0}><Download /> Export CSV</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handlePrint(report)} disabled={rows.length === 0}><Printer /> Print report</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <Card id="report-preview" className="overflow-hidden rounded-xl border bg-card">
        <CardHeader className="border-b border-border bg-card/80 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold tracking-tight">{selectedReport?.name || "Report Preview"}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Previewing {selectedRows.length} {selectedRows.length === 1 ? "record" : "records"} with the current filters.
              </p>
            </div>
            <Badge variant="outline" className="w-fit rounded-full px-2.5 py-1 text-xs text-muted-foreground">
              Reports Preview
            </Badge>
          </div>
        </CardHeader>
        {selectedRows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No report data"
            description="Try changing filters or previewing another report."
          />
        ) : (
          <CardContent className="p-0">
            <div className="md:hidden">
              <div className="space-y-3 bg-muted/30 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                {selectedRows.slice(0, 25).map((row, index) => (
                  <Card key={`${selectedReport.id}-card-${index}`} className="rounded-xl border bg-card">
                    <CardContent className="space-y-2.5 p-3.5">
                      {selectedReport.columns.map((column) => (
                        <div key={column.key} className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 text-sm min-[430px]:grid-cols-[124px_minmax(0,1fr)]">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{column.label}</span>
                          <span className="min-w-0 break-words text-foreground">{safeText(row[column.key])}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    {selectedReport.columns.map((column) => (
                      <TableHead key={column.key} className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRows.slice(0, 100).map((row, index) => (
                    <TableRow key={`${selectedReport.id}-row-${index}`}>
                      {selectedReport.columns.map((column) => (
                        <TableCell key={column.key} className="max-w-[280px] whitespace-normal break-words text-sm leading-6">
                          {safeText(row[column.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {selectedRows.length > 100 && (
              <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                Showing first 100 rows in preview. Export CSV includes all {selectedRows.length} rows.
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
