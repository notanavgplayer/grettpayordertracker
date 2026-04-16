import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, updateDoc,
  deleteDoc, doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let fees      = [];
let feeFilter = 'all';
let editId    = null;
let deleteId  = null;

onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = '/'; return; }
  loadFees();
});

async function loadFees() {
  try {
    const q    = query(collection(db, "tenderFees"), orderBy("date", "desc"));
    const snap = await getDocs(q);
    fees       = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Failed to load fees:', e);
    fees = [];
  }
  renderAll();
}

function renderAll() { renderCards(); renderFeeTable(); }

function renderCards() {
  const today    = new Date();
  const monthKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const total    = fees.filter(f => f.status !== 'Refunded').reduce((a,b) => a+(+b.amount||0), 0);
  const month    = fees.filter(f => (f.date||'').startsWith(monthKey)).reduce((a,b) => a+(+b.amount||0), 0);
  const refunded = fees.filter(f => f.status === 'Refunded').reduce((a,b) => a+(+b.amount||0), 0);
  document.getElementById('fcTotal').textContent    = fmtPKR(total);
  document.getElementById('fcMonth').textContent    = fmtPKR(month);
  document.getElementById('fcRefunded').textContent = fmtPKR(refunded);
  document.getElementById('fcCount').textContent    = fees.length;
}

