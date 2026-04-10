import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let tenders = [], payOrders = [], expenses = [], tenderFees = [];
let currentYear = new Date().getFullYear();

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CAT_COLORS = {
  'Fuel / Transport':'#e8940a','Printing & Documentation':'#185fa5',
  'Courier / Postage':'#5d3fa5','Site Visit Costs':'#0e6b4a',
  'Tender Fees':'#7a4500','Office Supplies':'#6b7a90',
  'Labour / Daily Wages':'#c0392b','Equipment & Tools':'#1a56b0',
  'Food & Entertainment':'#9d174d','Miscellaneous':'#6b7a90',
};

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '/'; return; }
  document.getElementById('yearLabel').textContent = currentYear;
  await loadAll();
  renderAll();
});

async function loadAll() {
  const [tRes, pRes, eRes, fRes] = await Promise.allSettled([
    getDocs(collection(db, "tenders")),
    getDocs(collection(db, "payOrders")),
    getDocs(collection(db, "expenses")),
    getDocs(collection(db, "tenderFees")),
  ]);
  tenders    = tRes.status === 'fulfilled' ? tRes.value.docs.map(d => ({id:d.id,...d.data()})) : [];
  payOrders  = pRes.status === 'fulfilled' ? pRes.value.docs.map(d => ({id:d.id,...d.data()})) : [];
  expenses   = eRes.status === 'fulfilled' ? eRes.value.docs.map(d => ({id:d.id,...d.data()})) : [];
  tenderFees = fRes.status === 'fulfilled' ? fRes.value.docs.map(d => ({id:d.id,...d.data()})) : [];
}

function renderAll() {
  document.getElementById('yearLabel').textContent = currentYear;
  const yt = tenders.filter(t => inYear(t.submissionDate || t.createdAt, currentYear));
  const ye = expenses.filter(e => inYear(e.date, currentYear));
  const yp = payOrders.filter(p => inYear(p.issued, currentYear));
  const yf = tenderFees.filter(f => inYear(f.date, currentYear));

  renderTopStats(yt, ye, yf);
  renderTenderChart(yt);
  renderPOReport(yp);
  renderExpReport(ye);
  renderAgencyReport(yt);
  renderMonthlyExpReport(ye);
}

// ── TOP STATS ─────────────────────────────────────────────────────────────────
function renderTopStats(yt, ye, yf) {
  const won  = yt.filter(t => t.status === 'Awarded').length;
  const lost = yt.filter(t => t.status === 'Lost').length;
  const rate = yt.length ? Math.round((won / yt.length) * 100) : 0;
  const bidVal   = yt.reduce((a,b) => a+(+b.value||0), 0);
  const expTotal = ye.reduce((a,b) => a+(+b.amount||0), 0);
  const feeTotal = yf.reduce((a,b) => a+(+b.amount||0), 0);

  document.getElementById('rsTotalTenders').textContent = yt.length;
  document.getElementById('rsTenderSub').textContent    = `${currentYear}`;
  document.getElementById('rsWon').textContent          = won;
  document.getElementById('rsWonRate').textContent      = yt.length ? `${rate}% win rate` : '—';
  document.getElementById('rsLost').textContent         = lost;
  document.getElementById('rsBidValue').textContent     = fmtPKR(bidVal);
  document.getElementById('rsExpenses').textContent     = fmtPKR(expTotal);
  const feeEl = document.getElementById('rsFees');
  if (feeEl) feeEl.textContent = fmtPKR(feeTotal);
}

// ── TENDER MONTHLY CHART ──────────────────────────────────────────────────────
function renderTenderChart(yt) {
  const monthly = MONTHS.map((m, i) => {
    const monthTenders = yt.filter(t => {
      const d = t.submissionDate || '';
      const ts = t.createdAt?.seconds ? new Date(t.createdAt.seconds*1000) : null;
      const month = d ? parseInt(d.split('-')[1])-1 : (ts ? ts.getMonth() : -1);
      return month === i;
    });
    return {
      label: m,
      won:   monthTenders.filter(t => t.status==='Awarded').length,
      lost:  monthTenders.filter(t => t.status==='Lost').length,
      bid:   monthTenders.filter(t => ['Bidding','Submitted'].includes(t.status)).length,
      canc:  monthTenders.filter(t => t.status==='Cancelled').length,
      total: monthTenders.length,
    };
  });

  const maxVal = Math.max(...monthly.map(m => m.total), 1);
  const el = document.getElementById('tenderBarChart');

  if (monthly.every(m => m.total === 0)) {
    el.innerHTML = '<div class="no-data" style="width:100%">No tender data for this year yet.</div>';
    return;
  }

  el.innerHTML = monthly.map(m => {
    const totalH = Math.round((m.total / maxVal) * 100);
    const wonH   = m.total ? Math.round((m.won  / m.total) * totalH) : 0;
    const lostH  = m.total ? Math.round((m.lost / m.total) * totalH) : 0;
    const bidH   = m.total ? Math.round((m.bid  / m.total) * totalH) : 0;
    const cancH  = totalH - wonH - lostH - bidH;
    return `
    <div class="bar-col">
      <div class="bar-val">${m.total || ''}</div>
      <div class="bar-stack" style="height:${Math.max(totalH,2)}px">
        ${m.canc  ? `<div class="bar-seg cancelled" style="height:${cancH}px"></div>` : ''}
        ${m.bid   ? `<div class="bar-seg bid"       style="height:${bidH}px"></div>` : ''}
        ${m.lost  ? `<div class="bar-seg lost"      style="height:${lostH}px"></div>` : ''}
        ${m.won   ? `<div class="bar-seg won"       style="height:${wonH}px"></div>` : ''}
      </div>
      <div class="bar-label">${m.label}</div>
    </div>`;
  }).join('');
}

