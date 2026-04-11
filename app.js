import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs,
  updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Auth Guard ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = "/"; return; }
  loadAll();
});

// ── State ─────────────────────────────────────────────────────────────────────
let payOrders  = [];
let activityLog = [];
let tendersList = [];
let currentFilter = 'all';
let editPOId   = null;
let editLogId  = null;
let deleteTarget = null; // { type: 'po'|'log', id }

// ── Load all data ─────────────────────────────────────────────────────────────
async function loadAll() {
  const TIMEOUT = 8000;
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), TIMEOUT)
    );
    await Promise.race([
      Promise.all([loadPO(), loadLog(), loadTenders()]),
      timeout
    ]);
  } catch(e) {
    console.error('Failed to load dashboard data:', e);
    if (e.message === 'timeout') {
      toast('Loading timed out. Check your connection and refresh.');
    } else {
      toast('Error loading data. Please refresh the page.');
    }
  }
  renderAll();
}

async function loadPO() {
  try {
    const q   = query(collection(db, "payOrders"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    payOrders  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Failed to load pay orders:', e);
    payOrders = [];
    throw e;
  }
}

async function loadLog() {
  try {
    const q    = query(collection(db, "activityLog"), orderBy("date", "desc"));
    const snap  = await getDocs(q);
    activityLog = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Failed to load activity log:', e);
    activityLog = [];
    throw e;
  }
}

async function loadTenders() {
  try {
    const snap = await getDocs(collection(db, "tenders"));
    tendersList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Failed to load tenders:', e);
    tendersList = [];
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
  renderCards();
  renderAnalytics();
  renderPOTable();
  renderLogTable();
}

function renderCards() {
  const totalAmt = payOrders.reduce((a,b) => a + (+b.amount||0), 0);
  const total    = payOrders.length;
  const risk     = payOrders.filter(p => p.status === 'Submitted').reduce((a,b) => a + (+b.amount||0), 0);
  const returned = payOrders.filter(p => p.status === 'Returned').reduce((a,b) => a + (+b.amount||0), 0);
  const encashed = payOrders.filter(p => p.status === 'Encashed').reduce((a,b) => a + (+b.amount||0), 0);
  const pending  = payOrders.filter(p => p.status === 'Submitted' && p.bidResult === 'Awaiting').length;

  document.getElementById('s-total-amt').textContent = fmtPKR(totalAmt);
  document.getElementById('s-total').textContent     = total;
  document.getElementById('s-risk').textContent      = fmtPKR(risk);
  document.getElementById('s-returned').textContent  = fmtPKR(returned);
  document.getElementById('s-encashed').textContent  = fmtPKR(encashed);
  document.getElementById('s-pending').textContent   = pending;
}

// ── Analytics Charts ─────────────────────────────────────────────────────────
function renderAnalytics() {
  const el = document.getElementById('analyticsRow');
  if (!payOrders.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.classList.add('visible');

  // Status distribution
  const statuses = ['Pending','Submitted','Returned','Encashed','Forfeited'];
  const colors   = { Pending:'#e8940a', Submitted:'#185fa5', Returned:'#0e6b4a', Encashed:'#c0392b', Forfeited:'#5d3fa5' };
  const counts   = {};
  statuses.forEach(s => counts[s] = payOrders.filter(p => p.status === s).length);
  const maxCount = Math.max(...Object.values(counts), 1);

  document.getElementById('statusChart').innerHTML = statuses.map(s => {
    const pct = (counts[s] / maxCount) * 100;
    return `<div class="status-bar-row">
      <span class="status-bar-label">${s}</span>
      <div class="status-bar-track"><div class="status-bar-fill" style="width:${pct}%;background:${colors[s]}"></div></div>
      <span class="status-bar-val">${counts[s]}</span>
    </div>`;
  }).join('');

  // Monthly amounts (last 6 months)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleDateString('en-PK',{month:'short'}) });
  }
  const monthAmts = {};
  months.forEach(m => monthAmts[m.key] = 0);
  payOrders.forEach(p => {
    if (!p.issued) return;
    const key = p.issued.slice(0, 7);
    if (monthAmts[key] !== undefined) monthAmts[key] += (+p.amount || 0);
  });
  const maxAmt = Math.max(...Object.values(monthAmts), 1);

  document.getElementById('monthlyChart').innerHTML = `<div class="monthly-bars">${months.map(m => {
    const amt = monthAmts[m.key];
    const pct = Math.max((amt / maxAmt) * 100, 3);
    const display = amt >= 1000000 ? (amt/1000000).toFixed(1)+'M' : amt >= 1000 ? Math.round(amt/1000)+'K' : amt;
    return `<div class="monthly-bar-col">
      <span class="monthly-bar-val">${amt ? display : ''}</span>
      <div class="monthly-bar" style="height:${pct}%"></div>
      <span class="monthly-bar-label">${m.label}</span>
    </div>`;
  }).join('')}</div>`;

  // Win rate donut
  renderWinRate();
}

function renderWinRate() {
  const el = document.getElementById('winRateChart');
  const won  = tendersList.filter(t => t.status === 'Awarded').length;
  const lost = tendersList.filter(t => t.status === 'Lost').length;
  const active = tendersList.filter(t => ['Bidding','Submitted'].includes(t.status)).length;
  const total = tendersList.length;
  const decided = won + lost;
  const rate = decided > 0 ? Math.round((won / decided) * 100) : 0;

  if (!total) {
    el.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--muted);padding:1rem">No tenders yet</div>';
    return;
  }

  // SVG donut chart
  const size = 80, stroke = 9, radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const wonArc  = decided > 0 ? (won / decided) * circ : 0;
  const lostArc = decided > 0 ? (lost / decided) * circ : 0;

  el.innerHTML = `
    <div class="winrate-wrap">
      <div class="winrate-donut">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
          <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--bg)" stroke-width="${stroke}"/>
          ${decided > 0 ? `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--green-fg)" stroke-width="${stroke}"
            stroke-dasharray="${wonArc} ${circ}" stroke-linecap="round"/>
          <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--red-fg)" stroke-width="${stroke}"
            stroke-dasharray="${lostArc} ${circ}" stroke-dashoffset="${-wonArc}" stroke-linecap="round"/>` : ''}
        </svg>
        <div class="winrate-center">
          <span class="winrate-pct">${rate}%</span>
          <span class="winrate-label">WIN RATE</span>
        </div>
      </div>
      <div class="winrate-legend">
        <div class="winrate-leg-item"><div class="winrate-dot" style="background:var(--green-fg)"></div>Won: ${won}</div>
        <div class="winrate-leg-item"><div class="winrate-dot" style="background:var(--red-fg)"></div>Lost: ${lost}</div>
        <div class="winrate-leg-item"><div class="winrate-dot" style="background:var(--blue-fg)"></div>Active: ${active}</div>
        <div class="winrate-leg-total">Total: ${total} tenders</div>
      </div>
    </div>`;
}