window.renderFeeTable = function() {
  const q   = (document.getElementById('feeSearch').value || '').toLowerCase();
  const rows = fees.filter(f => {
    const mF = feeFilter === 'all' || f.status === feeFilter;
    const mQ = !q || [f.tender,f.agency,f.nit,f.receipt].some(v=>(v||'').toLowerCase().includes(q));
    return mF && mQ;
  });

  const tbody = document.getElementById('feeTbody');
  const empty = document.getElementById('feesEmpty');
  const wrap  = document.querySelector('.fees-table-wrap');

  if (!rows.length) {
    tbody.innerHTML = ''; empty.style.display = 'block'; return;
  }
  empty.style.display = 'none';
  const total = rows.reduce((a,b) => a+(+b.amount||0), 0);
  const badgeCls = { Paid:'b-returned', Pending:'b-pending', Refunded:'b-refunded' };

  tbody.innerHTML = rows.map(f => `
    <tr>
      <td><div class="fee-tender-name">${esc(f.tender||'—')}</div></td>
      <td style="color:var(--muted);font-size:12px">${esc(f.agency||'—')}</td>
      <td style="color:var(--muted);font-size:12px">${esc(f.nit||'—')}</td>
      <td><span class="fee-receipt">${esc(f.receipt||'—')}</span></td>
      <td style="font-size:12px;color:var(--muted)">${esc(f.method||'—')}</td>
      <td class="fee-date">${fmtDate(f.date)}</td>
      <td class="fee-amount">Rs ${Number(f.amount||0).toLocaleString('en-PK')}</td>
      <td><span class="badge ${badgeCls[f.status]||'b-pending'}">${f.status||'—'}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn-icon" title="Edit" aria-label="Edit fee" onclick="openEditFee('${f.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M8 1.5l2.5 2.5L3 11H.5V8.5L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-icon del" title="Delete" aria-label="Delete fee" onclick="openFeeConfirm('${f.id}')">
            <svg viewBox="0 0 12 12" fill="none"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('') + `
    <tr style="border-top:2px solid var(--border)">
      <td colspan="6" style="font-weight:600;color:var(--navy);padding:10px 14px">Total</td>
      <td class="fee-amount" style="font-weight:700;color:var(--navy)">Rs ${total.toLocaleString('en-PK')}</td>
      <td colspan="2"></td>
    </tr>`;
};

window.setFeeFilter = function(f, btn) {
  feeFilter = f;
  document.querySelectorAll('.fees-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFeeTable();
};

window.openFeeModal = function() {
  editId = null;
  document.getElementById('feeModalTitle').textContent = 'Add Tender Fee';
  ['ff_tender','ff_agency','ff_nit','ff_amount','ff_receipt','ff_note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ff_date').value   = new Date().toISOString().split('T')[0];
  document.getElementById('ff_method').value = 'Cash';
  document.getElementById('ff_status').value = 'Paid';
  document.getElementById('feeSaveBtn').textContent = 'Save';
  document.getElementById('feeModal').classList.add('open');
  setTimeout(() => document.getElementById('ff_tender').focus(), 100);
};

window.openEditFee = function(id) {
  const f = fees.find(x => x.id === id);
  if (!f) return;
  editId = id;
  document.getElementById('feeModalTitle').textContent = 'Edit Fee';
  document.getElementById('ff_tender').value  = f.tender  || '';
  document.getElementById('ff_agency').value  = f.agency  || '';
  document.getElementById('ff_nit').value     = f.nit     || '';
  document.getElementById('ff_amount').value  = f.amount  || '';
  document.getElementById('ff_date').value    = f.date    || '';
  document.getElementById('ff_method').value  = f.method  || 'Cash';
  document.getElementById('ff_receipt').value = f.receipt || '';
  document.getElementById('ff_status').value  = f.status  || 'Paid';
  document.getElementById('ff_note').value    = f.note    || '';
  document.getElementById('feeSaveBtn').textContent = 'Update';
  document.getElementById('feeModal').classList.add('open');
};

window.closeFeeModal = function() {
  document.getElementById('feeModal').classList.remove('open'); editId = null;
};

window.saveFee = async function() {
  const btn    = document.getElementById('feeSaveBtn');
  const tender = document.getElementById('ff_tender').value.trim();
  const amount = document.getElementById('ff_amount').value;
  if (!tender) { toast('Enter a tender name.'); return; }
  if (!amount) { toast('Enter an amount.'); return; }
  // Prevent duplicate entries (same tender + amount + date)
  if (!editId) {
    const date = document.getElementById('ff_date').value;
    const existing = fees.find(f => f.tender === tender && String(f.amount) === String(amount) && f.date === date);
    if (existing) { toast('A fee entry for this tender with the same amount and date already exists.'); return; }
  }
  const data = {
    tender, amount,
    agency:  document.getElementById('ff_agency').value.trim(),
    nit:     document.getElementById('ff_nit').value.trim(),
    date:    document.getElementById('ff_date').value,
    method:  document.getElementById('ff_method').value,
    receipt: document.getElementById('ff_receipt').value.trim(),
    status:  document.getElementById('ff_status').value,
    note:    document.getElementById('ff_note').value.trim(),
  };
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (editId) {
      await updateDoc(doc(db, "tenderFees", editId), data);
      const idx = fees.findIndex(f => f.id === editId);
      if (idx > -1) fees[idx] = { ...fees[idx], ...data };
      fees.sort((a,b) => (b.date||'').localeCompare(a.date||''));
      toast('Updated.');
    } else {
      data.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, "tenderFees"), data);
      fees.unshift({ id: ref.id, ...data });
      toast('Fee recorded.');
    }
    closeFeeModal(); renderAll();
  } catch(e) { console.error(e); toast('Error saving.'); }
  finally { btn.disabled = false; btn.textContent = editId ? 'Update' : 'Save'; }
};

window.openFeeConfirm  = id => { deleteId = id; document.getElementById('feeConfirmOverlay').classList.add('open'); };
window.closeFeeConfirm = ()  => { document.getElementById('feeConfirmOverlay').classList.remove('open'); deleteId = null; };
window.confirmFeeDelete = async function() {
  if (!deleteId) return;
  await deleteDoc(doc(db, "tenderFees", deleteId));
  fees = fees.filter(f => f.id !== deleteId);
  closeFeeConfirm(); renderAll(); toast('Deleted.');
};

window.exportFeesPDF = function() {
  if (!fees.length) { toast('No fees to export.'); return; }
  const total    = fees.reduce((a,b) => a+(+b.amount||0), 0);
  const refunded = fees.filter(f=>f.status==='Refunded').reduce((a,b)=>a+(+b.amount||0),0);
  const rows = fees.map(f => `<tr><td style="padding:4px 8px;font-weight:500">${f.tender||'—'}</td><td style="padding:4px 8px">${f.agency||'—'}</td><td style="padding:4px 8px">${f.nit||'—'}</td><td style="padding:4px 8px">${f.receipt||'—'}</td><td style="padding:4px 8px">${f.method||'—'}</td><td style="padding:4px 8px">${fmtDate(f.date)}</td><td style="padding:4px 8px;text-align:right">Rs ${Number(f.amount||0).toLocaleString('en-PK')}</td><td style="padding:4px 8px">${f.status||'—'}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tender Fee Register</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;color:#0f2a4a;padding:24px}.header{background:#0f2a4a;color:white;padding:18px 24px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}.header h1{margin:0 0 4px;font-size:17px}.header p{margin:0;opacity:.5;font-size:10px}.summary{display:flex;gap:10px;margin-bottom:16px}.sum-box{flex:1;background:#f4f6f9;border-radius:6px;padding:10px 12px}.sum-box .lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7a90;margin-bottom:3px}.sum-box .val{font-size:14px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#0f2a4a;color:white;padding:6px 8px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}tr:nth-child(even) td{background:#f8fafc}.footer{margin-top:24px;text-align:center;font-size:9px;color:#6b7a90;border-top:1px solid #dce3ed;padding-top:10px}</style></head><body>
<div class="header"><div><h1>Tender Fee Register</h1><p>Grett Engineering Solutions</p></div><div style="text-align:right;font-size:20px;font-weight:700;color:#e8940a">Rs ${total.toLocaleString('en-PK')}</div></div>
<div class="summary"><div class="sum-box"><div class="lbl">Total Paid</div><div class="val">Rs ${total.toLocaleString('en-PK')}</div></div><div class="sum-box"><div class="lbl">Refunded</div><div class="val" style="color:#0e6b4a">Rs ${refunded.toLocaleString('en-PK')}</div></div><div class="sum-box"><div class="lbl">Net Cost</div><div class="val" style="color:#c0392b">Rs ${(total-refunded).toLocaleString('en-PK')}</div></div><div class="sum-box"><div class="lbl">Entries</div><div class="val">${fees.length}</div></div></div>
<table><thead><tr><th>Tender</th><th>Agency</th><th>NIT</th><th>Receipt</th><th>Method</th><th>Date</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer">Grett Engineering Solutions · Generated ${new Date().toLocaleString('en-PK')}</div></body></html>`;
  const win = window.open('','_blank'); win.document.write(html); win.document.close(); win.focus(); setTimeout(()=>win.print(),500);
};

['feeModal','feeConfirmOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) { if (id==='feeModal') closeFeeModal(); else closeFeeConfirm(); }
  });
});

function fmtPKR(n) { return 'Rs ' + Number(n||0).toLocaleString('en-PK'); }
function fmtDate(d) { if (!d) return '—'; return new Date(d+'T00:00:00').toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'}); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
let toastTimer;
function toast(msg) { const el=document.getElementById('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3000); }
