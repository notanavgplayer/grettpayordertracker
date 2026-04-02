import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let hsData   = { tenders: [], payOrders: [], notes: [], todos: [], expenses: [] };
let hsLoaded = false;
let hsTimer  = null;

onAuthStateChanged(auth, async user => {
  if (!user) return;
  const [tSnap, pSnap, nSnap, tdSnap, eSnap] = await Promise.all([
    getDocs(collection(db, "tenders")),
    getDocs(collection(db, "payOrders")),
    getDocs(collection(db, "notes")),
    getDocs(collection(db, "todos")),
    getDocs(collection(db, "expenses")),
  ]);
  hsData.tenders   = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  hsData.payOrders = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  hsData.notes     = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  hsData.todos     = tdSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  hsData.expenses  = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  hsLoaded = true;
});

window.homeSearch = function() {
  const q = (document.getElementById('homeSearchInput').value || '').trim();
  clearTimeout(hsTimer);
  if (q.length < 2) { hideResults(); return; }
  hsTimer = setTimeout(() => runHomeSearch(q), 200);
};

window.clearHomeSearch = function() {
  document.getElementById('homeSearchInput').value = '';
  hideResults();
  document.getElementById('homeSearchInput').focus();
};

function hideResults() {
  document.getElementById('homeSearchResults').classList.remove('show');
}

function runHomeSearch(q) {
  if (!hsLoaded) return;
  const ql = q.toLowerCase();
  const results = [];

  const icons = {
    tender:  `<svg viewBox="0 0 20 20" fill="none"><path d="M4 3h8l4 4v10H4V3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3v4h4" stroke="currentColor" stroke-width="1.5"/></svg>`,
    po:      `<svg viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    note:    `<svg viewBox="0 0 20 20" fill="none"><path d="M4 4h12v9l-4 4H4V4z" stroke="currentColor" stroke-width="1.5"/></svg>`,
    todo:    `<svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    expense: `<svg viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2 9h16" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="13" r="1" fill="currentColor"/></svg>`,
  };
  const iconBg = {
    tender: 'background:var(--blue-bg);color:var(--blue-fg)',
    po:     'background:var(--amber-bg);color:var(--amber-fg)',
    note:   'background:var(--purple-bg);color:var(--purple-fg)',
    todo:   'background:var(--green-bg);color:var(--green-fg)',
    expense:'background:var(--red-bg);color:var(--red-fg)',
  };
  const typeLabel = { tender:'Tender', po:'Pay Order', note:'Note', todo:'To-Do', expense:'Expense' };

  // Tenders
  hsData.tenders.forEach(t => {
    if (matches(ql, t.name, t.nit, t.agency)) results.push({
      type:'tender', title: t.name||'Untitled', sub: `${t.agency||'—'} · ${t.nit||'—'}`,
      href: `tender-detail.html?id=${t.id}`
    });
  });
  // Pay Orders
  hsData.payOrders.forEach(p => {
    if (matches(ql, p.po, p.tender, p.agency, p.bank)) results.push({
      type:'po', title: p.tender||`PO ${p.po||'—'}`, sub: `${p.po||'—'} · ${p.bank||'—'}`,
      href: 'dashboard.html'
    });
  });
  // Notes
  hsData.notes.forEach(n => {
    if (matches(ql, n.title, n.body)) results.push({
      type:'note', title: n.title||'Untitled', sub: (n.body||'').slice(0,60),
      href: 'notes.html'
    });
  });
  // Todos
  hsData.todos.forEach(t => {
    if (matches(ql, t.text)) results.push({
      type:'todo', title: t.text||'—', sub: `${t.priority||'medium'} · ${t.done?'Done':'Open'}`,
      href: 'todo.html'
    });
  });
  // Expenses
  hsData.expenses.forEach(e => {
    if (matches(ql, e.description, e.category, e.note)) results.push({
      type:'expense', title: e.description||'—', sub: `${e.category||'—'} · Rs ${Number(e.amount||0).toLocaleString('en-PK')}`,
      href: 'expenses.html'
    });
  });

  const show = results.slice(0, 8);
  document.getElementById('hsrCount').textContent =
    `${results.length} result${results.length===1?'':'s'} for "${esc(q)}"`;

  document.getElementById('hsrList').innerHTML = show.length
    ? show.map(r => `
      <a class="hsr-item" href="${r.href}">
        <div class="hsr-icon" style="${iconBg[r.type]}">${icons[r.type]}</div>
        <div class="hsr-body">
          <div class="hsr-title">${highlight(r.title, q)}</div>
          <div class="hsr-sub">${esc(r.sub)}</div>
        </div>
        <span class="hsr-type">${typeLabel[r.type]}</span>
      </a>`).join('')
    : `<div style="padding:1.25rem;text-align:center;font-size:13px;color:var(--muted)">No results for "${esc(q)}"</div>`;

  document.getElementById('homeSearchResults').classList.add('show');
}

// Hide results when clicking outside
document.addEventListener('click', e => {
  const bar = document.querySelector('.home-search-bar');
  const res = document.getElementById('homeSearchResults');
  if (bar && !bar.contains(e.target) && res && !res.contains(e.target)) {
    hideResults();
  }
});

function matches(q, ...fields) {
  return fields.some(f => (f||'').toLowerCase().includes(q));
}
function highlight(text, q) {
  if (!q || !text) return esc(text||'');
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return esc(text).replace(re, '<mark>$1</mark>');
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
