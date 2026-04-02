import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, updateDoc, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Module-level data shared between dashboard and search ─────────────────────
let _tenders   = [];
let _payOrders = [];
let _todos     = [];
let _notes     = [];
let _expenses  = [];
let _loaded    = false;
let _searchTimer = null;

// ── Auth ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  await setGreeting(user);
  await loadAll();
});

async function setGreeting(user) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  // Try to get display name from Firestore
  let name = '';
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().displayName) {
      name = userDoc.data().displayName;
    }
  } catch(e) { /* ignore */ }

  // Fallback to email prefix
  if (!name) {
    name = user.email ? user.email.split('@')[0] : '';
  }

  document.getElementById('greeting').textContent = `${part}, ${name} 👋`;
  document.getElementById('greetingSub').textContent =
    `Here's what's happening today — ` +
    new Date().toLocaleDateString('en-PK', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ── Load ALL data once ────────────────────────────────────────────────────────
async function loadAll() {
  // Use allSettled so one failed collection never blocks the rest
  const [tRes, pRes, tdRes, nRes, eRes] = await Promise.allSettled([
    getDocs(collection(db, "tenders")),
    getDocs(collection(db, "payOrders")),
    getDocs(collection(db, "todos")),
    getDocs(collection(db, "notes")),
    getDocs(collection(db, "expenses")),
  ]);
  const parse = res => res.status === 'fulfilled' ? res.value.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  _tenders   = parse(tRes);
  _payOrders = parse(pRes);
  _todos     = parse(tdRes);
  _notes     = parse(nRes);
  _expenses  = parse(eRes);
  _loaded    = true;
  // Log any failures to help debug
  [tRes,pRes,tdRes,nRes,eRes].forEach((r,i) => {
    if (r.status === 'rejected') console.warn(`Collection ${['tenders','payOrders','todos','notes','expenses'][i]} failed:`, r.reason);
  });
  renderCards();
  renderAlerts();
  renderDeadlines();
  renderPOExpiry();
  renderTodos();
  renderActivity();
}

// ── CARDS ─────────────────────────────────────────────────────────────────────
function renderCards() {
  const today = new Date(); today.setHours(0,0,0,0);
  const in7   = new Date(today); in7.setDate(in7.getDate() + 7);
  const active    = _tenders.filter(t => ['Bidding','Submitted'].includes(t.status)).length;
  const awarded   = _tenders.filter(t => t.status === 'Awarded').length;
  const atRisk    = _payOrders.filter(p => p.status === 'Submitted').length;
  const expiring  = _payOrders.filter(p => {
    if (p.status !== 'Submitted' || !p.expiry) return false;
    const d = new Date(p.expiry + 'T00:00:00');
    return d >= today && d <= in7;
  }).length;
  const openTasks = _todos.filter(t => !t.done).length;
  document.getElementById('hActiveTenders').textContent = active;
  document.getElementById('hPOAtRisk').textContent      = atRisk;
  document.getElementById('hPOExpiring').textContent    = expiring;
  document.getElementById('hOpenTasks').textContent     = openTasks;
  document.getElementById('hAwarded').textContent       = awarded;
}

// ── ALERTS ────────────────────────────────────────────────────────────────────
function renderAlerts() {
  const today = new Date(); today.setHours(0,0,0,0);
  const alerts = [];

  // POs expiring within 3 days
  _payOrders.filter(p => p.status === 'Submitted' && p.expiry).forEach(p => {
    const d = new Date(p.expiry + 'T00:00:00');
    const daysLeft = Math.round((d - today) / 86400000);
    if (daysLeft <= 0) {
      alerts.push({ level:'urgent', text:`Pay order <strong>${esc(p.po||'—')}</strong> (${esc(p.bank||'—')}) has <strong>expired today</strong>!` });
    } else if (daysLeft <= 3) {
      alerts.push({ level:'urgent', text:`Pay order <strong>${esc(p.po||'—')}</strong> (${esc(p.bank||'—')}) expires in <strong>${daysLeft} day${daysLeft>1?'s':''}</strong>` });
    } else if (daysLeft <= 7) {
      alerts.push({ level:'warning', text:`Pay order <strong>${esc(p.po||'—')}</strong> expires in <strong>${daysLeft} days</strong>` });
    }
  });

  // Tender submissions within 2 days
  _tenders.filter(t => t.submissionDate && ['Bidding','Submitted'].includes(t.status)).forEach(t => {
    const d = new Date(t.submissionDate + 'T00:00:00');
    const daysLeft = Math.round((d - today) / 86400000);
    if (daysLeft === 0) {
      alerts.push({ level:'urgent', text:`Tender <strong>${esc(t.name||'Untitled')}</strong> submission is <strong>due today</strong>!` });
    } else if (daysLeft === 1) {
      alerts.push({ level:'urgent', text:`Tender <strong>${esc(t.name||'Untitled')}</strong> submission is <strong>due tomorrow</strong>` });
    } else if (daysLeft === 2) {
      alerts.push({ level:'warning', text:`Tender <strong>${esc(t.name||'Untitled')}</strong> submission in <strong>2 days</strong>` });
    }
  });

  const el = document.getElementById('alertBanner');
  if (!alerts.length) { el.style.display = 'none'; return; }

  const icons = {
    urgent: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 2L1 18h18L10 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 8v4M10 14.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v5M10 13.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  };

  el.style.display = 'flex';
  el.innerHTML = alerts.slice(0, 5).map((a, i) => `
    <div class="alert-item ${a.level}">
      ${icons[a.level]}
      <span class="alert-item-text">${a.text}</span>
      <button class="alert-dismiss" onclick="this.parentElement.remove()" title="Dismiss">×</button>
    </div>
  `).join('');
}

// ── DEADLINES ─────────────────────────────────────────────────────────────────
function renderDeadlines() {
  const today    = new Date(); today.setHours(0,0,0,0);
  const upcoming = _tenders
    .filter(t => t.submissionDate && ['Bidding','Submitted'].includes(t.status))
    .map(t => ({ ...t, daysLeft: Math.round((new Date(t.submissionDate + 'T00:00:00') - today) / 86400000) }))
    .filter(t => t.daysLeft >= 0)
    .sort((a,b) => a.daysLeft - b.daysLeft)
    .slice(0, 6);
  const el = document.getElementById('deadlinesList');
  if (!upcoming.length) { el.innerHTML = '<div class="panel-empty">No upcoming deadlines.</div>'; return; }
  el.innerHTML = upcoming.map(t => {
    const cls   = t.daysLeft <= 3 ? 'urgent' : t.daysLeft <= 7 ? 'soon' : 'ok';
    const label = t.daysLeft === 0 ? 'Today!' : t.daysLeft === 1 ? '1 day' : `${t.daysLeft} days`;
    return `<a class="deadline-item" href="tender-detail.html?id=${t.id}">
      <div class="deadline-dot ${cls}"></div>
      <div class="deadline-info">
        <div class="deadline-name">${esc(t.name||'Untitled')}</div>
        <div class="deadline-agency">${esc(t.agency||'—')} · ${fmtDate(t.submissionDate)}</div>
      </div>
      <span class="deadline-days ${cls}">${label}</span>
    </a>`;
  }).join('');
}

// ── PO EXPIRY ─────────────────────────────────────────────────────────────────
function renderPOExpiry() {
  const today    = new Date(); today.setHours(0,0,0,0);
  const expiring = _payOrders
    .filter(p => p.status === 'Submitted' && p.expiry)
    .map(p => ({ ...p, daysLeft: Math.round((new Date(p.expiry + 'T00:00:00') - today) / 86400000) }))
    .filter(p => p.daysLeft >= 0 && p.daysLeft <= 30)
    .sort((a,b) => a.daysLeft - b.daysLeft)
    .slice(0, 6);

  // Also check for already-expired POs
  const expired = _payOrders
    .filter(p => p.status === 'Submitted' && p.expiry)
    .map(p => ({ ...p, daysLeft: Math.round((new Date(p.expiry + 'T00:00:00') - today) / 86400000) }))
    .filter(p => p.daysLeft < 0)
    .sort((a,b) => b.daysLeft - a.daysLeft)
    .slice(0, 3);

  const el = document.getElementById('poExpiryList');
  const allItems = [...expired, ...expiring];
  if (!allItems.length) { el.innerHTML = '<div class="panel-empty">No pay orders expiring soon.</div>'; return; }
  el.innerHTML = allItems.map(p => {
    const isExpired = p.daysLeft < 0;
    const cls   = isExpired ? 'urgent' : p.daysLeft <= 7 ? 'urgent' : 'soon';
    const label = isExpired ? `${Math.abs(p.daysLeft)}d overdue!` : p.daysLeft === 0 ? 'Today!' : p.daysLeft === 1 ? '1 day' : `${p.daysLeft}d left`;
    return `<div class="po-item">
      <span class="po-num">${esc(p.po||'—')}</span>
      <span class="po-bank">${esc(p.bank||'—')} · Rs ${Number(p.amount||0).toLocaleString('en-PK')}</span>
      <span class="po-days ${cls}">${label}</span>
    </div>`;
  }).join('');
}

// ── TODOS ─────────────────────────────────────────────────────────────────────
function renderTodos() {
  const open = _todos
    .filter(t => !t.done)
    .sort((a,b) => ({ high:0, medium:1, low:2 }[a.priority]||1) - ({ high:0, medium:1, low:2 }[b.priority]||1))
    .slice(0, 6);
  const el = document.getElementById('todoList');
  if (!open.length) { el.innerHTML = '<div class="panel-empty">All tasks completed! 🎉</div>'; return; }
  el.innerHTML = open.map(t => `
    <div class="todo-home-item" onclick="toggleHomeTodo('${t.id}', this)">
      <div class="todo-home-check ${t.done?'done':''}"></div>
      <span class="todo-home-text ${t.done?'done':''}">${esc(t.text)}</span>
      <span class="badge ${t.priority==='high'?'p-high':t.priority==='low'?'p-low':'p-medium'}" style="font-size:10px">${t.priority||'medium'}</span>
    </div>`).join('');
}

window.toggleHomeTodo = async function(id, row) {
  const check  = row.querySelector('.todo-home-check');
  const text   = row.querySelector('.todo-home-text');
  const isDone = !check.classList.contains('done');
  check.classList.toggle('done', isDone);
  text.classList.toggle('done', isDone);
  await updateDoc(doc(db, "todos", id), { done: isDone });
  if (isDone) setTimeout(() => row.style.opacity = '0.4', 300);
};

// ── ACTIVITY ──────────────────────────────────────────────────────────────────
function renderActivity() {
  const events = [];
  _tenders.forEach(t => {
    if (t.createdAt?.seconds) events.push({ type:'tender', ts: t.createdAt.seconds, text: `Tender <strong>${esc(t.name||'Untitled')}</strong> created`, href: `tender-detail.html?id=${t.id}` });
    if (t.updatedAt?.seconds && t.updatedAt.seconds !== t.createdAt?.seconds) events.push({ type:'tender', ts: t.updatedAt.seconds, text: `Tender <strong>${esc(t.name||'Untitled')}</strong> updated`, href: `tender-detail.html?id=${t.id}` });
  });
  _payOrders.forEach(p => { if (p.createdAt?.seconds) events.push({ type:'po', ts: p.createdAt.seconds, text: `Pay order <strong>${esc(p.po||'—')}</strong> added (${esc(p.bank||'—')})` }); });
  _todos.filter(t => t.done && t.createdAt?.seconds).forEach(t => { events.push({ type:'todo', ts: t.createdAt.seconds, text: `Task completed: <strong>${esc(t.text)}</strong>` }); });
  events.sort((a,b) => b.ts - a.ts);
  const icons = {
    tender: `<svg viewBox="0 0 20 20" fill="none"><path d="M4 3h8l4 4v10H4V3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3v4h4" stroke="currentColor" stroke-width="1.5"/></svg>`,
    po:     `<svg viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    todo:   `<svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    note:   `<svg viewBox="0 0 20 20" fill="none"><path d="M4 4h12v9l-4 4H4V4z" stroke="currentColor" stroke-width="1.5"/></svg>`,
  };
  const el = document.getElementById('activityList');
  const recent = events.slice(0, 8);
  if (!recent.length) { el.innerHTML = '<div class="panel-empty">No recent activity.</div>'; return; }
  el.innerHTML = recent.map(e => `
    <div class="activity-item" ${e.href ? `style="cursor:pointer" onclick="location.href='${e.href}'"` : ''}>
      <div class="activity-icon ${e.type}">${icons[e.type]||''}</div>
      <div class="activity-body">
        <div class="activity-text">${e.text}</div>
        <div class="activity-time">${timeAgo(e.ts)}</div>
      </div>
    </div>`).join('');
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
window.homeSearch = function() {
  const q = (document.getElementById('homeSearchInput').value || '').trim();
  clearTimeout(_searchTimer);
  if (q.length < 2) { hideResults(); return; }
  _searchTimer = setTimeout(() => runSearch(q), 200);
};

window.clearHomeSearch = function() {
  document.getElementById('homeSearchInput').value = '';
  hideResults();
  document.getElementById('homeSearchInput').focus();
};

function hideResults() {
  document.getElementById('homeSearchResults').classList.remove('show');
}

function runSearch(q) {
  if (!_loaded) { setTimeout(() => runSearch(q), 300); return; }
  const ql      = q.toLowerCase();
  const results = [];

  const icons = {
    tender:  `<svg viewBox="0 0 20 20" fill="none"><path d="M4 3h8l4 4v10H4V3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3v4h4" stroke="currentColor" stroke-width="1.5"/></svg>`,
    po:      `<svg viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    note:    `<svg viewBox="0 0 20 20" fill="none"><path d="M4 4h12v9l-4 4H4V4z" stroke="currentColor" stroke-width="1.5"/></svg>`,
    todo:    `<svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    expense: `<svg viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2 9h16" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="13" r="1" fill="currentColor"/></svg>`,
  };
  const iconBg = {
    tender:  'background:var(--blue-bg);color:var(--blue-fg)',
    po:      'background:var(--amber-bg);color:var(--amber-fg)',
    note:    'background:var(--purple-bg);color:var(--purple-fg)',
    todo:    'background:var(--green-bg);color:var(--green-fg)',
    expense: 'background:var(--red-bg);color:var(--red-fg)',
  };
  const typeLabel = { tender:'Tender', po:'Pay Order', note:'Note', todo:'To-Do', expense:'Expense' };

  _tenders.forEach(t => {
    if (hit(ql, t.name, t.nit, t.agency, t.notes)) results.push({ type:'tender', title:t.name||'Untitled', sub:`${t.agency||'—'} · ${t.nit||'—'}`, href:`tender-detail.html?id=${t.id}` });
  });
  _payOrders.forEach(p => {
    if (hit(ql, p.po, p.tender, p.agency, p.bank)) results.push({ type:'po', title:p.tender||`PO ${p.po||'—'}`, sub:`${p.po||'—'} · ${p.bank||'—'}`, href:'dashboard.html' });
  });
  _notes.forEach(n => {
    if (hit(ql, n.title, n.body)) results.push({ type:'note', title:n.title||'Untitled', sub:stripHtml((n.body||'').slice(0,80))||'No content', href:`notes.html?id=${n.id}` });
  });
  _todos.forEach(t => {
    if (hit(ql, t.text)) results.push({ type:'todo', title:t.text||'—', sub:`${t.priority||'medium'} · ${t.done?'Done':'Open'}`, href:'todo.html' });
  });
  _expenses.forEach(e => {
    if (hit(ql, e.description, e.category, e.note)) results.push({ type:'expense', title:e.description||'—', sub:`${e.category||'—'} · Rs ${Number(e.amount||0).toLocaleString('en-PK')}`, href:'expenses.html' });
  });

  const show = results.slice(0, 8);
  document.getElementById('hsrCount').textContent = `${results.length} result${results.length===1?'':'s'} for "${esc(q)}"`;
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

// Close results on outside click
document.addEventListener('click', e => {
  const bar = document.querySelector('.home-search-bar');
  const res = document.getElementById('homeSearchResults');
  if (bar && !bar.contains(e.target) && res && !res.contains(e.target)) hideResults();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripHtml(s) {
  return String(s||'').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hit(q, ...fields) { return fields.some(f => (f||'').toLowerCase().includes(q)); }

function highlight(text, q) {
  if (!q || !text) return esc(text||'');
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return esc(text).replace(re, '<mark>$1</mark>');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function timeAgo(ts) {
  const diff = Math.floor(Date.now()/1000 - ts);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff/3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
  return new Date(ts*1000).toLocaleDateString('en-PK', { day:'2-digit', month:'short' });
}
