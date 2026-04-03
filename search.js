import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allData    = { tenders: [], payOrders: [], notes: [], todos: [], expenses: [] };
let dataLoaded = false;
let sFilter    = 'all';
let searchTimer = null;

// ── Auth + load ───────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  await loadAllData();
  // If there's already a query in the input (e.g. from URL), run it
  const q = document.getElementById('globalSearch').value.trim();
  if (q.length >= 2) runSearch(q);
});

async function loadAllData() {
  try {
    const [tSnap, pSnap, nSnap, tdSnap, eSnap] = await Promise.all([
      getDocs(collection(db, "tenders")),
      getDocs(collection(db, "payOrders")),
      getDocs(collection(db, "notes")),
      getDocs(collection(db, "todos")),
      getDocs(collection(db, "expenses")),
    ]);
    allData.tenders   = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.payOrders = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.notes     = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.todos     = tdSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.expenses  = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Failed to load search data:', e);
  }
  dataLoaded = true;
}

// ── Search input ──────────────────────────────────────────────────────────────
window.onSearchInput = function() {
  const q   = document.getElementById('globalSearch').value.trim();
  const btn = document.getElementById('searchClear');
  btn.classList.toggle('show', q.length > 0);
  clearTimeout(searchTimer);
  if (q.length < 2) { showIdle(q.length === 1); return; }
  searchTimer = setTimeout(() => runSearch(q), 220);
};

window.clearSearch = function() {
  document.getElementById('globalSearch').value = '';
  document.getElementById('searchClear').classList.remove('show');
  showIdle(false);
  document.getElementById('globalSearch').focus();
};

