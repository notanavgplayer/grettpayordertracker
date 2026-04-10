import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, updateDoc,
  deleteDoc, doc, query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let tasks      = [];
let todoFilter = 'all';

// ── Auth ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = '/'; return; }
  loadTasks();
});

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadTasks() {
  try {
    const q    = query(collection(db, "todos"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTasks();
  } catch(e) {
    console.error('Failed to load tasks:', e);
    document.getElementById('todoSubtitle').textContent = 'Failed to load tasks. Please refresh.';
    document.getElementById('taskList').innerHTML = `
      <div class="todo-empty">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="16" stroke="#c8d3e0" stroke-width="2"/>
          <path d="M18 18l12 12M30 18L18 30" stroke="#c8d3e0" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>Could not load tasks</p>
        <span>Check your connection and refresh the page.</span>
      </div>`;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTasks() {
  const open = tasks.filter(t => !t.done).length;
  const done = tasks.filter(t => t.done).length;

  document.getElementById('statOpen').textContent = open;
  document.getElementById('statDone').textContent = done;
  document.getElementById('todoSubtitle').textContent =
    open === 0 && tasks.length > 0 ? 'All caught up!' :
    open === 0 ? 'No tasks yet' :
    `${open} task${open !== 1 ? 's' : ''} remaining`;

  let filtered = tasks;
  if (todoFilter === 'open')  filtered = tasks.filter(t => !t.done);
  if (todoFilter === 'done')  filtered = tasks.filter(t => t.done);
  if (todoFilter === 'high')  filtered = tasks.filter(t => t.priority === 'high' && !t.done);
  if (todoFilter === 'overdue') {
    const todayStr = new Date().toISOString().split('T')[0];
    filtered = tasks.filter(t => !t.done && t.dueDate && t.dueDate < todayStr);
  }

  const el = document.getElementById('taskList');
  if (!filtered.length) {
    el.innerHTML = `
    <div class="todo-empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <path d="M10 14h28M10 24h28M10 34h18" stroke="#c8d3e0" stroke-width="2" stroke-linecap="round"/>
        <circle cx="6" cy="14" r="2" fill="#c8d3e0"/>
        <circle cx="6" cy="24" r="2" fill="#c8d3e0"/>
        <circle cx="6" cy="34" r="2" fill="#c8d3e0"/>
      </svg>
      <p>${todoFilter === 'done' ? 'No completed tasks yet' : 'No tasks here'}</p>
      <span>${todoFilter === 'all' ? 'Add your first task above' : 'Change the filter to see more'}</span>
    </div>`;
    return;
  }

  const openItems = filtered.filter(t => !t.done);
  const doneItems = filtered.filter(t => t.done);

  let html = '';
  if (openItems.length) html += openItems.map(taskHtml).join('');
  if (doneItems.length) {
    html += `<div class="task-group-label" style="margin-top:${openItems.length ? '1.25rem' : '0'}">Completed</div>`;
    html += doneItems.map(taskHtml).join('');
  }
  el.innerHTML = html;
}

function taskHtml(t) {
  const pMap   = { high: 'High', medium: 'Medium', low: 'Low' };
  const pClass = { high: 'p-high', medium: 'p-medium', low: 'p-low' };
  const date   = t.createdAt?.seconds
    ? new Date(t.createdAt.seconds * 1000).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' })
    : '—';
  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = !t.done && t.dueDate && t.dueDate < todayStr;
  const dueDateHtml = t.dueDate ? `<span style="font-size:11px;font-weight:600;padding:1px 7px;border-radius:8px;background:${isOverdue ? 'var(--red-bg)' : 'var(--blue-bg)'};color:${isOverdue ? 'var(--red-fg)' : 'var(--blue-fg)'}">Due: ${new Date(t.dueDate+'T00:00:00').toLocaleDateString('en-PK',{day:'2-digit',month:'short'})}</span>` : '';
  return `
  <div class="task-item ${t.done ? 'done' : ''} ${isOverdue ? 'overdue' : ''}" id="task-${t.id}">
    <button class="task-check-btn" onclick="toggleDone('${t.id}')" title="${t.done ? 'Mark open' : 'Mark done'}">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="task-body">
      <div class="task-text">${esc(t.text)}</div>
      <div class="task-meta">
        <span class="priority-badge ${pClass[t.priority] || 'p-medium'}" onclick="cyclePriority('${t.id}')" title="Click to change priority">${pMap[t.priority] || 'Medium'}</span>
        ${dueDateHtml}
        <span class="task-date">${date}</span>
      </div>
    </div>
    <button class="task-del-btn" onclick="deleteTask('${t.id}')" title="Delete">
      <svg viewBox="0 0 12 12" fill="none">
        <path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>`;
}

// ── Add task ──────────────────────────────────────────────────────────────────
window.addTask = async function() {
  const input    = document.getElementById('taskInput');
  const text     = input.value.trim();
  if (!text) { input.focus(); return; }
  const priority = document.getElementById('taskPriority').value;

  input.value = '';
  input.focus();

  try {
    const dueDate = document.getElementById('taskDueDate')?.value || '';
    const ref = await addDoc(collection(db, "todos"), {
      text, priority, dueDate, done: false, createdAt: serverTimestamp()
    });
    tasks.unshift({ id: ref.id, text, priority, dueDate, done: false, createdAt: null });
    if (document.getElementById('taskDueDate')) document.getElementById('taskDueDate').value = '';
    renderTasks();
  } catch(e) {
    console.error('Add task error:', e);
    toast('Error adding task. Check your connection.');
  }
};

// ── Cycle priority ────────────────────────────────────────────────────────────
window.cyclePriority = async function(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const order = ['low', 'medium', 'high'];
  const next  = order[(order.indexOf(t.priority) + 1) % order.length];
  t.priority = next;
  renderTasks();
  try {
    await updateDoc(doc(db, "todos", id), { priority: next });
  } catch(e) {
    t.priority = order[(order.indexOf(next) + 2) % order.length]; // revert
    renderTasks();
    console.error('Priority update error:', e);
  }
};

// ── Toggle done ───────────────────────────────────────────────────────────────
window.toggleDone = async function(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  renderTasks();
  try {
    await updateDoc(doc(db, "todos", id), { done: t.done });
  } catch(e) {
    t.done = !t.done; // revert
    renderTasks();
    console.error('Toggle error:', e);
  }
};

// ── Delete task ───────────────────────────────────────────────────────────────
window.deleteTask = async function(id) {
  tasks = tasks.filter(x => x.id !== id);
  renderTasks();
  try {
    await deleteDoc(doc(db, "todos", id));
    toast('Task deleted.');
  } catch(e) {
    console.error('Delete error:', e);
    toast('Error deleting task.');
  }
};

// ── Clear completed ───────────────────────────────────────────────────────────
window.clearDone = async function() {
  const done = tasks.filter(t => t.done);
  if (!done.length) { toast('No completed tasks to clear.'); return; }
  const count = done.length;
  tasks = tasks.filter(t => !t.done);
  renderTasks();
  try {
    const batch = writeBatch(db);
    done.forEach(t => batch.delete(doc(db, "todos", t.id)));
    await batch.commit();
    toast(`${count} completed task${count !== 1 ? 's' : ''} cleared.`);
  } catch(e) {
    console.error('Clear error:', e);
    toast('Error clearing tasks.');
  }
};

// ── Filter ────────────────────────────────────────────────────────────────────
window.setTodoFilter = function(f, btn) {
  todoFilter = f;
  document.querySelectorAll('.todo-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
};

// ── Enter key to add ──────────────────────────────────────────────────────────
document.getElementById('taskInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') window.addTask();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
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
