import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, updateDoc,
  deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let templates  = [];
let deleteId   = null;
let renameId   = null;

const DEFAULT_ITEMS = [
  'Technical Bid', 'Financial Bid', 'Experience Certificates',
  'PEC Registration', 'NTN Certificate', 'Bank Statement',
  'Pay Order / Bid Security', 'Company Profile',
];

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '/'; return; }
  try {
    await loadTemplates();
    if (!templates.length) await seedDefault();
  } catch(e) {
    console.error('Failed to load templates:', e);
  }
});

async function loadTemplates() {
  try {
    const snap = await getDocs(collection(db, "checklistTemplates"));
    templates  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Failed to load checklist templates:', e);
    templates = [];
    throw e;
  }
  templates.sort((a,b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return (a.name||'').localeCompare(b.name||'');
  });
  renderTemplates();
}

async function seedDefault() {
  const data = {
    name:      'Standard (Default)',
    isDefault: true,
    items:     DEFAULT_ITEMS.map(label => ({ id: uid(), label })),
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "checklistTemplates"), data);
  templates  = [{ id: ref.id, ...data }];
  renderTemplates();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTemplates() {
  const grid = document.getElementById('templatesGrid');
  if (!templates.length) {
    grid.innerHTML = `
    <div class="templates-empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="10" y="8" width="28" height="32" rx="3" stroke="#c8d3e0" stroke-width="2"/><path d="M18 20h12M18 26h12M18 32h8" stroke="#c8d3e0" stroke-width="2" stroke-linecap="round"/></svg>
      <p>No templates yet</p>
    </div>`;
    return;
  }
  grid.innerHTML = templates.map(t => templateCardHtml(t)).join('');
}

function templateCardHtml(t) {
  const items = t.items || [];
  const itemsHtml = items.map(item => `
    <div class="template-item">
      <div class="template-item-dot"></div>
      <span>${esc(item.label)}</span>
      <button class="template-item-del" onclick="removeItem('${t.id}','${item.id}')" title="Remove">✕</button>
    </div>`).join('');

  return `
  <div class="template-card ${t.isDefault ? 'default-card' : ''}" id="tmpl-${t.id}">
    <div class="template-card-header">
      <div class="template-card-name">
        ${esc(t.name||'Unnamed')}
        ${t.isDefault ? '<span class="default-badge">Default</span>' : ''}
      </div>
      <div class="template-card-actions">
        <button class="btn-icon" title="Rename" onclick="openRename('${t.id}','${esc(t.name||'')}')">
          <svg viewBox="0 0 12 12" fill="none" width="12" height="12"><path d="M8 1.5l2.5 2.5L3 11H.5V8.5L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
        </button>
        ${!t.isDefault ? `<button class="btn-icon del" title="Delete" onclick="openTmplConfirm('${t.id}')">
          <svg viewBox="0 0 12 12" fill="none" width="12" height="12"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>` : ''}
      </div>
    </div>
    <div class="template-items-list">
      ${itemsHtml || '<div style="font-size:13px;color:var(--muted);padding:4px 0">No items yet.</div>'}
    </div>
    <div class="add-item-row">
      <input class="add-item-input" type="text" id="add-input-${t.id}" placeholder="Add checklist item…">
      <button class="btn-add-item" onclick="addItem('${t.id}')">Add</button>
    </div>
    <div class="template-footer">
      <span>${items.length} item${items.length===1?'':'s'}</span>
      ${!t.isDefault ? `<button class="set-default-btn" onclick="setDefault('${t.id}')">Set as default</button>` : '<span style="color:var(--green-fg);font-weight:600">✓ Active default</span>'}
    </div>
  </div>`;
}

// ── Add / Remove items ────────────────────────────────────────────────────────
window.addItem = async function(tmplId) {
  const input = document.getElementById(`add-input-${tmplId}`);
  const label = input.value.trim();
  if (!label) return;
  const t = templates.find(x => x.id === tmplId);
  if (!t) return;
  if (!t.items) t.items = [];
  t.items.push({ id: uid(), label });
  input.value = '';
  renderTemplates();
  await updateDoc(doc(db, "checklistTemplates", tmplId), { items: t.items });
};

