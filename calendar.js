import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let tenders      = [];
let payOrders    = [];
let customEvents = [];
let editingEventId = null;

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '/'; return; }
  try { await loadData(); } catch(e) { console.error('Failed to load calendar data:', e); }
  renderCalendar();
});

async function loadData() {
  const [tRes, pRes, eRes] = await Promise.allSettled([
    getDocs(collection(db, "tenders")),
    getDocs(collection(db, "payOrders")),
    getDocs(collection(db, "calendarEvents")),
  ]);
  tenders      = tRes.status === 'fulfilled' ? tRes.value.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  payOrders    = pRes.status === 'fulfilled' ? pRes.value.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  customEvents = eRes.status === 'fulfilled' ? eRes.value.docs.map(d => ({ id: d.id, ...d.data() })) : [];
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
      agency: t.agency, detail: 'Submission deadline', source: 'tender'
    });
    if (t.openingDate) add(t.openingDate, {
      type: 'opening', label: t.name || 'Untitled', id: t.id,
      agency: t.agency, detail: 'Bid opening', source: 'tender'
    });
  });

  payOrders.forEach(p => {
    if (p.expiry && p.status === 'Submitted') add(p.expiry, {
      type: 'expiry', label: `PO ${p.po || '—'}`, id: p.id,
      agency: p.bank, detail: 'Pay order expiry', source: 'po'
    });
  });

  customEvents.forEach(e => {
    if (e.date) add(e.date, {
      type: 'custom', label: e.title || 'Untitled', id: e.id,
      agency: '', detail: e.eventType || 'Event', notes: e.notes || '',
      source: 'custom', eventType: e.eventType
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
  // Empty padding cells for days before the 1st
  for (let i = 0; i < startDow; i++) {
    cells.push({ date: null, current: false });
  }
  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ date: new Date(currentYear, currentMonth, d), current: true });
  }
  // Pad to complete the last row (to fill up to multiple of 7)
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, current: false });
  }

  const container = document.getElementById('calDays');
  container.innerHTML = cells.map(cell => {
    if (!cell.date) {
      // Empty padding cell
      return `<div class="cal-cell other-month"></div>`;
    }

    const key   = dateKey(cell.date);
    const isToday = sameDay(cell.date, today);
    const dayEvents = events[key] || [];

    const evHtml = dayEvents.slice(0, 3).map(e => `
      <div class="cal-event ${e.type}"
        onmouseenter="showTooltip(event,'${esc(e.label)}','${esc(e.detail)}','${esc(e.agency||'')}')"
        onmouseleave="hideTooltip()"
        title="${esc(e.label)}">
        ${esc(e.label)}
      </div>`).join('');

    const more = dayEvents.length > 3 ? `<div style="font-size:9px;color:var(--muted);padding:1px 4px">+${dayEvents.length-3} more</div>` : '';

    return `
    <div class="cal-cell current-month ${isToday ? 'today' : ''}"
         onclick="openDayDetail('${key}')">
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
  if (!upcoming.length) {
    el.innerHTML = '<div style="padding:1.5rem;text-align:center;font-size:13px;color:var(--muted)">No events this month.</div>';
    return;
  }

  const typeLabel = { submission: 'Submission', opening: 'Bid Opening', expiry: 'PO Expiry', custom: 'Event' };
  const typeBadge = { submission: 'b-pending', opening: 'b-submitted', expiry: 'b-encashed', custom: 'b-forfeited' };

  el.innerHTML = upcoming.map(e => {
    const href = e.source === 'tender' ? `/tender-detail?id=${e.id}` : '';
    const customLabel = e.source === 'custom' ? (e.eventType || 'Event') : typeLabel[e.type];
    return `
    <div class="upcoming-item" onclick="${href ? `window.location.href='${href}'` : e.source === 'custom' ? `openEditEvent('${e.id}')` : ''}">
      <div class="upcoming-date-box">
        <div class="upcoming-date-day">${e.date.getDate()}</div>
        <div class="upcoming-date-month">${e.date.toLocaleDateString('en-PK',{month:'short'})}</div>
      </div>
      <div class="upcoming-divider"></div>
      <div class="upcoming-info">
        <div class="upcoming-name">${esc(e.label)}</div>
        <div class="upcoming-meta">${esc(e.agency||customLabel)}${e.agency ? ' · ' + customLabel : ''}</div>
      </div>
      <div class="upcoming-badge">
        <span class="badge ${typeBadge[e.type]||'b-forfeited'}">${customLabel}</span>
      </div>
    </div>`;
  }).join('');
}

// ── Day Detail Panel ─────────────────────────────────────────────────────────
window.openDayDetail = function(dateStr) {
  const events = buildEvents();
  const dayEvents = events[dateStr] || [];
  const d = new Date(dateStr + 'T00:00:00');
  const overlay = document.getElementById('dayDetailOverlay');

  document.getElementById('dayDetailTitle').textContent =
    d.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  overlay.dataset.date = dateStr;

  const el = document.getElementById('dayDetailEvents');
  const dotColors = { submission: '#e8940a', opening: '#185fa5', expiry: '#c0392b', custom: '#5d3fa5' };
  const typeLabels = { submission: 'Submission', opening: 'Bid Opening', expiry: 'PO Expiry' };

  if (!dayEvents.length) {
    el.innerHTML = '<div class="day-no-events">No events on this date</div>';
  } else {
    el.innerHTML = dayEvents.map(e => `
      <div class="day-event-item">
        <div class="day-event-dot" style="background:${dotColors[e.type]||'#5d3fa5'}"></div>
        <div class="day-event-info">
          <div class="day-event-title">${esc(e.label)}</div>
          <div class="day-event-meta">${esc(e.agency||'')}${e.agency ? ' · ' : ''}${e.source === 'custom' ? (e.eventType||'Event') : (typeLabels[e.type]||'Event')}</div>
        </div>
        ${e.source === 'custom' ? `<button class="day-event-edit" onclick="event.stopPropagation();closeDayDetail();openEditEvent('${e.id}')" title="Edit">
          <svg viewBox="0 0 12 12" fill="none" width="12" height="12"><path d="M8 1.5l2.5 2.5L3 11H.5V8.5L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
        </button>` : ''}
      </div>`).join('');
  }

  overlay.classList.add('open');
};

window.closeDayDetail = function() {
  document.getElementById('dayDetailOverlay').classList.remove('open');
};
document.getElementById('dayDetailOverlay').addEventListener('click', e => {
  if (e.target.id === 'dayDetailOverlay') closeDayDetail();
});

// ── Event Modal ──────────────────────────────────────────────────────────────
window.openEventModal = function(prefillDate) {
  editingEventId = null;
  document.getElementById('eventModalTitle').textContent = 'New Event';
  document.getElementById('ev_title').value = '';
  document.getElementById('ev_date').value = prefillDate || dateKey(new Date());
  document.getElementById('ev_type').value = 'deadline';
  document.getElementById('ev_notes').value = '';
  document.getElementById('evDeleteBtn').style.display = 'none';
  document.getElementById('evSaveBtn').textContent = 'Save Event';
  document.getElementById('eventModalOverlay').classList.add('open');
};

window.openEditEvent = function(id) {
  const ev = customEvents.find(e => e.id === id);
  if (!ev) return;
  editingEventId = id;
  document.getElementById('eventModalTitle').textContent = 'Edit Event';
  document.getElementById('ev_title').value = ev.title || '';
  document.getElementById('ev_date').value = ev.date || '';
  document.getElementById('ev_type').value = ev.eventType || 'deadline';
  document.getElementById('ev_notes').value = ev.notes || '';
  document.getElementById('evDeleteBtn').style.display = 'inline-block';
  document.getElementById('evSaveBtn').textContent = 'Update';
  document.getElementById('eventModalOverlay').classList.add('open');
};

window.closeEventModal = function() {
  document.getElementById('eventModalOverlay').classList.remove('open');
  editingEventId = null;
};
document.getElementById('eventModalOverlay').addEventListener('click', e => {
  if (e.target.id === 'eventModalOverlay') closeEventModal();
});

window.saveEvent = async function() {
  const title = document.getElementById('ev_title').value.trim();
  const date  = document.getElementById('ev_date').value;
  const type  = document.getElementById('ev_type').value;
  const notes = document.getElementById('ev_notes').value.trim();

  if (!title) { toast('Please enter an event title.'); return; }
  if (!date)  { toast('Please select a date.'); return; }

  const btn = document.getElementById('evSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (editingEventId) {
      await updateDoc(doc(db, "calendarEvents", editingEventId), {
        title, date, eventType: type, notes, updatedAt: serverTimestamp()
      });
      const ev = customEvents.find(e => e.id === editingEventId);
      if (ev) { ev.title = title; ev.date = date; ev.eventType = type; ev.notes = notes; }
      toast('Event updated.');
    } else {
      const ref = await addDoc(collection(db, "calendarEvents"), {
        title, date, eventType: type, notes, createdAt: serverTimestamp()
      });
      customEvents.push({ id: ref.id, title, date, eventType: type, notes });
      toast('Event added.');
    }
    closeEventModal();
    renderCalendar();
  } catch(e) {
    console.error('Save event error:', e);
    toast('Error saving event.');
  } finally {
    btn.disabled = false;
    btn.textContent = editingEventId ? 'Update' : 'Save Event';
  }
};

window.deleteEvent = async function() {
  if (!editingEventId) return;
  if (!confirm('Delete this event?')) return;
  try {
    await deleteDoc(doc(db, "calendarEvents", editingEventId));
    customEvents = customEvents.filter(e => e.id !== editingEventId);
    toast('Event deleted.');
    closeEventModal();
    renderCalendar();
  } catch(e) {
    console.error('Delete event error:', e);
    toast('Error deleting event.');
  }
};

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
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
