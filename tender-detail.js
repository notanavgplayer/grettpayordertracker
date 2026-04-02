import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let tender   = null;
let tenderId = null;
let notesTimer = null;

// ── Auth + Load ───────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  const params = new URLSearchParams(window.location.search);
  tenderId     = params.get('id');
  if (!tenderId) { window.location.href = 'tenders.html'; return; }
  await loadTender();
});

async function loadTender() {
  try {
    const snap = await getDoc(doc(db, "tenders", tenderId));
    if (!snap.exists()) { window.location.href = 'tenders.html'; return; }
    tender = { id: snap.id, ...snap.data() };
    document.title = `${tender.name || 'Tender'} — Grett Engineering`;
    renderAll();
    document.getElementById('detailWrap').style.display = 'block';
  } catch(e) { console.error('Load error:', e); }
}

async function persist(updates) {
  try {
    await updateDoc(doc(db, "tenders", tenderId), { ...updates, updatedAt: serverTimestamp() });
  } catch(e) { console.error('Save error:', e); toast('Error saving.'); }
}

// ── Render all ────────────────────────────────────────────────────────────────
function renderAll() {
  // Header
  document.getElementById('dTitle').value   = tender.name   || '';
  document.getElementById('dAgency').value  = tender.agency || '';
  document.getElementById('dValue').value   = tender.value  || '';
  document.getElementById('dNit').value     = tender.nit            || '';
  document.getElementById('dSubDate').value = tender.submissionDate || '';
  document.getElementById('dOpenDate').value= tender.openingDate    || '';
  document.getElementById('dPO').value      = tender.linkedPO       || '';
  document.getElementById('dStatus').value        = tender.status || 'Bidding';

  renderChecklist();
  renderBills();
  renderRABills();
  renderMilestones();
  renderVisits();
  renderContact();
  renderNotes();
  renderTExpenses();
  renderStatusHistory();
}

// ── STATUS ────────────────────────────────────────────────────────────────────
window.updateStatus = async function() {
  const newStatus = document.getElementById('dStatus').value;
  const oldStatus = tender.status;
  if (newStatus === oldStatus) return;
  tender.status = newStatus;

  // Append to status history
  if (!tender.statusHistory) tender.statusHistory = [];
  tender.statusHistory.push({
    from: oldStatus || '—',
    to:   newStatus,
    date: new Date().toISOString().split('T')[0],
    ts:   Date.now()
  });

  await persist({ status: tender.status, statusHistory: tender.statusHistory });
  renderStatusHistory();
  toast('Status updated.');
};

