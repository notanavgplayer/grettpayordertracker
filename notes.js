import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, updateDoc,
  deleteDoc, doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let notes     = [];
let activeId  = null;
let saveTimer = null;

// ── Auth ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = 'index.html'; return; }
  loadNotes();
});

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadNotes() {
  const q    = query(collection(db, "notes"), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList();
}

// ── Render list ───────────────────────────────────────────────────────────────
function renderList() {
  const q    = (document.getElementById('notesSearch').value || '').toLowerCase();
  const list = notes.filter(n =>
    !q || (n.title||'').toLowerCase().includes(q) || (n.body||'').toLowerCase().includes(q)
  );
  const el = document.getElementById('notesList');
  if (!list.length) {
    el.innerHTML = `<div class="notes-empty-list">No notes yet.<br>Hit + to create one.</div>`;
    return;
  }
  el.innerHTML = list.map(n => `
    <div class="note-item ${n.id === activeId ? 'active' : ''}" onclick="openNote('${n.id}')">
      <div class="note-item-title">${esc(n.title) || 'Untitled'}</div>
      <div class="note-item-preview">${esc((n.body || '').split('\n')[0]) || 'No content'}</div>
      <div class="note-item-date">${fmtDate(n.updatedAt)}</div>
    </div>`).join('');
}

// ── New note ──────────────────────────────────────────────────────────────────
window.newNote = async function() {
  const ref = await addDoc(collection(db, "notes"), {
    title: '', body: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  notes.unshift({ id: ref.id, title: '', body: '', updatedAt: null });
  renderList();
  openNote(ref.id);
};

// ── Open note ─────────────────────────────────────────────────────────────────
window.openNote = function(id) {
  activeId = id;
  const n  = notes.find(x => x.id === id);
  if (!n) return;

  document.getElementById('editorPlaceholder').style.display = 'none';
  const ec = document.getElementById('editorContent');
  ec.style.display    = 'flex';
  ec.style.flexDirection = 'column';
  ec.style.flex       = '1';
  ec.style.overflow   = 'hidden';

  document.getElementById('noteTitle').value = n.title || '';
  document.getElementById('noteBody').value  = n.body  || '';
  document.getElementById('editorDate').textContent = fmtDate(n.updatedAt);
  setSaveStatus('idle');

  renderList();
  document.getElementById('noteTitle').focus();
};

// ── Auto-save ─────────────────────────────────────────────────────────────────
function scheduleSave() {
  setSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveActive, 800);
}

async function saveActive() {
  if (!activeId) return;
  const title = document.getElementById('noteTitle').value;
  const body  = document.getElementById('noteBody').value;
  const idx   = notes.findIndex(x => x.id === activeId);
  if (idx > -1) {
    notes[idx].title = title;
    notes[idx].body  = body;
    notes[idx].updatedAt = { seconds: Date.now() / 1000 };
  }
  try {
    await updateDoc(doc(db, "notes", activeId), { title, body, updatedAt: serverTimestamp() });
    setSaveStatus('saved');
    document.getElementById('editorDate').textContent = 'Just now';
    // Move updated note to top
    const updated = notes.splice(idx, 1)[0];
    notes.unshift(updated);
    renderList();
  } catch(e) {
    console.error('Save error:', e);
    setSaveStatus('idle');
  }
}

function setSaveStatus(state) {
  const el = document.getElementById('saveIndicator');
  if (!el) return;
  el.className = 'save-indicator';
  if (state === 'saving') { el.textContent = 'Saving…'; el.classList.add('saving'); }
  else if (state === 'saved') { el.textContent = 'Saved'; el.classList.add('saved'); }
  else { el.textContent = 'Auto-saved'; }
}

document.getElementById('noteTitle').addEventListener('input', scheduleSave);
document.getElementById('noteBody').addEventListener('input', scheduleSave);

// ── Delete note ───────────────────────────────────────────────────────────────
window.deleteNote = function() {
  if (!activeId) return;
  document.getElementById('noteConfirmOverlay').classList.add('open');
};

window.closeNoteConfirm = function() {
  document.getElementById('noteConfirmOverlay').classList.remove('open');
};

window.confirmDeleteNote = async function() {
  if (!activeId) return;
  try {
    await deleteDoc(doc(db, "notes", activeId));
    notes = notes.filter(x => x.id !== activeId);
    activeId = null;
    document.getElementById('editorContent').style.display = 'none';
    document.getElementById('editorPlaceholder').style.display = 'flex';
    closeNoteConfirm();
    renderList();
    toast('Note deleted.');
  } catch(e) {
    console.error('Delete error:', e);
    toast('Error deleting note.');
  }
};

window.filterNotes = renderList;

document.getElementById('noteConfirmOverlay').addEventListener('click', e => {
  if (e.target.id === 'noteConfirmOverlay') closeNoteConfirm();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
