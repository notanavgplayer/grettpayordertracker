import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let tenders       = [];
let tmplList      = [];
let activeId      = null;
let currentFilter = 'all';
let selectMode    = false;
let selectedTenderIds = new Set();

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  try {
    await Promise.all([loadTenders(), loadTemplates()]);
  } catch(e) {
    console.error('Failed to load tenders data:', e);
    toast('Error loading data. Please refresh the page.');
  }
});

async function loadTenders() {
  try {
    const q    = query(collection(db, "tenders"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    tenders    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Failed to load tenders:', e);
    tenders = [];
  }
  renderTenderList();
}

async function loadTemplates() {
  try {
    const snap = await getDocs(collection(db, "checklistTemplates"));
    tmplList   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Failed to load templates:', e);
    tmplList = [];
  }
  populateTemplateDropdown();
}

function populateTemplateDropdown() {
  const sel = document.getElementById('tf_template');
  if (!sel) return;
  const def = tmplList.find(t => t.isDefault);
  sel.innerHTML = '<option value="">— None (empty checklist) —</option>' +
    tmplList.map(t => `<option value="${t.id}" ${t.isDefault?'selected':''}>${esc(t.name)}</option>`).join('');
}

window.renderTenderList = function() {
  const q      = (document.getElementById('tenderSearch').value || '').toLowerCase();
  const filtered = tenders.filter(t => {
    const matchF = currentFilter === 'all' || t.status === currentFilter;
    const matchS = !q || (t.name||'').toLowerCase().includes(q) || (t.agency||'').toLowerCase().includes(q) || (t.nit||'').toLowerCase().includes(q);
    return matchF && matchS;
  });

  const el = document.getElementById('tenderList');
  if (!filtered.length) {
    el.innerHTML = `<div class="tenders-empty">No tenders found.<br>Click New Tender to add one.</div>`;
    return;
  }

  el.innerHTML = filtered.map(t => {
    const selClass = selectMode ? 'selectable' : '';
    const selActive = selectedTenderIds.has(t.id) ? 'selected' : '';
    const activeClass = t.id === activeId ? 'active' : '';
    return `
    <div class="tender-item ${activeClass} ${selClass} ${selActive}" onclick="${selectMode ? `toggleTenderSel('${t.id}')` : `selectTender('${t.id}')`}">
      <div class="tender-item-top">
        <div class="tender-item-name">${esc(t.name || 'Untitled Tender')}</div>
        <span class="badge ${statusClass(t.status)}" style="flex-shrink:0;font-size:10px">${t.status || '—'}</span>
      </div>
      <div class="tender-item-agency">${esc(t.agency || '—')} ${t.nit ? '· ' + esc(t.nit) : ''}</div>
      <div class="tender-item-bottom">
        <span class="tender-item-value">${t.value ? 'Rs ' + Number(t.value).toLocaleString('en-PK') : '—'}</span>
        <span class="tender-item-date">${fmtDate(t.submissionDate)}</span>
      </div>
    </div>`;
  }).join('');
};

window.selectTender = function(id) {
  activeId = id;
  const t  = tenders.find(x => x.id === id);
  if (!t) return;

  renderTenderList();

  document.getElementById('previewPlaceholder').style.display = 'none';
  const pc = document.getElementById('previewContent');
  pc.style.display = 'flex';

  document.getElementById('pvStatus').textContent  = t.status || '—';
  document.getElementById('pvStatus').className    = `badge ${statusClass(t.status)}`;
  document.getElementById('pvName').textContent    = t.name   || 'Untitled';
  document.getElementById('pvAgency').textContent  = t.agency || '—';
  document.getElementById('pvValue').textContent   = t.value ? 'Rs ' + Number(t.value).toLocaleString('en-PK') : '—';
  document.getElementById('pvNit').textContent     = t.nit    || '—';
  document.getElementById('pvSubDate').textContent = fmtDate(t.submissionDate);
  document.getElementById('pvPO').textContent      = t.linkedPO || '—';
  document.getElementById('pvContact').textContent = t.contact  || '—';

  // Checklist preview
  const checklist = t.checklist || [];
  document.getElementById('pvChecklist').innerHTML = checklist.length
    ? checklist.slice(0, 6).map(c => `
        <div class="preview-check-item">
          <div class="mini-check ${c.done ? 'done' : ''}"></div>
          <span style="${c.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(c.label)}</span>
        </div>`).join('')
    : '<span style="font-size:12px;color:var(--muted)">No checklist items yet</span>';

  document.getElementById('pvOpenBtn').onclick = () => {
    window.location.href = `tender-detail.html?id=${id}`;
  };
};

window.setTFilter = function(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.t-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTenderList();
};

// ── Add Tender Modal ──────────────────────────────────────────────────────────
window.openAddModal = function() {
  ['tf_name','tf_nit','tf_agency','tf_value','tf_subdate','tf_opendate','tf_po','tf_contact'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('tf_status').value = 'Bidding';
  document.getElementById('addTenderOverlay').classList.add('open');
};

window.closeAddModal = function() {
  document.getElementById('addTenderOverlay').classList.remove('open');
};

window.saveTender = async function() {
  const btn  = document.getElementById('addTenderBtn');
  const name = document.getElementById('tf_name').value.trim();
  if (!name) { toast('Please enter a tender name.'); return; }

  const data = {
    name,
    nit:            document.getElementById('tf_nit').value.trim(),
    agency:         document.getElementById('tf_agency').value.trim(),
    value:          document.getElementById('tf_value').value,
    status:         document.getElementById('tf_status').value,
    submissionDate: document.getElementById('tf_subdate').value,
    openingDate:    document.getElementById('tf_opendate').value,
    linkedPO:       document.getElementById('tf_po').value.trim(),
    contact:        document.getElementById('tf_contact').value.trim(),
    checklist:      getChecklistForTemplate(document.getElementById('tf_template')?.value),
    bills:          [],
    raBills:        [],
    milestones:     [],
    siteVisits:     [],
    notes:          '',
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
  };

  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const ref = await addDoc(collection(db, "tenders"), data);
    data.id   = ref.id;
    tenders.unshift(data);
    closeAddModal();
    renderTenderList();
    selectTender(ref.id);
    toast('Tender created. Click "Open Full Page" to add details.');
  } catch(e) {
    console.error(e); toast('Error creating tender.');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Tender';
  }
};

function getChecklistForTemplate(tmplId) {
  if (!tmplId) {
    // fallback: use default template if set
    const def = tmplList.find(t => t.isDefault);
    if (def) return (def.items||[]).map(i => ({ id: uid(), label: i.label, done: false }));
    return [];
  }
  const tmpl = tmplList.find(t => t.id === tmplId);
  if (!tmpl) return [];
  return (tmpl.items||[]).map(i => ({ id: uid(), label: i.label, done: false }));
}

document.getElementById('addTenderOverlay').addEventListener('click', e => {
  if (e.target.id === 'addTenderOverlay') closeAddModal();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusClass(s) {
  const m = { Bidding:'s-bidding', Submitted:'s-submitted', Awarded:'s-awarded', Lost:'s-lost', Cancelled:'s-cancelled' };
  return m[s] || 's-bidding';
}
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Select Mode & Bulk Actions ───────────────────────────────────────────────
window.toggleTenderSelect = function() {
  selectMode = !selectMode;
  selectedTenderIds.clear();
  document.getElementById('tenderSelectBtn').classList.toggle('active', selectMode);
  document.getElementById('tenderBulkBar').classList.toggle('show', false);
  document.getElementById('tBulkCount').textContent = '0';
  document.getElementById('tBulkStatus').value = '';
  renderTenderList();
};

window.toggleTenderSel = function(id) {
  if (selectedTenderIds.has(id)) {
    selectedTenderIds.delete(id);
  } else {
    selectedTenderIds.add(id);
  }
  document.getElementById('tBulkCount').textContent = selectedTenderIds.size;
  document.getElementById('tenderBulkBar').classList.toggle('show', selectedTenderIds.size > 0);
  renderTenderList();
};

window.applyBulkStatus = async function() {
  const newStatus = document.getElementById('tBulkStatus').value;
  if (!newStatus) { toast('Select a status first.'); return; }
  if (!selectedTenderIds.size) return;

  const ids = [...selectedTenderIds];
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.update(doc(db, "tenders", id), { status: newStatus, updatedAt: serverTimestamp() });
    });
    await batch.commit();
    ids.forEach(id => {
      const t = tenders.find(x => x.id === id);
      if (t) t.status = newStatus;
    });
    toast(`${ids.length} tender${ids.length>1?'s':''} updated to ${newStatus}.`);
    toggleTenderSelect();
  } catch(e) {
    console.error('Bulk status error:', e);
    toast('Error updating tenders.');
  }
};

window.bulkDeleteTenders = async function() {
  if (!selectedTenderIds.size) return;
  const count = selectedTenderIds.size;
  if (!confirm(`Delete ${count} tender${count>1?'s':''}? This cannot be undone.`)) return;

  const ids = [...selectedTenderIds];
  try {
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, "tenders", id)));
    await batch.commit();
    tenders = tenders.filter(t => !ids.includes(t.id));
    toast(`${count} tender${count>1?'s':''} deleted.`);
    toggleTenderSelect();
  } catch(e) {
    console.error('Bulk delete error:', e);
    toast('Error deleting tenders.');
  }
};