function renderStatusHistory() {
  const el = document.getElementById('statusHistoryList');
  if (!el) return;
  const history = (tender.statusHistory || []).slice().reverse();
  if (!history.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted)">No status changes recorded yet.</div>';
    return;
  }
  const statusClass = { Bidding:'s-bidding', Submitted:'s-submitted', Awarded:'s-awarded', Lost:'s-lost', Cancelled:'s-cancelled' };
  el.innerHTML = history.map(h => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;color:var(--muted);font-family:'IBM Plex Mono',monospace;white-space:nowrap">${fmtDate(h.date)}</span>
      <span class="badge ${statusClass[h.from]||''}" style="font-size:10px">${h.from}</span>
      <span style="color:var(--muted);font-size:11px">→</span>
      <span class="badge ${statusClass[h.to]||''}" style="font-size:10px">${h.to}</span>
    </div>`).join('');
}

// ── EDITABLE HEADER FIELDS ───────────────────────────────────────────────────
window.saveHeaderField = async function(field, inputId) {
  const val = document.getElementById(inputId).value.trim();
  tender[field] = val;
  await persist({ [field]: val });
  toast('Saved.');
};

// ── DUPLICATE TENDER ──────────────────────────────────────────────────────────
window.duplicateTender = async function() {
  if (!tender) return;
  const { addDoc, collection: col, serverTimestamp: st } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const copy = {
    name:           `${tender.name || 'Untitled'} (Copy)`,
    agency:         tender.agency         || '',
    nit:            '',
    value:          tender.value          || '',
    status:         'Bidding',
    submissionDate: '',
    openingDate:    '',
    linkedPO:       '',
    contact:        tender.contact        || '',
    contactPerson:  tender.contactPerson  || {},
    checklist:      (tender.checklist||[]).map(i => ({ ...i, done: false })),
    bills:          [],
    raBills:        [],
    milestones:     [],
    siteVisits:     [],
    notes:          tender.notes          || '',
    createdAt:      st(),
    updatedAt:      st(),
  };
  try {
    const ref = await addDoc(col(db, "tenders"), copy);
    toast('Tender duplicated! Redirecting…');
    setTimeout(() => { window.location.href = `tender-detail.html?id=${ref.id}`; }, 1000);
  } catch(e) { console.error(e); toast('Error duplicating tender.'); }
};

// ── EDITABLE INFO FIELDS ─────────────────────────────────────────────────────
window.saveInfoField = async function(field, inputId) {
  const val = document.getElementById(inputId).value.trim();
  tender[field] = val;
  await persist({ [field]: val });
  toast('Saved.');
};

// ── TAB SWITCHING ─────────────────────────────────────────────────────────────
window.switchDetailTab = function(tab, btn) {
  document.querySelectorAll('.detail-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById(`tab-${tab}`);
  if (panel) panel.classList.add('active');
};

// ── CHECKLIST ─────────────────────────────────────────────────────────────────
function renderChecklist() {
  const items = tender.checklist || [];
  const done  = items.filter(i => i.done).length;
  const pct   = items.length ? Math.round((done / items.length) * 100) : 0;

  document.getElementById('checkProgress').style.width   = pct + '%';
  document.getElementById('checkProgressLabel').textContent = `${done} / ${items.length}`;

  document.getElementById('checklistItems').innerHTML = items.map(item => `
    <div class="checklist-item">
      <div class="check-circle ${item.done ? 'done' : ''}" onclick="toggleCheck('${item.id}')"></div>
      <span class="checklist-label ${item.done ? 'done' : ''}">${esc(item.label)}</span>
      <button class="checklist-del" onclick="removeCheckItem('${item.id}')" title="Remove">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>`).join('') || '<div style="font-size:13px;color:var(--muted);padding:8px 0">No items yet — add one below.</div>';
}

window.toggleCheck = async function(id) {
  const item = (tender.checklist || []).find(i => i.id === id);
  if (!item) return;
  item.done = !item.done;
  renderChecklist();
  await persist({ checklist: tender.checklist });
};

window.removeCheckItem = async function(id) {
  tender.checklist = (tender.checklist || []).filter(i => i.id !== id);
  renderChecklist();
  await persist({ checklist: tender.checklist });
};

window.addChecklistItem = async function() {
  const input = document.getElementById('newCheckItem');
  const label = input.value.trim();
  if (!label) return;
  if (!tender.checklist) tender.checklist = [];
  tender.checklist.push({ id: uid(), label, done: false });
  input.value = '';
  renderChecklist();
  await persist({ checklist: tender.checklist });
};

document.getElementById('newCheckItem').addEventListener('keydown', e => {
  if (e.key === 'Enter') window.addChecklistItem();
});

// ── BILLS ─────────────────────────────────────────────────────────────────────
function renderBills() {
  const bills = tender.bills || [];
  const total = bills.reduce((a,b) => a + (+b.amount||0), 0);
  const el    = document.getElementById('billsContent');

  if (!bills.length) {
    el.innerHTML = '<div class="bills-empty">No bills yet. Add your first bill.</div>';
    return;
  }
  el.innerHTML = `
    <table class="bills-table">
      <thead><tr>
        <th>Description</th><th>Date</th><th style="text-align:right">Amount (PKR)</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>
        ${bills.map(b => `
          <tr>
            <td>${esc(b.desc||'—')}</td>
            <td style="color:var(--muted);font-size:12px">${fmtDate(b.date)}</td>
            <td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:500">Rs ${Number(b.amount||0).toLocaleString('en-PK')}</td>
            <td><span class="badge ${b.status==='Paid'?'b-returned':'b-pending'}">${b.status}</span></td>
            <td><button class="btn-icon del" style="width:26px;height:26px" onclick="removeBill('${b.id}')">
              <svg viewBox="0 0 12 12" fill="none" width="11" height="11"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button></td>
          </tr>`).join('')}
        <tr style="border-top:2px solid var(--border)">
          <td colspan="2" style="font-weight:600;color:var(--navy)">Total</td>
          <td style="text-align:right;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--navy)">Rs ${total.toLocaleString('en-PK')}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>`;
}

window.openBillModal  = () => { clearBillForm(); document.getElementById('billModal').classList.add('open'); };
window.closeBillModal = () => document.getElementById('billModal').classList.remove('open');
function clearBillForm() {
  ['b_desc','b_amount','b_date'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('b_status').value = 'Pending';
}

window.saveBill = async function() {
  const desc   = document.getElementById('b_desc').value.trim();
  const amount = document.getElementById('b_amount').value;
  if (!desc) { toast('Enter a description.'); return; }
  if (!tender.bills) tender.bills = [];
  tender.bills.push({
    id: uid(), desc, amount,
    date:   document.getElementById('b_date').value,
    status: document.getElementById('b_status').value,
  });
  renderBills();
  closeBillModal();
  await persist({ bills: tender.bills });
  toast('Bill added.');
};

window.removeBill = async function(id) {
  tender.bills = (tender.bills||[]).filter(b => b.id !== id);
  renderBills(); await persist({ bills: tender.bills });
};

// ── RA BILLS ──────────────────────────────────────────────────────────────────
function renderRABills() {
  const bills = tender.raBills || [];
  const total = bills.reduce((a,b) => a + (+b.amount||0), 0);
  const paid  = bills.filter(b => b.status==='Paid').reduce((a,b) => a + (+b.amount||0), 0);
  const el    = document.getElementById('raBillsContent');

  if (!bills.length) {
    el.innerHTML = '<div class="bills-empty">No RA Bills yet.</div>';
    return;
  }

  const raBadge = { 'Submitted':'b-submitted', 'Under Review':'b-pending', 'Paid':'b-returned', 'Rejected':'b-encashed' };
  el.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:1rem">
      <div class="info-card" style="flex:1"><div class="info-card-label">Total Billed</div><div class="info-card-val">Rs ${total.toLocaleString('en-PK')}</div></div>
      <div class="info-card" style="flex:1"><div class="info-card-label">Total Received</div><div class="info-card-val" style="color:var(--green-fg)">Rs ${paid.toLocaleString('en-PK')}</div></div>
      <div class="info-card" style="flex:1"><div class="info-card-label">Outstanding</div><div class="info-card-val" style="color:var(--amber-fg)">Rs ${(total-paid).toLocaleString('en-PK')}</div></div>
    </div>
    <table class="bills-table">
      <thead><tr><th>Bill No.</th><th>Submitted</th><th>Paid Date</th><th style="text-align:right">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${bills.map(b => `
          <tr>
            <td style="font-weight:600;color:var(--navy2)">${esc(b.no||'—')}</td>
            <td style="color:var(--muted);font-size:12px">${fmtDate(b.submitted)}</td>
            <td style="color:var(--muted);font-size:12px">${fmtDate(b.paid)||'—'}</td>
            <td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:500">Rs ${Number(b.amount||0).toLocaleString('en-PK')}</td>
            <td><span class="badge ${raBadge[b.status]||'b-pending'}">${b.status}</span></td>
            <td><button class="btn-icon del" style="width:26px;height:26px" onclick="removeRABill('${b.id}')">
              <svg viewBox="0 0 12 12" fill="none" width="11" height="11"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

window.openRAModal  = () => { ['ra_no','ra_amount','ra_submitted','ra_paid'].forEach(id => document.getElementById(id).value=''); document.getElementById('ra_status').value='Submitted'; document.getElementById('raModal').classList.add('open'); };
window.closeRAModal = () => document.getElementById('raModal').classList.remove('open');

window.saveRABill = async function() {
  const no = document.getElementById('ra_no').value.trim();
  if (!no) { toast('Enter a bill number.'); return; }
  if (!tender.raBills) tender.raBills = [];
  tender.raBills.push({
    id: uid(), no,
    amount:    document.getElementById('ra_amount').value,
    submitted: document.getElementById('ra_submitted').value,
    paid:      document.getElementById('ra_paid').value,
    status:    document.getElementById('ra_status').value,
  });
  renderRABills(); closeRAModal();
  await persist({ raBills: tender.raBills });
  toast('RA Bill added.');
};

window.removeRABill = async function(id) {
  tender.raBills = (tender.raBills||[]).filter(b => b.id !== id);
  renderRABills(); await persist({ raBills: tender.raBills });
};

// ── MILESTONES ────────────────────────────────────────────────────────────────
function renderMilestones() {
  const items = tender.milestones || [];
  const el    = document.getElementById('milestonesContent');
  if (!items.length) { el.innerHTML = '<div class="bills-empty">No milestones yet.</div>'; return; }
  el.innerHTML = items.map(m => `
    <div class="milestone-item">
      <div class="milestone-dot ${m.done?'done':''}" onclick="toggleMilestone('${m.id}')"></div>
      <div class="milestone-body">
        <div class="milestone-title ${m.done?'done':''}">${esc(m.title)}</div>
        ${m.date ? `<div class="milestone-date">Target: ${fmtDate(m.date)}</div>` : ''}
      </div>
      <button class="milestone-del" onclick="removeMilestone('${m.id}')">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>`).join('');
}

window.openMilestoneModal  = () => { document.getElementById('m_title').value=''; document.getElementById('m_date').value=''; document.getElementById('milestoneModal').classList.add('open'); };
window.closeMilestoneModal = () => document.getElementById('milestoneModal').classList.remove('open');

window.saveMilestone = async function() {
  const title = document.getElementById('m_title').value.trim();
  if (!title) { toast('Enter a milestone title.'); return; }
  if (!tender.milestones) tender.milestones = [];
  tender.milestones.push({ id: uid(), title, date: document.getElementById('m_date').value, done: false });
  renderMilestones(); closeMilestoneModal();
  await persist({ milestones: tender.milestones });
  toast('Milestone added.');
};

window.toggleMilestone = async function(id) {
  const m = (tender.milestones||[]).find(x => x.id === id);
  if (!m) return;
  m.done = !m.done;
  renderMilestones();
  await persist({ milestones: tender.milestones });
};

window.removeMilestone = async function(id) {
  tender.milestones = (tender.milestones||[]).filter(m => m.id !== id);
  renderMilestones(); await persist({ milestones: tender.milestones });
};

// ── SITE VISITS ───────────────────────────────────────────────────────────────
function renderVisits() {
  const visits = tender.siteVisits || [];
  const el     = document.getElementById('visitsContent');
  if (!visits.length) { el.innerHTML = '<div class="bills-empty">No site visits recorded yet.</div>'; return; }
  el.innerHTML = visits.map(v => `
    <div class="visit-item">
      <div class="visit-header">
        <span class="visit-date">${fmtDate(v.date)}</span>
        <button class="visit-del" onclick="removeVisit('${v.id}')">&#x2715;</button>
      </div>
      <div class="visit-body">${esc(v.notes)}</div>
    </div>`).join('');
}

window.openVisitModal  = () => { document.getElementById('v_date').value=new Date().toISOString().split('T')[0]; document.getElementById('v_notes').value=''; document.getElementById('visitModal').classList.add('open'); };
window.closeVisitModal = () => document.getElementById('visitModal').classList.remove('open');

window.saveVisit = async function() {
  const notes = document.getElementById('v_notes').value.trim();
  if (!notes) { toast('Enter some notes for this visit.'); return; }
  if (!tender.siteVisits) tender.siteVisits = [];
  tender.siteVisits.unshift({ id: uid(), date: document.getElementById('v_date').value, notes });
  renderVisits(); closeVisitModal();
  await persist({ siteVisits: tender.siteVisits });
  toast('Site visit added.');
};

window.removeVisit = async function(id) {
  tender.siteVisits = (tender.siteVisits||[]).filter(v => v.id !== id);
  renderVisits(); await persist({ siteVisits: tender.siteVisits });
};

// ── CONTACT ───────────────────────────────────────────────────────────────────
function renderContact() {
  const c = tender.contactPerson || {};
  document.getElementById('c_name').value        = c.name        || '';
  document.getElementById('c_designation').value = c.designation || '';
  document.getElementById('c_phone').value       = c.phone       || '';
  document.getElementById('c_email').value       = c.email       || '';
  document.getElementById('c_address').value     = c.address     || '';
  document.getElementById('c_notes').value       = c.notes       || '';
}

window.saveContact = async function() {
  tender.contactPerson = {
    name:        document.getElementById('c_name').value.trim(),
    designation: document.getElementById('c_designation').value.trim(),
    phone:       document.getElementById('c_phone').value.trim(),
    email:       document.getElementById('c_email').value.trim(),
    address:     document.getElementById('c_address').value.trim(),
    notes:       document.getElementById('c_notes').value.trim(),
  };
  await persist({ contactPerson: tender.contactPerson });
  toast('Contact saved.');
};

// ── NOTES ─────────────────────────────────────────────────────────────────────
function renderNotes() {
  document.getElementById('tenderNotes').value = tender.notes || '';
}

document.getElementById('tenderNotes').addEventListener('input', () => {
  const st = document.getElementById('notesSaveStatus');
  st.textContent = 'Saving…'; st.className = 'notes-save-status saving';
  clearTimeout(notesTimer);
  notesTimer = setTimeout(async () => {
    tender.notes = document.getElementById('tenderNotes').value;
    await persist({ notes: tender.notes });
    st.textContent = 'Saved'; st.className = 'notes-save-status saved';
  }, 800);
});

// ── Close modals on overlay click ─────────────────────────────────────────────
['billModal','raModal','milestoneModal','visitModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) document.getElementById(id).classList.remove('open');
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function uid() { return Math.random().toString(36).slice(2,9); }

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── EXPORT PDF ────────────────────────────────────────────────────────────────
window.exportTenderPDF = function() {
  const t = tender;
  if (!t) return;

  const fmtPKR = v => v ? 'Rs ' + Number(v).toLocaleString('en-PK') : '—';
  const checklist = (t.checklist||[]).map(i =>
    `<tr><td style="padding:4px 8px">${i.label}</td><td style="padding:4px 8px;text-align:center">${i.done ? '✓' : '○'}</td></tr>`).join('');
  const bills = (t.bills||[]).map(b =>
    `<tr><td style="padding:4px 8px">${b.desc||'—'}</td><td style="padding:4px 8px">${fmtDate(b.date)}</td><td style="padding:4px 8px;text-align:right">${fmtPKR(b.amount)}</td><td style="padding:4px 8px">${b.status}</td></tr>`).join('');
  const raBills = (t.raBills||[]).map(b =>
    `<tr><td style="padding:4px 8px">${b.no||'—'}</td><td style="padding:4px 8px">${fmtDate(b.submitted)}</td><td style="padding:4px 8px;text-align:right">${fmtPKR(b.amount)}</td><td style="padding:4px 8px">${b.status}</td></tr>`).join('');
  const milestones = (t.milestones||[]).map(m =>
    `<tr><td style="padding:4px 8px">${m.title}</td><td style="padding:4px 8px">${fmtDate(m.date)}</td><td style="padding:4px 8px;text-align:center">${m.done?'✓':'○'}</td></tr>`).join('');
  const c = t.contactPerson || {};

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Tender Summary — ${t.name||'Untitled'}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #0f2a4a; margin: 0; padding: 24px; }
  .header { background: #0f2a4a; color: white; padding: 20px 24px; border-radius: 8px; margin-bottom: 20px; }
  .header h1 { margin: 0 0 4px; font-size: 18px; }
  .header p  { margin: 0; opacity: 0.6; font-size: 11px; }
  .header-right { float: right; text-align: right; }
  .header-right .val { font-size: 20px; font-weight: 700; color: #e8940a; }
  .info-row { display: flex; gap: 12px; margin-bottom: 16px; }
  .info-box { flex: 1; background: #f4f6f9; border-radius: 6px; padding: 10px 12px; }
  .info-box .lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7a90; margin-bottom: 4px; }
  .info-box .val { font-size: 13px; font-weight: 600; }
  h3 { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7a90; border-bottom: 1px solid #dce3ed; padding-bottom: 6px; margin: 20px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #0f2a4a; color: white; padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #e6f1fb; color: #185fa5; }
  .notes { background: #f4f6f9; border-radius: 6px; padding: 12px; line-height: 1.7; white-space: pre-wrap; min-height: 40px; }
  .footer { margin-top: 32px; text-align: center; font-size: 10px; color: #6b7a90; border-top: 1px solid #dce3ed; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style></head>
<body>
<div class="header">
  <div class="header-right">
    <div style="font-size:10px;opacity:0.5;margin-bottom:2px">TENDER VALUE</div>
    <div class="val">${fmtPKR(t.value)}</div>
    <div style="margin-top:6px"><span class="badge" style="background:rgba(255,255,255,0.15);color:white">${t.status||'—'}</span></div>
  </div>
  <h1>${t.name||'Untitled Tender'}</h1>
  <p>${t.agency||'—'} ${t.nit ? '· ' + t.nit : ''}</p>
</div>

<div class="info-row">
  <div class="info-box"><div class="lbl">Submission Date</div><div class="val">${fmtDate(t.submissionDate)}</div></div>
  <div class="info-box"><div class="lbl">Opening Date</div><div class="val">${fmtDate(t.openingDate)}</div></div>
  <div class="info-box"><div class="lbl">Linked Pay Order</div><div class="val">${t.linkedPO||'—'}</div></div>
  <div class="info-box"><div class="lbl">Exported On</div><div class="val">${new Date().toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})}</div></div>
</div>

${checklist ? `<h3>Document Checklist</h3>
<table><thead><tr><th>Item</th><th style="width:60px;text-align:center">Done</th></tr></thead><tbody>${checklist}</tbody></table>` : ''}

${bills ? `<h3>Bills & Invoices</h3>
<table><thead><tr><th>Description</th><th>Date</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>${bills}</tbody></table>` : ''}

${raBills ? `<h3>RA Bills</h3>
<table><thead><tr><th>Bill No.</th><th>Submitted</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>${raBills}</tbody></table>` : ''}

${milestones ? `<h3>Milestones</h3>
<table><thead><tr><th>Title</th><th>Target Date</th><th style="width:60px;text-align:center">Done</th></tr></thead><tbody>${milestones}</tbody></table>` : ''}

${(c.name||c.phone) ? `<h3>Contact Person</h3>
<div class="info-row" style="flex-wrap:wrap">
  ${c.name ? `<div class="info-box"><div class="lbl">Name</div><div class="val">${c.name}</div></div>` : ''}
  ${c.designation ? `<div class="info-box"><div class="lbl">Designation</div><div class="val">${c.designation}</div></div>` : ''}
  ${c.phone ? `<div class="info-box"><div class="lbl">Phone</div><div class="val">${c.phone}</div></div>` : ''}
  ${c.email ? `<div class="info-box"><div class="lbl">Email</div><div class="val">${c.email}</div></div>` : ''}
</div>` : ''}

${t.notes ? `<h3>Notes</h3><div class="notes">${t.notes}</div>` : ''}

<div class="footer">Grett Engineering Solutions &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-PK')}</div>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
};

// ── TENDER EXPENSES ───────────────────────────────────────────────────────────
const CAT_COLORS_TD = {
  'Fuel / Transport':'#e8940a','Printing & Documentation':'#185fa5',
  'Courier / Postage':'#5d3fa5','Site Visit Costs':'#0e6b4a',
  'Tender Fees':'#7a4500','Office Supplies':'#6b7a90',
  'Labour / Daily Wages':'#c0392b','Equipment & Tools':'#1a56b0',
  'Food & Entertainment':'#9d174d','Miscellaneous':'#6b7a90',
};

function renderTExpenses() {
  const expenses = tender.expenses || [];
  const el       = document.getElementById('texpContent');
  if (!el) return;

  if (!expenses.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px 0;text-align:center">No expenses logged for this tender yet.</div>';
    return;
  }

  const total = expenses.reduce((a,b) => a+(+b.amount||0), 0);
  el.innerHTML = `
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--navy)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.8)">Description</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.8)">Category</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.8)">Date</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.8)">Amount (PKR)</th>
          <th style="padding:8px 12px"></th>
        </tr>
      </thead>
      <tbody>
        ${expenses.map(e => {
          const col = CAT_COLORS_TD[e.category] || '#6b7a90';
          return `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:9px 12px;font-weight:500;color:var(--navy)">${esc(e.description||'—')}</td>
            <td style="padding:9px 12px">
              <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:${col}20;color:${col}">${esc(e.category||'—')}</span>
            </td>
            <td style="padding:9px 12px;font-size:12px;color:var(--muted)">${fmtDate(e.date)}</td>
            <td style="padding:9px 12px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:600">Rs ${Number(e.amount||0).toLocaleString('en-PK')}</td>
            <td style="padding:9px 12px">
              <button class="btn-icon del" style="width:26px;height:26px" onclick="removeTExp('${e.id}')">
                <svg viewBox="0 0 12 12" fill="none" width="11" height="11"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </td>
          </tr>`;
        }).join('')}
        <tr style="border-top:2px solid var(--border)">
          <td colspan="3" style="padding:9px 12px;font-weight:600;color:var(--navy)">Total</td>
          <td style="padding:9px 12px;text-align:right;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--navy)">Rs ${total.toLocaleString('en-PK')}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

window.openTExpModal = function() {
  document.getElementById('tx_desc').value   = '';
  document.getElementById('tx_amount').value = '';
  document.getElementById('tx_note').value   = '';
  document.getElementById('tx_cat').value    = 'Fuel / Transport';
  document.getElementById('tx_date').value   = new Date().toISOString().split('T')[0];
  document.getElementById('texpModal').classList.add('open');
  setTimeout(() => document.getElementById('tx_desc').focus(), 100);
};

window.closeTExpModal = function() {
  document.getElementById('texpModal').classList.remove('open');
};

window.saveTExp = async function() {
  const desc   = document.getElementById('tx_desc').value.trim();
  const amount = document.getElementById('tx_amount').value;
  if (!desc)   { toast('Enter a description.'); return; }
  if (!amount) { toast('Enter an amount.'); return; }

  if (!tender.expenses) tender.expenses = [];
  const entry = {
    id:          uid(),
    description: desc,
    category:    document.getElementById('tx_cat').value,
    amount,
    date:        document.getElementById('tx_date').value,
    note:        document.getElementById('tx_note').value.trim(),
  };
  tender.expenses.push(entry);
  renderTExpenses();
  renderStatusHistory();
  closeTExpModal();
  await persist({ expenses: tender.expenses });
  toast('Expense added.');
};

window.removeTExp = async function(id) {
  tender.expenses = (tender.expenses||[]).filter(e => e.id !== id);
  renderTExpenses();
  renderStatusHistory();
  await persist({ expenses: tender.expenses });
  toast('Expense removed.');
};

// Safe overlay close
const _texpOverlay = document.getElementById('texpModal');
if (_texpOverlay) {
  _texpOverlay.addEventListener('click', e => {
    if (e.target.id === 'texpModal') closeTExpModal();
  });
}