window.removeItem = async function(tmplId, itemId) {
  const t = templates.find(x => x.id === tmplId);
  if (!t) return;
  t.items = (t.items||[]).filter(i => i.id !== itemId);
  renderTemplates();
  await updateDoc(doc(db, "checklistTemplates", tmplId), { items: t.items });
};

// ── New template ──────────────────────────────────────────────────────────────
window.openNewTemplateModal = function() {
  document.getElementById('tmpl_name').value = '';
  document.getElementById('newTemplateModal').classList.add('open');
  setTimeout(() => document.getElementById('tmpl_name').focus(), 100);
};
window.closeNewTemplateModal = function() {
  document.getElementById('newTemplateModal').classList.remove('open');
};
window.createTemplate = async function() {
  const name = document.getElementById('tmpl_name').value.trim();
  if (!name) { toast('Enter a template name.'); return; }
  const btn = document.getElementById('newTmplBtn');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const data = { name, isDefault: false, items: [], createdAt: serverTimestamp() };
    const ref  = await addDoc(collection(db, "checklistTemplates"), data);
    templates.push({ id: ref.id, ...data });
    closeNewTemplateModal();
    renderTemplates();
    toast('Template created.');
  } catch(e) { toast('Error creating template.'); }
  finally { btn.disabled = false; btn.textContent = 'Create'; }
};

// ── Rename ────────────────────────────────────────────────────────────────────
window.openRename = function(id, currentName) {
  renameId = id;
  document.getElementById('rename_input').value = currentName;
  document.getElementById('renameModal').classList.add('open');
  setTimeout(() => document.getElementById('rename_input').focus(), 100);
};
window.closeRenameModal = function() {
  document.getElementById('renameModal').classList.remove('open');
  renameId = null;
};
window.saveRename = async function() {
  const name = document.getElementById('rename_input').value.trim();
  if (!name || !renameId) return;
  const t = templates.find(x => x.id === renameId);
  if (!t) return;
  t.name = name;
  renderTemplates();
  await updateDoc(doc(db, "checklistTemplates", renameId), { name });
  closeRenameModal();
  toast('Renamed.');
};

// ── Set default ───────────────────────────────────────────────────────────────
window.setDefault = async function(id) {
  for (const t of templates) {
    const wasDefault = t.isDefault;
    t.isDefault = t.id === id;
    if (wasDefault !== t.isDefault) {
      await updateDoc(doc(db, "checklistTemplates", t.id), { isDefault: t.isDefault });
    }
  }
  templates.sort((a,b) => { if (a.isDefault) return -1; if (b.isDefault) return 1; return (a.name||'').localeCompare(b.name||''); });
  renderTemplates();
  toast('Default template updated.');
};

// ── Delete ────────────────────────────────────────────────────────────────────
window.openTmplConfirm = function(id) {
  deleteId = id;
  document.getElementById('tmplConfirmOverlay').classList.add('open');
};
window.closeTmplConfirm = function() {
  document.getElementById('tmplConfirmOverlay').classList.remove('open');
  deleteId = null;
};
window.confirmDeleteTemplate = async function() {
  if (!deleteId) return;
  try {
    await deleteDoc(doc(db, "checklistTemplates", deleteId));
    templates = templates.filter(t => t.id !== deleteId);
    closeTmplConfirm();
    renderTemplates();
    toast('Template deleted.');
  } catch(e) { toast('Error deleting.'); }
};

// ── Enter key ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement?.classList.contains('add-item-input')) {
    const tmplId = document.activeElement.id.replace('add-input-','');
    window.addItem(tmplId);
  }
  if (e.key === 'Enter' && document.activeElement?.id === 'tmpl_name') window.createTemplate();
  if (e.key === 'Enter' && document.activeElement?.id === 'rename_input') window.saveRename();
});

['newTemplateModal','renameModal','tmplConfirmOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) {
      if (id === 'newTemplateModal') closeNewTemplateModal();
      else if (id === 'renameModal') closeRenameModal();
      else closeTmplConfirm();
    }
  });
});

function uid() { return Math.random().toString(36).slice(2,9); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
