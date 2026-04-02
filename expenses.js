import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let expenses    = [];
let expFilter   = 'month';
let breakdown   = 'category';
let deleteId    = null;
let editId      = null;
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// ── Category config ───────────────────────────────────────────────────────────
const CAT_CONFIG = {
  'Fuel / Transport':        { cls: 'cat-fuel',      color: '#e8940a' },
  'Printing & Documentation':{ cls: 'cat-printing',  color: '#185fa5' },
  'Courier / Postage':       { cls: 'cat-courier',   color: '#5d3fa5' },
  'Site Visit Costs':        { cls: 'cat-site',      color: '#0e6b4a' },
  'Tender Fees':             { cls: 'cat-tender',    color: '#7a4500' },
  'Office Supplies':         { cls: 'cat-office',    color: '#6b7a90' },
  'Labour / Daily Wages':    { cls: 'cat-labour',    color: '#c0392b' },
  'Equipment & Tools':       { cls: 'cat-equipment', color: '#1a56b0' },
  'Food & Entertainment':    { cls: 'cat-food',      color: '#9d174d' },
  'Miscellaneous':           { cls: 'cat-misc',      color: '#6b7a90' },
};

// ── Auth ──────────────────────────────────────────────────────────────────────
let tenders = [];

onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = 'index.html'; return; }
  loadAll();
});

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const [eSnap, tSnap] = await Promise.all([
      getDocs(query(collection(db, "expenses"), orderBy("date", "desc"))),
      getDocs(collection(db, "tenders")),
    ]);
    expenses = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    tenders  = tSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.name||'').localeCompare(b.name||''));
  } catch(e) {
    console.error('Failed to load expenses data:', e);
    expenses = [];
    tenders  = tenders.length ? tenders : [];
  }
  populateTenderDropdown();
  updateMonthLabel();
  renderAll();
}

function populateTenderDropdown() {
  const sel = document.getElementById('ef_tender');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— None —</option>' +
    tenders.map(t => `<option value="${t.id}">${esc(t.name||'Untitled')} (${esc(t.agency||'—')})</option>`).join('');
  sel.value = cur;
}

// ── Render all ────────────────────────────────────────────────────────────────
function renderAll() {
  renderCards();
  renderTable();
  renderBreakdown();
}

