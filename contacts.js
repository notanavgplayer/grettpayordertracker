import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, updateDoc,
  deleteDoc, doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let contacts   = [];
let activeId   = null;
let editId     = null;
let deleteId   = null;
let catFilter  = 'all';

const CAT_CLASS = {
  'Agency Officer': 'cat-agency',
  'Consultant':     'cat-consultant',
  'Supplier':       'cat-supplier',
  'Subcontractor':  'cat-subcontractor',
  'Other':          'cat-other',
};

onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = '/'; return; }
  loadContacts();
});

async function loadContacts() {
  try {
    const q    = query(collection(db, "contacts"), orderBy("name", "asc"));
    const snap = await getDocs(q);
    contacts   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Failed to load contacts:', e);
    contacts = [];
  }
  renderContactList();
}

// ── List ──────────────────────────────────────────────────────────────────────
window.renderContactList = function() {
  const q   = (document.getElementById('contactSearch').value || '').toLowerCase();
  const filtered = contacts.filter(c => {
    const matchCat = catFilter === 'all' || c.category === catFilter;
    const matchQ   = !q || [c.name,c.organization,c.role,c.phone,c.email].some(v=>(v||'').toLowerCase().includes(q));
    return matchCat && matchQ;
  });

  const el = document.getElementById('contactList');
  if (!filtered.length) {
    el.innerHTML = '<div class="contacts-empty">No contacts found.<br>Click New Contact to add one.</div>';
    return;
  }
  el.innerHTML = filtered.map(c => {
    const initials = getInitials(c.name);
    const cls      = CAT_CLASS[c.category] || 'cat-other';
    return `
    <div class="contact-item ${c.id === activeId ? 'active' : ''}" onclick="selectContact('${c.id}')">
      <div class="contact-avatar ${cls}">${initials}</div>
      <div class="contact-info">
        <div class="contact-name">${esc(c.name||'Unnamed')}</div>
        <div class="contact-meta">${esc(c.role||'—')} · ${esc(c.organization||'—')}</div>
      </div>
    </div>`;
  }).join('');
};

window.setCatFilter = function(f, btn) {
  catFilter = f;
  document.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderContactList();
};

// ── Detail ────────────────────────────────────────────────────────────────────
window.selectContact = function(id) {
  activeId = id;
  const c  = contacts.find(x => x.id === id);
  if (!c) return;

  renderContactList();
  document.getElementById('contactPlaceholder').style.display = 'none';
  const det = document.getElementById('contactDetail');
  det.style.display = 'block';

  const cls      = CAT_CLASS[c.category] || 'cat-other';
  const initials = getInitials(c.name);

  det.innerHTML = `
    <div class="contact-card-header">
      <div class="contact-card-avatar ${cls}">${initials}</div>
      <div style="flex:1;min-width:0">
        <div class="contact-card-name">${esc(c.name||'Unnamed')}</div>
        <div class="contact-card-title">${esc(c.role||'—')} · ${esc(c.organization||'—')}</div>
        <span class="badge ${cls}" style="font-size:10px">${esc(c.category||'Other')}</span>
      </div>
      <div class="contact-card-actions">
        <button class="btn-card-action btn-edit-contact" onclick="openEditContact('${c.id}')">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 1.5l2.5 2.5L3 11H.5V8.5L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
          Edit
        </button>
        <button class="btn-card-action btn-del-contact" onclick="openContactConfirm('${c.id}')">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Delete
        </button>
      </div>
    </div>

    <div class="contact-info-grid">
      <div class="contact-info-card">
        <div class="contact-info-label">Phone</div>
        <div class="contact-info-val">${c.phone ? `<a href="tel:${c.phone}">${esc(c.phone)}</a>` : '—'}</div>
      </div>
      <div class="contact-info-card">
        <div class="contact-info-label">WhatsApp</div>
        <div class="contact-info-val">${c.whatsapp ? `<a href="https://wa.me/${c.whatsapp.replace(/\D/g,'')}" target="_blank">${esc(c.whatsapp)}</a>` : '—'}</div>
      </div>
      <div class="contact-info-card" style="grid-column:1/-1">
        <div class="contact-info-label">Email</div>
        <div class="contact-info-val">${c.email ? `<a href="mailto:${c.email}">${esc(c.email)}</a>` : '—'}</div>
      </div>
      <div class="contact-info-card" style="grid-column:1/-1">
        <div class="contact-info-label">Office Address</div>
        <div class="contact-info-val">${esc(c.address||'—')}</div>
      </div>
    </div>

    ${c.notes ? `
    <div class="contact-notes-card">
      <div class="contact-notes-title">Notes</div>
      <div class="contact-notes-body">${esc(c.notes)}</div>
    </div>` : ''}
  `;
};

