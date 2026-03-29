import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs,
  updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Auth Guard ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = "index.html"; return; }
  loadAll();
});

// ── State ─────────────────────────────────────────────────────────────────────
let payOrders  = [];
let activityLog = [];
let currentFilter = 'all';
let editPOId   = null;
let editLogId  = null;
let deleteTarget = null; // { type: 'po'|'log', id }

// ── Load all data ─────────────────────────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadPO(), loadLog()]);
  renderAll();
}

async function loadPO() {
  const q   = query(collection(db, "payOrders"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  payOrders  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadLog() {
  const q    = query(collection(db, "activityLog"), orderBy("date", "desc"));
  const snap  = await getDocs(q);
  activityLog = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
  renderCards();
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

  const today = new Date(); today.setHours(0,0,0,0);

  tbody.innerHTML = rows.map(p => {
    const daysLeft = daysTo(p.expiry);
    let daysHtml = '—';
    if (p.status === 'Returned' || p.status === 'Encashed' || p.status === 'Forfeited') {
      daysHtml = `<span class="days-closed">Closed</span>`;
    } else if (daysLeft !== null) {
      const cls = daysLeft <= 7 ? 'days-danger' : daysLeft <= 14 ? 'days-warn' : 'days-ok';
      daysHtml = `<span class="${cls}">${daysLeft}d</span>`;
    }
    return `
    <tr data-id="${p.id}" onclick="handleRowClick('${p.id}', this)">
      <td><span class="td-po">${esc(p.po||'—')}</span></td>
      <td><span class="td-muted">${esc(p.bank||'—')}</span></td>
      <td><span class="td-muted">${esc(p.nit||'—')}</span></td>
      <td><div class="td-tender">${esc(p.tender||'—')}</div></td>
      <td><span class="td-muted">${esc(p.agency||'—')}</span></td>
      <td class="num">${p.amount ? 'Rs '+Number(p.amount).toLocaleString('en-PK') : '—'}</td>
      <td class="td-date">${fmtDate(p.issued)}</td>

      <td>${statusBadge(p.status)}</td>
      <td>${resultBadge(p.bidResult)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-icon" title="Edit" onclick="openEditPO('${p.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M8 1.5l2.5 2.5L3 11H.5V8.5L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-icon del" title="Delete" onclick="openConfirm('po','${p.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
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
      <td class="td-date">${fmtDate(l.date)}</td>
      <td><span class="td-po">${esc(l.po||'—')}</span></td>
      <td><span class="td-muted">${esc(l.ref||'—')}</span></td>
      <td>${esc(l.action||'—')}</td>
      <td><span class="td-muted">${esc(l.next||'—')}</span></td>
      <td><span class="td-muted">${esc(l.by||'—')}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn-icon" title="Edit" onclick="openEditLog('${l.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M8 1.5l2.5 2.5L3 11H.5V8.5L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-icon del" title="Delete" onclick="openConfirm('log','${l.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

// ── PO Modal ──────────────────────────────────────────────────────────────────
window.openPOModal = function() {
  editPOId = null;
  document.getElementById('poModalTitle').textContent = 'New Pay Order';
  ['po','bank','nit','amount','tender','agency','issued','submitted','expiry','notes'].forEach(f => {
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
  document.getElementById('f_expiry').value    = p.expiry    || '';
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
    expiry:    gv('f_expiry'),
    status:    gv('f_status'),
    bidResult: gv('f_result'),
    notes:     gv('f_notes'),
  };
  if (!data.tender && !data.po) { toast('Enter at least a PO number or tender name.'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (editPOId) {
      await updateDoc(doc(db, "payOrders", editPOId), data);
      toast('Pay order updated.');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "payOrders"), data);
      toast('Pay order added.');
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
function daysTo(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp   = new Date(dateStr + 'T00:00:00');
  return Math.round((exp - today) / 86400000);
}
function statusBadge(s) {
  const map = { Pending:'b-pending', Submitted:'b-submitted', Returned:'b-returned', Encashed:'b-encashed', Forfeited:'b-forfeited' };
  return `<span class="badge ${map[s]||'b-pending'}">${s||'—'}</span>`;
}
function resultBadge(r) {
  const map = { Won:'b-won', Lost:'b-lost', Awaiting:'b-awaiting', Cancelled:'b-cancelled', 'N/A':'b-na' };
  return `<span class="badge ${map[r]||'b-na'}">${r||'N/A'}</span>`;
}

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