// ── Cards ─────────────────────────────────────────────────────────────────────
function renderCards() {
  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}`;
  const monthExp = expenses.filter(e => (e.date||'').startsWith(monthKey));
  const monthTotal = monthExp.reduce((a,b) => a + (+b.amount||0), 0);

  // top category this month
  const catTotals = {};
  monthExp.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + (+e.amount||0); });
  const topCat = Object.entries(catTotals).sort((a,b) => b[1]-a[1])[0];

  // 6-month average
  const months = [];
  for (let i = 0; i < 6; i++) {
    let m = currentMonth - i, y = currentYear;
    if (m < 0) { m += 12; y--; }
    const key = `${y}-${String(m+1).padStart(2,'0')}`;
    const total = expenses.filter(e => (e.date||'').startsWith(key)).reduce((a,b) => a+(+b.amount||0), 0);
    months.push(total);
  }
  const avg = months.reduce((a,b)=>a+b,0) / 6;
  const allTotal = expenses.reduce((a,b) => a+(+b.amount||0), 0);

  document.getElementById('cMonth').textContent      = fmtPKR(monthTotal);
  document.getElementById('cMonthCount').textContent = `${monthExp.length} entr${monthExp.length===1?'y':'ies'}`;
  document.getElementById('cTopCat').textContent     = topCat ? topCat[0].split(' / ')[0].split(' & ')[0] : '—';
  document.getElementById('cTopCatAmt').textContent  = topCat ? fmtPKR(topCat[1]) : '—';
  document.getElementById('cAvg').textContent        = fmtPKR(Math.round(avg));
  document.getElementById('cTotal').textContent      = fmtPKR(allTotal);
  document.getElementById('cTotalCount').textContent = `${expenses.length} total entr${expenses.length===1?'y':'ies'}`;
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable() {
  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}`;
  let rows = expFilter === 'month'
    ? expenses.filter(e => (e.date||'').startsWith(monthKey))
    : expenses;

  const tbody = document.getElementById('expTbody');
  const empty = document.getElementById('expEmpty');

  document.getElementById('tableTitle').textContent = expFilter === 'month'
    ? `${new Date(currentYear, currentMonth).toLocaleDateString('en-PK',{month:'long',year:'numeric'})} Expenses`
    : 'All Expenses';

  if (!rows.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // running total row
  const total = rows.reduce((a,b) => a+(+b.amount||0), 0);

  tbody.innerHTML = rows.map(e => {
    const cfg = CAT_CONFIG[e.category] || CAT_CONFIG['Miscellaneous'];
    return `
    <tr>
      <td><span class="exp-desc">${esc(e.description||'—')}</span></td>
      <td><span class="badge ${cfg.cls}" style="font-size:10px">${esc(e.category||'—')}</span></td>
      <td><span class="exp-date">${fmtDate(e.date)}</span></td>
      <td class="exp-amount">Rs ${Number(e.amount||0).toLocaleString('en-PK')}</td>
      <td><span class="exp-note">${esc(getTenderName(e.tenderId))}</span></td>
      <td><span class="exp-note">${esc(e.note||'—')}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn-icon" title="Edit" onclick="openEditModal('${e.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M8 1.5l2.5 2.5L3 11H.5V8.5L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-icon del" title="Delete" onclick="openExpConfirm('${e.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('') + `
  <tr style="border-top:2px solid var(--border)">
    <td colspan="3" style="font-weight:600;color:var(--navy);padding:10px 14px">Total</td>
    <td class="exp-amount" style="font-weight:700;color:var(--navy)">Rs ${total.toLocaleString('en-PK')}</td>
    <td colspan="2"></td>
  </tr>`;
}

// ── Breakdown ─────────────────────────────────────────────────────────────────
function renderBreakdown() {
  const el = document.getElementById('breakdownContent');
  if (breakdown === 'category') renderCategoryBreakdown(el);
  else if (breakdown === 'monthly') renderMonthlyBreakdown(el);
  else renderTenderBreakdown(el);
}

function renderTenderBreakdown(el) {
  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}`;
  const rows = expFilter === 'month'
    ? expenses.filter(e => (e.date||'').startsWith(monthKey))
    : expenses;

  const totals = {};
  rows.forEach(e => {
    const key = e.tenderId || '__none__';
    totals[key] = (totals[key]||0) + (+e.amount||0);
  });

  const sorted = Object.entries(totals).sort((a,b) => b[1]-a[1]);
  const max    = sorted[0]?.[1] || 1;

  if (!sorted.length) { el.innerHTML = '<div style="font-size:13px;color:var(--muted);text-align:center;padding:1rem">No data yet.</div>'; return; }

  el.innerHTML = sorted.map(([id, total]) => {
    const name = id === '__none__' ? 'Not linked' : getTenderName(id);
    const pct  = Math.round((total / max) * 100);
    return `
    <div class="cat-bar-item">
      <div class="cat-bar-top">
        <span class="cat-bar-name">
          <span class="cat-bar-dot" style="background:var(--navy2)"></span>
          ${esc(name)}
        </span>
        <span class="cat-bar-val">Rs ${total.toLocaleString('en-PK')}</span>
      </div>
      <div class="cat-bar-bg">
        <div class="cat-bar-fill" style="width:${pct}%;background:var(--navy2)"></div>
      </div>
    </div>`;
  }).join('');
}

function renderCategoryBreakdown(el) {
  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}`;
  const rows = expFilter === 'month'
    ? expenses.filter(e => (e.date||'').startsWith(monthKey))
    : expenses;

  const totals = {};
  rows.forEach(e => { totals[e.category] = (totals[e.category]||0) + (+e.amount||0); });
  const sorted = Object.entries(totals).sort((a,b) => b[1]-a[1]);
  const max    = sorted[0]?.[1] || 1;

  if (!sorted.length) { el.innerHTML = '<div style="font-size:13px;color:var(--muted);text-align:center;padding:1rem">No data yet.</div>'; return; }

  el.innerHTML = sorted.map(([cat, total]) => {
    const cfg = CAT_CONFIG[cat] || CAT_CONFIG['Miscellaneous'];
    const pct = Math.round((total / max) * 100);
    return `
    <div class="cat-bar-item">
      <div class="cat-bar-top">
        <span class="cat-bar-name">
          <span class="cat-bar-dot" style="background:${cfg.color}"></span>
          ${esc(cat)}
        </span>
        <span class="cat-bar-val">Rs ${total.toLocaleString('en-PK')}</span>
      </div>
      <div class="cat-bar-bg">
        <div class="cat-bar-fill" style="width:${pct}%;background:${cfg.color}"></div>
      </div>
    </div>`;
  }).join('');
}

function renderMonthlyBreakdown(el) {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    let m = currentMonth - i, y = currentYear;
    if (m < 0) { m += 12; y--; }
    const key   = `${y}-${String(m+1).padStart(2,'0')}`;
    const total = expenses.filter(e => (e.date||'').startsWith(key)).reduce((a,b) => a+(+b.amount||0), 0);
    const label = new Date(y, m).toLocaleDateString('en-PK', { month:'short' });
    months.push({ key, total, label, isCurrent: m === currentMonth && y === currentYear });
  }

  const max = Math.max(...months.map(m => m.total), 1);

  el.innerHTML = `
  <div class="monthly-chart">
    ${months.map(m => {
      const h = Math.round((m.total / max) * 80);
      return `
      <div class="monthly-bar-wrap ${m.isCurrent ? 'monthly-bar-current' : ''}">
        <div class="monthly-bar-fill" style="height:${Math.max(h,2)}px" title="Rs ${m.total.toLocaleString('en-PK')}"></div>
        <span class="monthly-bar-label">${m.label}</span>
      </div>`;
    }).join('')}
  </div>
  <div style="margin-top:10px">
    ${months.map(m => `
      <div style="display:flex;justify-content:space-between;padding:5px 4px;border-bottom:1px solid var(--border);font-size:12px">
        <span style="color:var(--muted);font-weight:${m.isCurrent?'600':'400'};color:${m.isCurrent?'var(--navy)':'var(--muted)'}">${m.label}</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;color:${m.isCurrent?'var(--amber-fg)':'var(--navy)'}">Rs ${m.total.toLocaleString('en-PK')}</span>
      </div>`).join('')}
  </div>`;
}

// ── Month navigation ──────────────────────────────────────────────────────────
function updateMonthLabel() {
  document.getElementById('monthLabel').textContent =
    new Date(currentYear, currentMonth).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
}

window.changeMonth = function(dir) {
  currentMonth += dir;
  if (currentMonth > 11) { currentMonth = 0;  currentYear++; }
  if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
  updateMonthLabel();
  renderAll();
};

// ── Filter / Breakdown switches ───────────────────────────────────────────────
window.setExpFilter = function(f, btn) {
  expFilter = f;
  document.querySelectorAll('.exp-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAll();
};

window.setBreakdown = function(b, btn) {
  breakdown = b;
  document.querySelectorAll('.breakdown-tab').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  renderBreakdown();
};

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
window.openAddModal = function() {
  editId = null;
  document.getElementById('expModalTitle').textContent = 'Add Expense';
  document.getElementById('ef_desc').value   = '';
  document.getElementById('ef_amount').value = '';
  document.getElementById('ef_note').value   = '';
  document.getElementById('ef_cat').value    = 'Fuel / Transport';
  document.getElementById('ef_tender').value = '';
  document.getElementById('ef_date').value   = new Date().toISOString().split('T')[0];
  document.getElementById('expSaveBtn').textContent = 'Save Expense';
  document.getElementById('addExpModal').classList.add('open');
  setTimeout(() => document.getElementById('ef_desc').focus(), 100);
};

window.openEditModal = function(id) {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  editId = id;
  document.getElementById('expModalTitle').textContent = 'Edit Expense';
  document.getElementById('ef_desc').value   = e.description || '';
  document.getElementById('ef_amount').value = e.amount      || '';
  document.getElementById('ef_note').value   = e.note        || '';
  document.getElementById('ef_cat').value    = e.category    || 'Miscellaneous';
  document.getElementById('ef_tender').value = e.tenderId    || '';
  document.getElementById('ef_date').value   = e.date        || '';
  document.getElementById('expSaveBtn').textContent = 'Update Expense';
  document.getElementById('addExpModal').classList.add('open');
};

window.closeAddModal = function() {
  document.getElementById('addExpModal').classList.remove('open');
  editId = null;
};

window.saveExpense = async function() {
  const btn   = document.getElementById('expSaveBtn');
  const desc  = document.getElementById('ef_desc').value.trim();
  const amt   = document.getElementById('ef_amount').value;
  const date  = document.getElementById('ef_date').value;

  if (!desc)  { toast('Please enter a description.'); return; }
  if (!amt)   { toast('Please enter an amount.'); return; }
  if (!date)  { toast('Please select a date.'); return; }

  const data = {
    description: desc,
    category:    document.getElementById('ef_cat').value,
    tenderId:    document.getElementById('ef_tender').value,
    amount:      amt,
    date,
    note:        document.getElementById('ef_note').value.trim(),
  };

  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (editId) {
      const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      await updateDoc(doc(db, "expenses", editId), data);
      const idx = expenses.findIndex(e => e.id === editId);
      if (idx > -1) expenses[idx] = { ...expenses[idx], ...data };
      toast('Expense updated.');
    } else {
      data.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, "expenses"), data);
      expenses.unshift({ id: ref.id, ...data });
      // keep sorted by date desc
      expenses.sort((a,b) => (b.date||'').localeCompare(a.date||''));
      toast('Expense added.');
    }
    closeAddModal();
    renderAll();
  } catch(e) {
    console.error(e); toast('Error saving expense.');
  } finally {
    btn.disabled = false;
    btn.textContent = editId ? 'Update Expense' : 'Save Expense';
  }
};

// ── Delete ────────────────────────────────────────────────────────────────────
window.openExpConfirm = function(id) {
  deleteId = id;
  document.getElementById('expConfirmOverlay').classList.add('open');
};
window.closeExpConfirm = function() {
  document.getElementById('expConfirmOverlay').classList.remove('open');
  deleteId = null;
};
window.confirmExpDelete = async function() {
  if (!deleteId) return;
  try {
    await deleteDoc(doc(db, "expenses", deleteId));
    expenses = expenses.filter(e => e.id !== deleteId);
    closeExpConfirm();
    renderAll();
    toast('Expense deleted.');
  } catch(e) { toast('Error deleting.'); }
};

// ── Export PDF ────────────────────────────────────────────────────────────────
window.exportExpPDF = function() {
  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}`;
  const rows     = expFilter === 'month'
    ? expenses.filter(e => (e.date||'').startsWith(monthKey))
    : expenses;

  if (!rows.length) { toast('No expenses to export.'); return; }

  const total = rows.reduce((a,b) => a+(+b.amount||0), 0);

  // category totals
  const catTotals = {};
  rows.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + (+e.amount||0); });
  const catRows = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])
    .map(([c,t]) => `<tr><td style="padding:4px 8px">${c}</td><td style="padding:4px 8px;text-align:right;font-weight:600">Rs ${t.toLocaleString('en-PK')}</td></tr>`).join('');

  const expRows = rows
    .map(e => `<tr><td style="padding:4px 8px;font-weight:500">${e.description||'—'}</td><td style="padding:4px 8px">${e.category||'—'}</td><td style="padding:4px 8px">${fmtDate(e.date)}</td><td style="padding:4px 8px;text-align:right">Rs ${Number(e.amount||0).toLocaleString('en-PK')}</td><td style="padding:4px 8px;color:#6b7a90">${e.note||'—'}</td></tr>`).join('');

  const periodLabel = expFilter === 'month'
    ? new Date(currentYear, currentMonth).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })
    : 'All Time';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Expense Report — ${periodLabel}</title>