window.renderPOTable = function() {
  const q   = (document.getElementById('searchBox').value || '').toLowerCase();
  const rows = payOrders.filter(p => {
    const matchF = currentFilter === 'all' || p.status === currentFilter;
    const matchS = !q || [p.po,p.tender,p.agency,p.nit,p.bank].some(v => (v||'').toLowerCase().includes(q));
    return matchF && matchS;
  });

  const tbody = document.getElementById('poTbody');
  const empty = document.getElementById('poEmpty');
  const wrap  = document.getElementById('poTableWrap');

  if (!rows.length) {
    wrap.style.display  = 'none';
    empty.style.display = 'block';
    return;
  }
  wrap.style.display  = 'block';
  empty.style.display = 'none';

  tbody.innerHTML = rows.map(p => {
    return `
    <tr data-id="${p.id}" onclick="handleRowClick('${p.id}', this)">
      <td data-label="PO Number"><span class="td-po">${esc(p.po||'—')}</span></td>
      <td data-label="Bank"><span class="td-muted">${esc(p.bank||'—')}</span></td>
      <td data-label="NIT / Ref"><span class="td-muted">${esc(p.nit||'—')}</span></td>
      <td data-label="Tender"><div class="td-tender">${esc(p.tender||'—')}</div></td>
      <td data-label="Agency"><span class="td-muted">${esc(p.agency||'—')}</span></td>
      <td data-label="Amount" class="num">${p.amount ? 'Rs '+Number(p.amount).toLocaleString('en-PK') : '—'}</td>
      <td data-label="Issued" class="td-date">${fmtDate(p.issued)}</td>
      <td data-label="Status">${statusBadge(p.status)}</td>
      <td data-label="Bid Result">${resultBadge(p.bidResult)}</td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="btn-icon" title="Edit" onclick="openEditPO('${p.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M8 1.5l2.5 2.5L3 11H.5V8.5L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
          </button>
          ${p.status === 'Submitted' ? `<button class="btn-icon" title="Mark as Returned" onclick="quickReturn('${p.id}', event)" style="color:var(--green-fg);border-color:var(--green-fg)">
            <svg viewBox="0 0 12 12" fill="none"><path d="M1.5 6.5l2.5 2.5 6-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
};

function renderLogTable() {
  const tbody = document.getElementById('logTbody');
  const empty = document.getElementById('logEmpty');
  const wrap  = document.getElementById('logTableWrap');

  if (!activityLog.length) {
    wrap.style.display  = 'none';
    empty.style.display = 'block';
    return;
  }
  wrap.style.display  = 'block';
  empty.style.display = 'none';

  tbody.innerHTML = activityLog.map(l => `
    <tr>
      <td data-label="Date" class="td-date">${fmtDate(l.date)}</td>
      <td data-label="PO Number"><span class="td-po">${esc(l.po||'—')}</span></td>
      <td data-label="Reference"><span class="td-muted">${esc(l.ref||'—')}</span></td>
      <td data-label="Action">${esc(l.action||'—')}</td>
      <td data-label="Next Step"><span class="td-muted">${esc(l.next||'—')}</span></td>
      <td data-label="By"><span class="td-muted">${esc(l.by||'—')}</span></td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="btn-icon" title="Edit" onclick="openEditLog('${l.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M8 1.5l2.5 2.5L3 11H.5V8.5L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

// ── PO Modal ──────────────────────────────────────────────────────────────────
window.openPOModal = function() {
  editPOId = null;
  document.getElementById('poModalTitle').textContent = 'New Pay Order';
  ['po','bank','nit','amount','tender','agency','issued','submitted','notes'].forEach(f => {
    document.getElementById('f_'+f).value = '';
  });
  document.getElementById('f_status').value = 'Pending';
  document.getElementById('f_result').value = 'N/A';
  document.getElementById('poModalOverlay').classList.add('open');
};

window.openEditPO = function(id) {
  editPOId = id;
  const p = payOrders.find(x => x.id === id);
  if (!p) return;
  document.getElementById('poModalTitle').textContent = 'Edit Pay Order';
  document.getElementById('f_po').value        = p.po        || '';
  document.getElementById('f_bank').value      = p.bank      || '';
  document.getElementById('f_nit').value       = p.nit       || '';
  document.getElementById('f_amount').value    = p.amount    || '';
  document.getElementById('f_tender').value    = p.tender    || '';
  document.getElementById('f_agency').value    = p.agency    || '';
  document.getElementById('f_issued').value    = p.issued    || '';
  document.getElementById('f_submitted').value = p.submitted || '';
  document.getElementById('f_status').value    = p.status    || 'Pending';
  document.getElementById('f_result').value    = p.bidResult || 'N/A';
  document.getElementById('f_notes').value     = p.notes     || '';
  document.getElementById('poModalOverlay').classList.add('open');
};

window.closePOModal = function() {
  document.getElementById('poModalOverlay').classList.remove('open');
  editPOId = null;
};

window.savePO = async function() {
  const btn  = document.getElementById('poSaveBtn');
  const data = {
    po:        gv('f_po'),
    bank:      gv('f_bank'),
    nit:       gv('f_nit'),
    amount:    gv('f_amount'),
    tender:    gv('f_tender'),
    agency:    gv('f_agency'),
    issued:    gv('f_issued'),
    submitted: gv('f_submitted'),
    status:    gv('f_status'),
    bidResult: gv('f_result'),
    notes:     gv('f_notes'),
  };
  if (!data.tender && !data.po) { toast('Enter at least a PO number or tender name.'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (editPOId) {
      await updateDoc(doc(db, "payOrders", editPOId), data);
      toast(`Pay Order updated — ${data.po || 'N/A'} | ${fmtPKR(data.amount)} | ${data.status}`);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "payOrders"), data);
      toast(`Pay Order added — ${data.po || 'N/A'} | ${fmtPKR(data.amount)} | ${data.status}`);
    }
    await loadPO(); renderAll(); closePOModal();
  } catch(e) { toast('Error saving. Please try again.'); console.error(e); }
  finally { btn.disabled = false; btn.textContent = 'Save Entry'; }
};

// ── Log Modal ─────────────────────────────────────────────────────────────────
window.openLogModal = function() {
  editLogId = null;
  document.getElementById('logModalTitle').textContent = 'New Log Entry';
  ['date','po','ref','action','next','by'].forEach(f => {
    document.getElementById('lf_'+f).value = '';
  });
  document.getElementById('lf_date').value = new Date().toISOString().split('T')[0];
  document.getElementById('logModalOverlay').classList.add('open');
};

window.openEditLog = function(id) {
  editLogId = id;
  const l = activityLog.find(x => x.id === id);
  if (!l) return;
  document.getElementById('logModalTitle').textContent = 'Edit Log Entry';
  document.getElementById('lf_date').value   = l.date   || '';
  document.getElementById('lf_po').value     = l.po     || '';
  document.getElementById('lf_ref').value    = l.ref    || '';
  document.getElementById('lf_action').value = l.action || '';
  document.getElementById('lf_next').value   = l.next   || '';
  document.getElementById('lf_by').value     = l.by     || '';
  document.getElementById('logModalOverlay').classList.add('open');
};

window.closeLogModal = function() {
  document.getElementById('logModalOverlay').classList.remove('open');
  editLogId = null;
};

window.saveLog = async function() {
  const btn  = document.getElementById('logSaveBtn');
  const data = {
    date:   gv('lf_date'),
    po:     gv('lf_po'),
    ref:    gv('lf_ref'),
    action: gv('lf_action'),
    next:   gv('lf_next'),
    by:     gv('lf_by'),
  };
  if (!data.action) { toast('Please describe the action taken.'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (editLogId) {
      await updateDoc(doc(db, "activityLog", editLogId), data);
      toast('Log entry updated.');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "activityLog"), data);
      toast('Log entry added.');
    }
    await loadLog(); renderLogTable(); closeLogModal();
  } catch(e) { toast('Error saving. Please try again.'); console.error(e); }
  finally { btn.disabled = false; btn.textContent = 'Save Entry'; }
};

// ── Delete ────────────────────────────────────────────────────────────────────
window.openConfirm = function(type, id) {
  deleteTarget = { type, id };
  document.getElementById('confirmOverlay').classList.add('open');
};
window.closeConfirm = function() {
  document.getElementById('confirmOverlay').classList.remove('open');
  deleteTarget = null;
};
window.confirmDelete = async function() {
  if (!deleteTarget) return;
  const { type, id } = deleteTarget;
  const colName = type === 'po' ? 'payOrders' : 'activityLog';
  try {
    await deleteDoc(doc(db, colName, id));
    if (type === 'po') { await loadPO(); renderAll(); }
    else               { await loadLog(); renderLogTable(); }
    toast('Entry deleted.');
  } catch(e) { toast('Error deleting.'); }
  closeConfirm();
};

// ── Tab switching ─────────────────────────────────────────────────────────────
window.switchTab = function(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-po').style.display  = tab === 'po'  ? 'block' : 'none';
  document.getElementById('tab-log').style.display = tab === 'log' ? 'block' : 'none';
};

// ── Filter ────────────────────────────────────────────────────────────────────
window.setFilter = function(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPOTable();
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function gv(id) { return document.getElementById(id).value.trim(); }
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtPKR(n) {
  if (!n) return 'Rs 0';
  return 'Rs ' + Number(n).toLocaleString('en-PK');
}
function statusBadge(s) {
  const map = { Pending:'b-pending', Submitted:'b-submitted', Returned:'b-returned', Encashed:'b-encashed', Forfeited:'b-forfeited' };
  return `<span class="badge ${map[s]||'b-pending'}">${s||'—'}</span>`;
}
function resultBadge(r) {
  const map = { Won:'b-won', Lost:'b-lost', Awaiting:'b-awaiting', Cancelled:'b-cancelled', 'N/A':'b-na' };
  return `<span class="badge ${map[r]||'b-na'}">${r||'N/A'}</span>`;
}

// ── Debounced search ─────────────────────────────────────────────────────────
function debounce(fn, delay = 250) {
  let timer;
  return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
}
const searchBox = document.getElementById('searchBox');
if (searchBox) searchBox.addEventListener('input', debounce(() => renderPOTable(), 250));

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// Close modals on overlay click
['poModalOverlay','logModalOverlay','confirmOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) {
      if (id === 'poModalOverlay')   closePOModal();
      if (id === 'logModalOverlay')  closeLogModal();
      if (id === 'confirmOverlay')   closeConfirm();
    }
  });
});

// ── Quick Return ─────────────────────────────────────────────────────────────
window.quickReturn = async function(id, event) {
  event.stopPropagation();
  const p = payOrders.find(x => x.id === id);
  if (!p) return;
  try {
    await updateDoc(doc(db, "payOrders", id), { status: 'Returned' });
    p.status = 'Returned';
    renderAll();
    toast(`PO ${p.po || id} marked as Returned.`);
  } catch(e) { console.error(e); toast('Error updating status.'); }
};

// ── Select Mode ───────────────────────────────────────────────────────────────
let selectModeActive = false;
let selectedIds = new Set();

window.toggleSelectMode = function() {
  selectModeActive ? exitSelectMode() : enterSelectMode();
};

window.enterSelectMode = function() {
  selectModeActive = true;
  selectedIds.clear();
  document.getElementById('selectModeBtn').textContent = 'Cancel';
  document.getElementById('selectModeBtn').classList.add('active');
  document.getElementById('selectionBar').classList.add('show');
  document.getElementById('selCount').textContent = '0';
  document.querySelectorAll('#poTbody tr').forEach(tr => {
    tr.classList.add('selectable');
    tr.classList.remove('row-selected');
  });
};

window.exitSelectMode = function() {
  selectModeActive = false;
  selectedIds.clear();
  document.getElementById('selectModeBtn').textContent = 'Select';
  document.getElementById('selectModeBtn').classList.remove('active');
  document.getElementById('selectionBar').classList.remove('show');
  document.querySelectorAll('#poTbody tr').forEach(tr => {
    tr.classList.remove('selectable', 'row-selected');
  });
};

window.handleRowClick = function(id, tr) {
  if (!selectModeActive) return;
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    tr.classList.remove('row-selected');
  } else {
    selectedIds.add(id);
    tr.classList.add('row-selected');
  }
  document.getElementById('selCount').textContent = selectedIds.size;
};

window.openBulkConfirm = function() {
  if (selectedIds.size === 0) return;
  const n = selectedIds.size;
  document.getElementById('bulkConfirmTitle').textContent = `Delete ${n} selected entr${n===1?'y':'ies'}?`;
  document.getElementById('bulkConfirmOverlay').classList.add('open');
};

window.closeBulkConfirm = function() {
  document.getElementById('bulkConfirmOverlay').classList.remove('open');
};

window.confirmBulkDelete = async function() {
  const ids = [...selectedIds];
  closeBulkConfirm();
  try {
    await Promise.all(ids.map(id => deleteDoc(doc(db, "payOrders", id))));
    toast(`${ids.length} entr${ids.length===1?'y':'ies'} deleted.`);
    exitSelectMode();
    await loadPO(); renderAll();
  } catch(e) { toast('Error deleting entries.'); console.error(e); }
};

document.getElementById('bulkConfirmOverlay').addEventListener('click', e => {
  if (e.target.id === 'bulkConfirmOverlay') closeBulkConfirm();
});

// ── EXPORT PAY ORDERS PDF ─────────────────────────────────────────────────────
window.exportPOPDF = function() {
  if (!payOrders.length) { toast('No pay orders to export.'); return; }

  const rows = payOrders.map(p => `
    <tr>
      <td style="padding:5px 8px;font-weight:600">${p.po||'—'}</td>
      <td style="padding:5px 8px">${p.bank||'—'}</td>
      <td style="padding:5px 8px">${p.tender||'—'}</td>
      <td style="padding:5px 8px">${p.agency||'—'}</td>
      <td style="padding:5px 8px;text-align:right">Rs ${Number(p.amount||0).toLocaleString('en-PK')}</td>
      <td style="padding:5px 8px">${p.issued||'—'}</td>
      <td style="padding:5px 8px">${p.status||'—'}</td>
      <td style="padding:5px 8px">${p.bidResult||'—'}</td>
    </tr>`).join('');

  const total     = payOrders.reduce((a,b) => a + (+b.amount||0), 0);
  const submitted = payOrders.filter(p=>p.status==='Submitted').reduce((a,b)=>a+(+b.amount||0),0);
  const returned  = payOrders.filter(p=>p.status==='Returned').reduce((a,b)=>a+(+b.amount||0),0);
  const encashed  = payOrders.filter(p=>p.status==='Encashed').reduce((a,b)=>a+(+b.amount||0),0);

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Pay Order Report — Grett Engineering</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #0f2a4a; margin: 0; padding: 24px; }
  .header { background: #0f2a4a; color: white; padding: 18px 24px; border-radius: 8px; margin-bottom: 16px; display:flex; justify-content:space-between; align-items:center; }
  .header h1 { margin: 0 0 4px; font-size: 17px; }
  .header p  { margin: 0; opacity: 0.5; font-size: 10px; }
  .summary { display: flex; gap: 10px; margin-bottom: 16px; }
  .sum-box { flex:1; background:#f4f6f9; border-radius:6px; padding:10px 12px; }
  .sum-box .lbl { font-size:9px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#6b7a90; margin-bottom:3px; }
  .sum-box .val { font-size:14px; font-weight:700; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th { background:#0f2a4a; color:white; padding:6px 8px; text-align:left; font-size:9px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; }
  tr:nth-child(even) td { background:#f8fafc; }
  td { border-bottom: 1px solid #eee; }
  .footer { margin-top:24px; text-align:center; font-size:9px; color:#6b7a90; border-top:1px solid #dce3ed; padding-top:10px; }
  @media print { body { padding:0; } }
</style></head>
<body>
<div class="header">
  <div><h1>Pay Order Report</h1><p>Grett Engineering Solutions</p></div>
  <div style="text-align:right;font-size:10px;opacity:0.6">${new Date().toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'})}</div>
</div>
<div class="summary">
  <div class="sum-box"><div class="lbl">Total Entries</div><div class="val">${payOrders.length}</div></div>
  <div class="sum-box"><div class="lbl">Total Amount</div><div class="val">Rs ${total.toLocaleString('en-PK')}</div></div>
  <div class="sum-box"><div class="lbl">At Risk (Submitted)</div><div class="val" style="color:#7a4500">Rs ${submitted.toLocaleString('en-PK')}</div></div>
  <div class="sum-box"><div class="lbl">Returned</div><div class="val" style="color:#0e6b4a">Rs ${returned.toLocaleString('en-PK')}</div></div>
  <div class="sum-box"><div class="lbl">Encashed / Lost</div><div class="val" style="color:#c0392b">Rs ${encashed.toLocaleString('en-PK')}</div></div>
</div>
<table>
  <thead><tr><th>PO Number</th><th>Bank</th><th>Tender</th><th>Agency</th><th style="text-align:right">Amount</th><th>Issued</th><th>Status</th><th>Result</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Grett Engineering Solutions &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-PK')}</div>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
};

// ── EXPORT PAY ORDERS CSV ────────────────────────────────────────────────────
window.exportPOCSV = function() {
  if (!payOrders.length) { toast('No pay orders to export.'); return; }

  const headers = ['PO Number','Bank','NIT / Ref','Tender / Project','Agency','Amount (PKR)','Date Issued','Date Submitted','Status','Bid Result','Notes'];
  const rows = payOrders.map(p => [
    p.po || '', p.bank || '', p.nit || '', p.tender || '', p.agency || '',
    p.amount || '', p.issued || '', p.submitted || '',
    p.status || '', p.bidResult || '', (p.notes || '').replace(/[\r\n]+/g, ' ')
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pay-orders-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV downloaded.');
};