window.setSFilter = function(f, btn) {
  sFilter = f;
  document.querySelectorAll('.sf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const q = document.getElementById('globalSearch').value.trim();
  if (q.length >= 2) runSearch(q);
};

// ── Run search ────────────────────────────────────────────────────────────────
function runSearch(q) {
  if (!dataLoaded) return;
  const ql = q.toLowerCase();
  const results = [];

  // Tenders
  if (sFilter === 'all' || sFilter === 'tender') {
    allData.tenders.forEach(t => {
      if (matches(ql, t.name, t.nit, t.agency, t.notes)) {
        results.push({
          type: 'tender', id: t.id,
          title: t.name || 'Untitled Tender',
          sub: `${t.agency||'—'} · ${t.nit||'—'}`,
          badge: t.status,
          badgeCls: statusBadgeClass(t.status),
          href: `tender-detail.html?id=${t.id}`,
          q,
        });
      }
    });
  }

  // Pay Orders
  if (sFilter === 'all' || sFilter === 'po') {
    allData.payOrders.forEach(p => {
      if (matches(ql, p.po, p.tender, p.agency, p.bank, p.notes)) {
        results.push({
          type: 'po', id: p.id,
          title: p.tender || `PO ${p.po||'—'}`,
          sub: `${p.po||'—'} · ${p.bank||'—'} · Rs ${Number(p.amount||0).toLocaleString('en-PK')}`,
          badge: p.status,
          badgeCls: poBadgeClass(p.status),
          href: 'dashboard.html',
          q,
        });
      }
    });
  }

  // Notes
  if (sFilter === 'all' || sFilter === 'note') {
    allData.notes.forEach(n => {
      if (matches(ql, n.title, n.body)) {
        results.push({
          type: 'note', id: n.id,
          title: n.title || 'Untitled Note',
          sub: stripHtml(n.body||'').slice(0, 150) || 'No content',
          href: 'notes.html',
          q,
        });
      }
    });
  }

  // To-Dos
  if (sFilter === 'all' || sFilter === 'todo') {
    allData.todos.forEach(t => {
      if (matches(ql, t.text)) {
        results.push({
          type: 'todo', id: t.id,
          title: t.text || '—',
          sub: `${t.priority||'medium'} priority · ${t.done ? 'Completed' : 'Open'}`,
          badge: t.done ? 'Done' : 'Open',
          badgeCls: t.done ? 'b-returned' : 'b-submitted',
          href: 'todo.html',
          q,
        });
      }
    });
  }

  // Expenses
  if (sFilter === 'all' || sFilter === 'expense') {
    allData.expenses.forEach(e => {
      if (matches(ql, e.description, e.category, e.note)) {
        results.push({
          type: 'expense', id: e.id,
          title: e.description || '—',
          sub: `${e.category||'—'} · ${fmtDate(e.date)} · Rs ${Number(e.amount||0).toLocaleString('en-PK')}`,
          href: 'expenses.html',
          q,
        });
      }
    });
  }

  renderResults(results, q);
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(results, q) {
  const el = document.getElementById('searchResults');

  if (!results.length) {
    el.innerHTML = `
    <div class="search-state">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="22" cy="22" r="14" stroke="#c8d3e0" stroke-width="2.5"/>
        <path d="M32 32l8 8" stroke="#c8d3e0" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M17 27s2-4 10-4M22 16v2M16 18l1 1" stroke="#c8d3e0" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <p>No results for "${esc(q)}"</p>
      <span>Try different keywords or change the filter</span>
    </div>`;
    return;
  }

  // Group by type
  const groups = { tender: [], po: [], note: [], todo: [], expense: [] };
  results.forEach(r => groups[r.type].push(r));

  const groupConfig = {
    tender:  { label: 'Tenders',    iconCls: 'rgi-tender',  riCls: 'ri-tender',  icon: `<svg viewBox="0 0 20 20" fill="none"><path d="M4 3h8l4 4v10H4V3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3v4h4" stroke="currentColor" stroke-width="1.5"/></svg>` },
    po:      { label: 'Pay Orders', iconCls: 'rgi-po',      riCls: 'ri-po',      icon: `<svg viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    note:    { label: 'Notes',      iconCls: 'rgi-note',    riCls: 'ri-note',    icon: `<svg viewBox="0 0 20 20" fill="none"><path d="M4 4h12v9l-4 4H4V4z" stroke="currentColor" stroke-width="1.5"/></svg>` },
    todo:    { label: 'To-Do',      iconCls: 'rgi-todo',    riCls: 'ri-todo',    icon: `<svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
    expense: { label: 'Expenses',   iconCls: 'rgi-expense', riCls: 'ri-expense', icon: `<svg viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2 9h16" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="13" r="1" fill="currentColor"/></svg>` },
  };

  let html = `<div class="results-count"><strong>${results.length}</strong> result${results.length===1?'':'s'} for "${esc(q)}"</div>`;

  Object.entries(groups).forEach(([type, items]) => {
    if (!items.length) return;
    const cfg = groupConfig[type];
    html += `
    <div class="result-group">
      <div class="result-group-header">
        <div class="result-group-icon ${cfg.iconCls}">${cfg.icon}</div>
        ${cfg.label} <span style="font-weight:400;margin-left:4px">(${items.length})</span>
      </div>
      ${items.map(r => `
      <a class="result-item" href="${r.href}">
        <div class="result-icon ${cfg.riCls}">${cfg.icon}</div>
        <div class="result-body">
          <div class="result-title">${highlight(r.title, q)}</div>
          <div class="result-sub">${esc(r.sub)}</div>
        </div>
        <div class="result-meta">
          ${r.badge ? `<span class="badge ${r.badgeCls||''} result-badge">${esc(r.badge)}</span>` : ''}
          <span class="result-arrow">›</span>
        </div>
      </a>`).join('')}
    </div>`;
  });

  el.innerHTML = html;
}

function showIdle(typing) {
  document.getElementById('searchResults').innerHTML = `
  <div class="search-state">
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="22" cy="22" r="14" stroke="#c8d3e0" stroke-width="2.5"/>
      <path d="M32 32l8 8" stroke="#c8d3e0" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
    <p>${typing ? 'Keep typing…' : 'Search across everything'}</p>
    <span>Type at least 2 characters to search</span>
  </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function matches(q, ...fields) {
  return fields.some(f => (f||'').toLowerCase().includes(q));
}

function highlight(text, q) {
  if (!q || !text) return esc(text||'');
  const escaped = esc(text);
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function stripHtml(s) {
  return String(s||'')
    .replace(/<[^>]*>?/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function statusBadgeClass(s) {
  const m = { Bidding:'s-bidding', Submitted:'s-submitted', Awarded:'s-awarded', Lost:'s-lost', Cancelled:'s-cancelled' };
  return m[s] || 's-bidding';
}

function poBadgeClass(s) {
  const m = { Pending:'b-pending', Submitted:'b-submitted', Returned:'b-returned', Encashed:'b-encashed', Forfeited:'b-forfeited' };
  return m[s] || 'b-pending';
}