// ── Modal ─────────────────────────────────────────────────────────────────────
window.openContactModal = function() {
  editId = null;
  document.getElementById('contactModalTitle').textContent = 'New Contact';
  ['cf_name','cf_role','cf_org','cf_phone','cf_whatsapp','cf_email','cf_address','cf_notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('cf_cat').value = 'Agency Officer';
  document.getElementById('contactSaveBtn').textContent = 'Save Contact';
  document.getElementById('contactModal').classList.add('open');
  setTimeout(() => document.getElementById('cf_name').focus(), 100);
};

window.openEditContact = function(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  editId = id;
  document.getElementById('contactModalTitle').textContent = 'Edit Contact';
  document.getElementById('cf_name').value     = c.name        || '';
  document.getElementById('cf_cat').value      = c.category    || 'Agency Officer';
  document.getElementById('cf_role').value     = c.role        || '';
  document.getElementById('cf_org').value      = c.organization|| '';
  document.getElementById('cf_phone').value    = c.phone       || '';
  document.getElementById('cf_whatsapp').value = c.whatsapp    || '';
  document.getElementById('cf_email').value    = c.email       || '';
  document.getElementById('cf_address').value  = c.address     || '';
  document.getElementById('cf_notes').value    = c.notes       || '';
  document.getElementById('contactSaveBtn').textContent = 'Update Contact';
  document.getElementById('contactModal').classList.add('open');
};

window.closeContactModal = function() {
  document.getElementById('contactModal').classList.remove('open');
  editId = null;
};

window.saveContact = async function() {
  const btn  = document.getElementById('contactSaveBtn');
  const name = document.getElementById('cf_name').value.trim();
  if (!name) { toast('Please enter a name.'); return; }

  const data = {
    name,
    category:     document.getElementById('cf_cat').value,
    role:         document.getElementById('cf_role').value.trim(),
    organization: document.getElementById('cf_org').value.trim(),
    phone:        document.getElementById('cf_phone').value.trim(),
    whatsapp:     document.getElementById('cf_whatsapp').value.trim(),
    email:        document.getElementById('cf_email').value.trim(),
    address:      document.getElementById('cf_address').value.trim(),
    notes:        document.getElementById('cf_notes').value.trim(),
  };

  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (editId) {
      await updateDoc(doc(db, "contacts", editId), { ...data, updatedAt: serverTimestamp() });
      const idx = contacts.findIndex(c => c.id === editId);
      if (idx > -1) contacts[idx] = { ...contacts[idx], ...data };
      contacts.sort((a,b) => (a.name||'').localeCompare(b.name||''));
      closeContactModal();
      renderContactList();
      selectContact(editId);
      toast('Contact updated.');
    } else {
      data.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, "contacts"), data);
      contacts.push({ id: ref.id, ...data });
      contacts.sort((a,b) => (a.name||'').localeCompare(b.name||''));
      closeContactModal();
      renderContactList();
      selectContact(ref.id);
      toast('Contact added.');
    }
  } catch(e) { console.error(e); toast('Error saving contact.'); }
  finally { btn.disabled = false; btn.textContent = editId ? 'Update Contact' : 'Save Contact'; }
};

// ── Delete ────────────────────────────────────────────────────────────────────
window.openContactConfirm = function(id) {
  deleteId = id;
  document.getElementById('contactConfirmOverlay').classList.add('open');
};
window.closeContactConfirm = function() {
  document.getElementById('contactConfirmOverlay').classList.remove('open');
  deleteId = null;
};
window.confirmDeleteContact = async function() {
  if (!deleteId) return;
  try {
    await deleteDoc(doc(db, "contacts", deleteId));
    contacts = contacts.filter(c => c.id !== deleteId);
    if (activeId === deleteId) {
      activeId = null;
      document.getElementById('contactDetail').style.display = 'none';
      document.getElementById('contactPlaceholder').style.display = 'flex';
    }
    closeContactConfirm();
    renderContactList();
    toast('Contact deleted.');
  } catch(e) { toast('Error deleting.'); }
};

// ── Close on overlay click ────────────────────────────────────────────────────
document.getElementById('contactModal').addEventListener('click', e => { if (e.target.id === 'contactModal') closeContactModal(); });
document.getElementById('contactConfirmOverlay').addEventListener('click', e => { if (e.target.id === 'contactConfirmOverlay') closeContactConfirm(); });

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
    : name.slice(0,2).toUpperCase();
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
