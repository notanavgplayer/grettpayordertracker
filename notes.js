import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, updateDoc,
  deleteDoc, doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let notes           = [];
let activeId        = null;
let saveTimer       = null;
let pendingDeleteId = null;

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
    !q || (n.title||'').toLowerCase().includes(q) || stripHtml(n.body||'').toLowerCase().includes(q)
  );
  const el = document.getElementById('notesList');
  if (!list.length) {
    el.innerHTML = `<div class="notes-empty-list">No notes yet.<br>Hit + to create one.</div>`;
    return;
  }
  el.innerHTML = list.map(n => {
    const p = n.priority || 'none';
    const dot = p !== 'none' ? `<span class="priority-dot ${p}"></span>` : '';
    return `
    <div class="note-item ${n.id === activeId ? 'active' : ''}" onclick="openNote('${n.id}')">
      <div class="note-item-top">
        ${dot}
        <div class="note-item-title">${esc(n.title) || 'Untitled'}</div>
      </div>
      <div class="note-item-preview">${esc(stripHtml(n.body || '').split('\n')[0]) || 'No content'}</div>
      <div class="note-item-date">${fmtDate(n.updatedAt)}</div>
      <button class="note-item-del" onclick="deleteNoteById(event,'${n.id}')" title="Delete note">
        <svg viewBox="0 0 12 12" fill="none"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  }).join('');
}

// ── New note ──────────────────────────────────────────────────────────────────
window.newNote = async function() {
  const ref = await addDoc(collection(db, "notes"), {
    title: '', body: '', priority: 'none', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  notes.unshift({ id: ref.id, title: '', body: '', priority: 'none', updatedAt: null });
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
  ec.style.display       = 'flex';
  ec.style.flexDirection = 'column';
  ec.style.flex          = '1';
  ec.style.overflow      = 'hidden';

  document.getElementById('noteTitle').textContent = n.title || '';
  document.getElementById('noteBody').innerHTML    = n.body  || '';
  document.getElementById('editorDate').textContent = fmtDate(n.updatedAt);
  setSaveStatus('idle');
  setPriorityUI(n.priority || 'none');

  renderList();
  document.getElementById('noteTitle').focus();
};

// ── Priority ──────────────────────────────────────────────────────────────────
window.setPriority = function(p) {
  if (!activeId) return;
  const idx = notes.findIndex(x => x.id === activeId);
  if (idx > -1) notes[idx].priority = p;
  setPriorityUI(p);
  scheduleSave();
};

function setPriorityUI(p) {
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.p === p);
  });
}

// ── Auto-save ─────────────────────────────────────────────────────────────────
function scheduleSave() {
  setSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveActive, 800);
}

async function saveActive() {
  if (!activeId) return;
  const title    = document.getElementById('noteTitle').textContent;
  const body     = document.getElementById('noteBody').innerHTML;
  const idx      = notes.findIndex(x => x.id === activeId);
  const priority = idx > -1 ? (notes[idx].priority || 'none') : 'none';

  if (idx > -1) {
    notes[idx].title = title;
    notes[idx].body  = body;
    notes[idx].updatedAt = { seconds: Date.now() / 1000 };
  }
  try {
    await updateDoc(doc(db, "notes", activeId), { title, body, priority, updatedAt: serverTimestamp() });
    setSaveStatus('saved');
    document.getElementById('editorDate').textContent = 'Just now';
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
document.getElementById('noteBody').addEventListener('input', () => {
  scheduleSave();
  updateToolbarState();
});

// ── Delete note ───────────────────────────────────────────────────────────────
window.deleteNote = function() {
  if (!activeId) return;
  pendingDeleteId = activeId;
  document.getElementById('noteConfirmOverlay').classList.add('open');
};

window.deleteNoteById = function(e, id) {
  e.stopPropagation();
  pendingDeleteId = id;
  document.getElementById('noteConfirmOverlay').classList.add('open');
};

window.closeNoteConfirm = function() {
  document.getElementById('noteConfirmOverlay').classList.remove('open');
  pendingDeleteId = null;
};

window.confirmDeleteNote = async function() {
  if (!pendingDeleteId) return;
  const idToDelete = pendingDeleteId;
  try {
    await deleteDoc(doc(db, "notes", idToDelete));
    notes = notes.filter(x => x.id !== idToDelete);
    if (activeId === idToDelete) {
      activeId = null;
      document.getElementById('editorContent').style.display = 'none';
      document.getElementById('editorPlaceholder').style.display = 'flex';
    }
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

// ── Rich text formatting ──────────────────────────────────────────────────────
window.fmtCmd = function(e, cmd) {
  e.preventDefault();
  document.getElementById('noteBody').focus();
  document.execCommand(cmd, false, null);
  updateToolbarState();
  scheduleSave();
};

window.fmtBlock = function(e, tag) {
  e.preventDefault();
  const body = document.getElementById('noteBody');
  body.focus();
  const current = document.queryCommandValue('formatBlock').toUpperCase();
  document.execCommand('formatBlock', false, current === tag ? 'P' : tag);
  updateToolbarState();
  scheduleSave();
};

window.fmtHR = function(e) {
  e.preventDefault();
  document.getElementById('noteBody').focus();
  document.execCommand('insertHorizontalRule', false, null);
  scheduleSave();
};

window.fmtClear = function(e) {
  e.preventDefault();
  document.getElementById('noteBody').focus();
  document.execCommand('removeFormat', false, null);
  updateToolbarState();
  scheduleSave();
};

function updateToolbarState() {
  const toggle = (id, state) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', state);
  };
  toggle('fmt-bold',      document.queryCommandState('bold'));
  toggle('fmt-italic',    document.queryCommandState('italic'));
  toggle('fmt-underline', document.queryCommandState('underline'));
  toggle('fmt-strike',    document.queryCommandState('strikeThrough'));
  toggle('fmt-ul',        document.queryCommandState('insertUnorderedList'));
  toggle('fmt-ol',        document.queryCommandState('insertOrderedList'));

  const block = document.queryCommandValue('formatBlock').toUpperCase();
  toggle('fmt-h1',    block === 'H1');
  toggle('fmt-h2',    block === 'H2');
  toggle('fmt-quote', block === 'BLOCKQUOTE');
}

document.getElementById('noteBody').addEventListener('keyup', updateToolbarState);
document.getElementById('noteBody').addEventListener('mouseup', updateToolbarState);
document.addEventListener('selectionchange', () => {
  if (document.activeElement === document.getElementById('noteBody')) {
    updateToolbarState();
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

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
