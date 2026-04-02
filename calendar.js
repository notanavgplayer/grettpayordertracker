import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let tenders      = [];
let payOrders    = [];

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  try {
    await loadData();
  } catch(e) {
    console.error('Failed to load calendar data:', e);
  }
  renderCalendar();
});

async function loadData() {
  const [tRes, pRes] = await Promise.allSettled([
    getDocs(collection(db, "tenders")),
    getDocs(collection(db, "payOrders")),
  ]);
  tenders   = tRes.status === 'fulfilled' ? tRes.value.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  payOrders = pRes.status === 'fulfilled' ? pRes.value.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  if (tRes.status === 'rejected') console.warn('Tenders load failed:', tRes.reason);
  if (pRes.status === 'rejected') console.warn('PayOrders load failed:', pRes.reason);
}

// ── Build event map ───────────────────────────────────────────────────────────
function buildEvents() {
  const map = {};
  const add = (dateStr, event) => {
    if (!dateStr) return;
    const key = dateStr.slice(0, 10);
    if (!map[key]) map[key] = [];
    map[key].push(event);
  };

  tenders.forEach(t => {
    if (t.submissionDate) add(t.submissionDate, {
      type: 'submission', label: t.name || 'Untitled', id: t.id,
      agency: t.agency, detail: 'Submission deadline'
    });
    if (t.openingDate) add(t.openingDate, {
      type: 'opening', label: t.name || 'Untitled', id: t.id,
      agency: t.agency, detail: 'Bid opening'
    });
  });

  payOrders.forEach(p => {
    if (p.expiry && p.status === 'Submitted') add(p.expiry, {
      type: 'expiry', label: `PO ${p.po || '—'}`, id: p.id,
      agency: p.bank, detail: 'Pay order expiry'
    });
  });

  return map;
}

// ── Render calendar ───────────────────────────────────────────────────────────
function renderCalendar() {
  const events    = buildEvents();
  const today     = new Date();
  const firstDay  = new Date(currentYear, currentMonth, 1);
  const lastDay   = new Date(currentYear, currentMonth + 1, 0);
  const startDow  = firstDay.getDay();

  document.getElementById('calMonthLabel').textContent =
    firstDay.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

  const cells = [];
  // Prev month padding
  for (let i = 0; i < startDow; i++) {
    const d = new Date(currentYear, currentMonth, -startDow + i + 1);
    cells.push({ date: d, current: false });
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ date: new Date(currentYear, currentMonth, d), current: true });
  }
  // Next month padding
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ date: new Date(currentYear, currentMonth + 1, i), current: false });
  }

  const container = document.getElementById('calDays');
  container.innerHTML = cells.map(cell => {
    const key   = dateKey(cell.date);
    const isToday = sameDay(cell.date, today);
    const dayEvents = events[key] || [];

    const evHtml = dayEvents.slice(0, 3).map(e => `
      <div class="cal-event ${e.type}"
        onmouseenter="showTooltip(event,'${esc(e.label)}','${esc(e.detail)}','${esc(e.agency||'')}')"
        onmouseleave="hideTooltip()"
        onclick="e => { event.stopPropagation(); ${e.type !== 'expiry' ? `window.location.href='tender-detail.html?id=${e.id}'` : ''} }"
        title="${esc(e.label)}">
        ${esc(e.label)}
      </div>`).join('');

    const more = dayEvents.length > 3 ? `<div style="font-size:9px;color:var(--muted);padding:1px 4px">+${dayEvents.length-3} more</div>` : '';

    return `
    <div class="cal-cell ${!cell.current ? 'other-month' : ''} ${isToday ? 'today' : ''}">
      <div class="cal-date">${cell.date.getDate()}</div>
      ${evHtml}${more}
    </div>`;
  }).join('');

  renderUpcoming(events);
}

function renderUpcoming(events) {
  const today   = new Date(); today.setHours(0,0,0,0);
  const endMonth = new Date(currentYear, currentMonth + 1, 0);

  const upcoming = [];
  Object.entries(events).forEach(([key, evs]) => {
    const d = new Date(key + 'T00:00:00');
    if (d >= today && d <= endMonth) {
      evs.forEach(e => upcoming.push({ ...e, date: d, dateStr: key }));
    }
  });
  upcoming.sort((a,b) => a.date - b.date);

  const el = document.getElementById('upcomingList');
  if (!upcoming.length) { el.innerHTML = '<div class="panel-empty" style="padding:1.5rem;text-align:center;font-size:13px;color:var(--muted)">No events this month.</div>'; return; }

  const typeLabel = { submission: 'Submission', opening: 'Bid Opening', expiry: 'PO Expiry' };
  const typeBadge = { submission: 'b-pending', opening: 'b-submitted', expiry: 'b-encashed' };

  el.innerHTML = upcoming.map(e => `
    <div class="upcoming-item" onclick="${e.type !== 'expiry' ? `window.location.href='tender-detail.html?id=${e.id}'` : ''}">
      <div class="upcoming-date-box">
        <div class="upcoming-date-day">${e.date.getDate()}</div>
        <div class="upcoming-date-month">${e.date.toLocaleDateString('en-PK',{month:'short'})}</div>
      </div>
      <div class="upcoming-divider"></div>
      <div class="upcoming-info">
        <div class="upcoming-name">${esc(e.label)}</div>
        <div class="upcoming-meta">${esc(e.agency||'—')} · ${typeLabel[e.type]}</div>
      </div>
      <div class="upcoming-badge">
        <span class="badge ${typeBadge[e.type]||''}">${typeLabel[e.type]}</span>
      </div>
    </div>`).join('');
}

// ── Nav ───────────────────────────────────────────────────────────────────────
window.changeMonth = function(dir) {
  currentMonth += dir;
  if (currentMonth > 11) { currentMonth = 0;  currentYear++; }
  if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
  renderCalendar();
};
window.goToday = function() {
  currentYear  = new Date().getFullYear();
  currentMonth = new Date().getMonth();
  renderCalendar();
};

// ── Tooltip ───────────────────────────────────────────────────────────────────
window.showTooltip = function(event, label, detail, agency) {
  const el = document.getElementById('calTooltip');
  el.innerHTML = `<strong>${label}</strong>${detail}<br>${agency ? agency : ''}`;
  el.style.display = 'block';
  el.style.left = (event.clientX + 10) + 'px';
  el.style.top  = (event.clientY + 10) + 'px';
};
window.hideTooltip = function() {
  document.getElementById('calTooltip').style.display = 'none';
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function sameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
}