// ── PAY ORDERS ────────────────────────────────────────────────────────────────
function renderPOReport(yp) {
  const total    = yp.reduce((a,b)=>a+(+b.amount||0),0);
  const returned = yp.filter(p=>p.status==='Returned').reduce((a,b)=>a+(+b.amount||0),0);
  const encashed = yp.filter(p=>p.status==='Encashed').reduce((a,b)=>a+(+b.amount||0),0);
  const pending  = yp.filter(p=>p.status==='Submitted').reduce((a,b)=>a+(+b.amount||0),0);

  const el = document.getElementById('poReport');
  if (!yp.length) { el.innerHTML = '<div class="no-data">No pay order data for this year.</div>'; return; }

  const stats = [
    { label:'Total Issued',   val: fmtPKR(total),    color: 'var(--navy)' },
    { label:'Returned (Safe)',val: fmtPKR(returned), color: 'var(--green-fg)' },
    { label:'At Risk (Sub.)', val: fmtPKR(pending),  color: 'var(--amber-fg)' },
    { label:'Encashed (Lost)',val: fmtPKR(encashed), color: 'var(--red-fg)' },
    { label:'Count',          val: yp.length,        color: 'var(--navy)' },
  ];
  el.innerHTML = `
  <table class="report-table">
    ${stats.map(s => `<tr><td style="color:var(--muted)">${s.label}</td><td style="font-weight:600;color:${s.color};text-align:right;font-family:IBM Plex Mono,monospace">${s.val}</td></tr>`).join('')}
  </table>`;
}

// ── EXPENSES BY CATEGORY ──────────────────────────────────────────────────────
function renderExpReport(ye) {
  const el = document.getElementById('expReport');
  if (!ye.length) { el.innerHTML = '<div class="no-data">No expense data for this year.</div>'; return; }
  const totals = {};
  ye.forEach(e => { totals[e.category] = (totals[e.category]||0) + (+e.amount||0); });
  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  const max = sorted[0][1];
  el.innerHTML = sorted.map(([cat, total]) => {
    const color = CAT_COLORS[cat] || '#6b7a90';
    const pct   = Math.round((total/max)*100);
    return `<div class="horiz-bar-item">
      <div class="horiz-bar-top"><span class="horiz-bar-name">${cat}</span><span class="horiz-bar-val">Rs ${total.toLocaleString('en-PK')}</span></div>
      <div class="horiz-bar-bg"><div class="horiz-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
  }).join('');
}

// ── TOP AGENCIES ──────────────────────────────────────────────────────────────
function renderAgencyReport(yt) {
  const el = document.getElementById('agencyReport');
  if (!yt.length) { el.innerHTML = '<div class="no-data">No tender data for this year.</div>'; return; }
  const counts = {};
  yt.forEach(t => { const a = t.agency||'Unknown'; counts[a] = (counts[a]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const max = sorted[0][1];
  el.innerHTML = sorted.map(([agency, count]) => {
    const pct = Math.round((count/max)*100);
    return `<div class="horiz-bar-item">
      <div class="horiz-bar-top"><span class="horiz-bar-name">${agency}</span><span class="horiz-bar-val">${count} tender${count>1?'s':''}</span></div>
      <div class="horiz-bar-bg"><div class="horiz-bar-fill" style="width:${pct}%;background:var(--navy)"></div></div>
    </div>`;
  }).join('');
}

// ── MONTHLY EXPENSES ──────────────────────────────────────────────────────────
function renderMonthlyExpReport(ye) {
  const el = document.getElementById('monthlyExpReport');
  if (!ye.length) { el.innerHTML = '<div class="no-data">No expense data for this year.</div>'; return; }
  const monthly = MONTHS.map((m,i) => {
    const key   = `${currentYear}-${String(i+1).padStart(2,'0')}`;
    const total = ye.filter(e=>(e.date||'').startsWith(key)).reduce((a,b)=>a+(+b.amount||0),0);
    return { label: m, total };
  });
  const max = Math.max(...monthly.map(m=>m.total),1);
  el.innerHTML = monthly.map(m => {
    const pct = Math.round((m.total/max)*100);
    return `<div class="horiz-bar-item">
      <div class="horiz-bar-top"><span class="horiz-bar-name">${m.label}</span><span class="horiz-bar-val">${m.total?'Rs '+m.total.toLocaleString('en-PK'):'—'}</span></div>
      <div class="horiz-bar-bg"><div class="horiz-bar-fill" style="width:${pct}%;background:var(--amber)"></div></div>
    </div>`;
  }).join('');
}

// ── Year navigation ───────────────────────────────────────────────────────────
window.changeYear = function(dir) {
  currentYear += dir;
  renderAll();
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function inYear(val, year) {
  if (!val) return false;
  if (typeof val === 'string') return val.startsWith(`${year}-`);
  if (val?.seconds) return new Date(val.seconds*1000).getFullYear() === year;
  return false;
}
function fmtPKR(n) { return 'Rs ' + Number(n||0).toLocaleString('en-PK'); }