<style>
  body { font-family:Arial,sans-serif; font-size:12px; color:#0f2a4a; padding:24px; }
  .header { background:#0f2a4a; color:white; padding:18px 24px; border-radius:8px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; }
  .header h1 { margin:0 0 4px; font-size:17px; }
  .header p  { margin:0; opacity:0.5; font-size:10px; }
  .summary { display:flex; gap:10px; margin-bottom:16px; }
  .sum-box { flex:1; background:#f4f6f9; border-radius:6px; padding:10px 12px; }
  .sum-box .lbl { font-size:9px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#6b7a90; margin-bottom:3px; }
  .sum-box .val { font-size:15px; font-weight:700; }
  h3 { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#6b7a90; border-bottom:1px solid #dce3ed; padding-bottom:5px; margin:16px 0 8px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th { background:#0f2a4a; color:white; padding:6px 8px; text-align:left; font-size:9px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; }
  tr:nth-child(even) td { background:#f8fafc; }
  .footer { margin-top:24px; text-align:center; font-size:9px; color:#6b7a90; border-top:1px solid #dce3ed; padding-top:10px; }
  @media print { body { padding:0; } }
</style></head>
<body>
<div class="header">
  <div><h1>Expense Report — ${periodLabel}</h1><p>Grett Engineering Solutions</p></div>
  <div style="text-align:right;font-size:20px;font-weight:700;color:#e8940a">Rs ${total.toLocaleString('en-PK')}</div>
</div>
<div class="summary">
  <div class="sum-box"><div class="lbl">Total Expenses</div><div class="val">Rs ${total.toLocaleString('en-PK')}</div></div>
  <div class="sum-box"><div class="lbl">Entries</div><div class="val">${rows.length}</div></div>
  <div class="sum-box"><div class="lbl">Period</div><div class="val" style="font-size:12px">${periodLabel}</div></div>
</div>
<h3>By Category</h3>
<table><thead><tr><th>Category</th><th style="text-align:right">Total</th></tr></thead><tbody>${catRows}</tbody></table>
<h3>All Entries</h3>
<table><thead><tr><th>Description</th><th>Category</th><th>Date</th><th style="text-align:right">Amount</th><th>Note</th></tr></thead><tbody>${expRows}</tbody></table>
<div class="footer">Grett Engineering Solutions &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-PK')}</div>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
};

// ── Close on overlay click ────────────────────────────────────────────────────
document.getElementById('addExpModal').addEventListener('click', e => {
  if (e.target.id === 'addExpModal') closeAddModal();
});
document.getElementById('expConfirmOverlay').addEventListener('click', e => {
  if (e.target.id === 'expConfirmOverlay') closeExpConfirm();
});

// ── Enter key to save ─────────────────────────────────────────────────────────
document.getElementById('ef_note').addEventListener('keydown', e => {
  if (e.key === 'Enter') window.saveExpense();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTenderName(id) {
  if (!id) return '—';
  const t = tenders.find(x => x.id === id);
  return t ? (t.name||'Untitled') : '—';
}

function fmtPKR(n) {
  return 'Rs ' + Number(n||0).toLocaleString('en-PK');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
