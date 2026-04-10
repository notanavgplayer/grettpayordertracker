import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allEvents  = [];
let aFilter    = 'all';
let showCount  = 40;

const ICONS = {
  fee:     `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 7v1.5M10 11.5V13M8 9a2 2 0 114 0c0 1-1 1.5-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  tender:  `<svg viewBox="0 0 20 20" fill="none"><path d="M4 3h8l4 4v10H4V3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3v4h4" stroke="currentColor" stroke-width="1.5"/></svg>`,
  po:      `<svg viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  note:    `<svg viewBox="0 0 20 20" fill="none"><path d="M4 4h12v9l-4 4H4V4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  todo:    `<svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  expense: `<svg viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2 9h16" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="13" r="1" fill="currentColor"/></svg>`,
  contact: `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M3 18c0-4 3.1-7 7-7s7 3 7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '/'; return; }
  await loadAll();
});

async function loadAll() {
  const [tRes, pRes, nRes, tdRes, eRes, cRes] = await Promise.allSettled([
    getDocs(collection(db, "tenders")),
    getDocs(collection(db, "payOrders")),
    getDocs(collection(db, "notes")),
    getDocs(collection(db, "todos")),
    getDocs(collection(db, "expenses")),
    getDocs(collection(db, "contacts")),
  ]);

  const parse = res => res.status === 'fulfilled' ? res.value.docs.map(d => ({ id: d.id, ...d.data() })) : [];

  const tenders   = parse(tRes);
  const payOrders = parse(pRes);
  const notes     = parse(nRes);
  const todos     = parse(tdRes);
  const expenses  = parse(eRes);
  const contacts  = parse(cRes);

  allEvents = [];

  tenders.forEach(t => {
    if (t.createdAt?.seconds) allEvents.push({ type:'tender', ts: t.createdAt.seconds, text: `Created tender <strong>${esc(t.name||'Untitled')}</strong>`, sub: t.agency||'—', href: `/tender-detail?id=${t.id}`, badge: t.status });
    if (t.updatedAt?.seconds && t.updatedAt.seconds !== t.createdAt?.seconds) allEvents.push({ type:'tender', ts: t.updatedAt.seconds, text: `Updated tender <strong>${esc(t.name||'Untitled')}</strong>`, sub: `Status: ${t.status||'—'}`, href: `/tender-detail?id=${t.id}` });
  });

  payOrders.forEach(p => {
    if (p.createdAt?.seconds) allEvents.push({ type:'po', ts: p.createdAt.seconds, text: `Added pay order <strong>${esc(p.po||'—')}</strong>`, sub: `${p.bank||'—'} · Rs ${Number(p.amount||0).toLocaleString('en-PK')}`, badge: p.status });
  });

  notes.forEach(n => {
    if (n.createdAt?.seconds) allEvents.push({ type:'note', ts: n.createdAt.seconds, text: `Created note <strong>${esc(n.title||'Untitled')}</strong>`, sub: (n.body||'').slice(0,60), href: '/notes' });
    if (n.updatedAt?.seconds && n.updatedAt.seconds !== n.createdAt?.seconds) allEvents.push({ type:'note', ts: n.updatedAt.seconds, text: `Updated note <strong>${esc(n.title||'Untitled')}</strong>`, href: '/notes' });
  });

  todos.forEach(t => {
    if (t.createdAt?.seconds) allEvents.push({ type:'todo', ts: t.createdAt.seconds, text: `Added task <strong>${esc(t.text||'—')}</strong>`, sub: `${t.priority||'medium'} priority`, href: '/todo' });
    if (t.done && t.createdAt?.seconds) allEvents.push({ type:'todo', ts: t.createdAt.seconds + 1, text: `Completed task <strong>${esc(t.text||'—')}</strong>`, href: '/todo' });
  });

  expenses.forEach(e => {
    if (e.createdAt?.seconds) allEvents.push({ type:'expense', ts: e.createdAt.seconds, text: `Logged expense <strong>${esc(e.description||'—')}</strong>`, sub: `${e.category||'—'} · Rs ${Number(e.amount||0).toLocaleString('en-PK')}`, href: '/expenses' });
  });

  contacts.forEach(c => {
    if (c.createdAt?.seconds) allEvents.push({ type:'contact', ts: c.createdAt.seconds, text: `Added contact <strong>${esc(c.name||'—')}</strong>`, sub: `${c.role||'—'} · ${c.organization||'—'}`, href: '/contacts' });
  });

  tenderFees.forEach(f => {
    if (f.createdAt?.seconds) allEvents.push({
      type: 'fee', ts: f.createdAt.seconds,
      text: `Recorded tender fee for <strong>${esc(f.tender||'—')}</strong>`,
      sub:  `${f.agency||'—'} · Rs ${Number(f.amount||0).toLocaleString('en-PK')}`,
      href: '/fees'
    });
  });

  allEvents.sort((a,b) => b.ts - a.ts);
  renderTimeline();
}

function renderTimeline() {
  const filtered = aFilter === 'all' ? allEvents : allEvents.filter(e => e.type === aFilter);
  const visible  = filtered.slice(0, showCount);
  const el       = document.getElementById('timelineContainer');

  if (!visible.length) {
    el.innerHTML = `
    <div class="timeline-empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="18" stroke="#c8d3e0" stroke-width="2"/>
        <path d="M24 16v10l6 4" stroke="#c8d3e0" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <p>No activity yet</p>
    </div>`;
    return;
  }

  // Group by day
  const groups = {};
  visible.forEach(e => {
    const d   = new Date(e.ts * 1000);
    const key = d.toDateString();
    if (!groups[key]) groups[key] = { label: formatDayLabel(d), events: [] };
    groups[key].events.push(e);
  });

  const badgeMap = {
    Bidding:'s-bidding', Submitted:'s-submitted', Awarded:'s-awarded',
    Lost:'s-lost', Pending:'b-pending', Returned:'b-returned',
    Encashed:'b-encashed', Forfeited:'b-forfeited',
  };

  let html = '<div class="timeline">';
  Object.values(groups).forEach(group => {
    html += `<div class="timeline-day">
      <div class="timeline-day-label">${group.label}</div>`;
    group.events.forEach(e => {
      const iconCls = `ei-${e.type}`;
      const time    = new Date(e.ts * 1000).toLocaleTimeString('en-PK', { hour:'2-digit', minute:'2-digit' });
      const badge   = e.badge ? `<span class="badge ${badgeMap[e.badge]||''}" style="font-size:10px">${e.badge}</span>` : '';
      html += `
      <div class="timeline-event ${e.href ? 'clickable' : ''}" ${e.href ? `onclick="location.href='${e.href}'"` : ''}>
        <div class="event-icon ${iconCls}">${ICONS[e.type]||''}</div>
        <div class="event-body">
          <div class="event-text">${e.text}</div>
          ${e.sub ? `<div class="event-time">${esc(e.sub)}</div>` : ''}
          <div class="event-time">${time}</div>
        </div>
        ${badge ? `<div class="event-badge">${badge}</div>` : ''}
      </div>`;
    });
    html += '</div>';
  });
  html += '</div>';

  if (filtered.length > showCount) {
    html += `<button class="load-more-btn" onclick="loadMore()">Load more (${filtered.length - showCount} remaining)</button>`;
  }

  el.innerHTML = html;
}

window.setAFilter = function(f, btn) {
  aFilter = f; showCount = 40;
  document.querySelectorAll('.af-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTimeline();
};

window.loadMore = function() {
  showCount += 40;
  renderTimeline();
};

function formatDayLabel(d) {
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  const day       = new Date(d); day.setHours(0,0,0,0);
  if (day.getTime() === today.getTime())     return 'Today';
  if (day.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-PK', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
