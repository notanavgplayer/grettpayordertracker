import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'
import { rowsToCSV } from './csv'
import { documentData, serializeBackupValue } from './data'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function exportPayOrdersCSV(payOrders) {
  if (!payOrders.length) return false
  const headers = ['PO Number', 'Bank', 'NIT / Ref', 'Tender / Project', 'Agency', 'Amount (PKR)', 'Date Submitted', 'Status', 'Bid Result', 'Notes']
  const rows = payOrders.map((p) => [
    p.po, p.bank, p.nit, p.tender, p.agency,
    p.amount, p.submitted, p.status, p.bidResult, p.notes,
  ])
  const csv = rowsToCSV(headers, rows, new Set([5]))
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `pay-orders-${new Date().toISOString().slice(0, 10)}.csv`)
  return true
}

export function exportTendersCSV(tenders) {
  if (!tenders.length) return false
  const headers = ['Name', 'NIT / Ref', 'Agency', 'Value (PKR)', 'Status', 'Submission Date', 'Opening Date', 'Linked PO']
  const rows = tenders.map((t) => [t.name, t.nit, t.agency, t.value, t.status, t.submissionDate, t.openingDate, t.linkedPO])
  const csv = rowsToCSV(headers, rows, new Set([3]))
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `tenders-${new Date().toISOString().slice(0, 10)}.csv`)
  return true
}

export function exportExpensesCSV(expenses) {
  if (!expenses.length) return false
  const headers = ['Description', 'Category', 'Amount (PKR)', 'Date', 'Related Tender', 'Notes']
  const rows = expenses.map((e) => [e.description, e.category, e.amount, e.date, e.tenderId, e.note])
  const csv = rowsToCSV(headers, rows, new Set([2]))
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `expenses-${new Date().toISOString().slice(0, 10)}.csv`)
  return true
}

export function exportPayOrdersPDF(payOrders) {
  if (!payOrders.length) return false
  const total = payOrders.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const atRisk = payOrders.filter((p) => p.status === 'Submitted').length
  const returned = payOrders.filter((p) => p.status === 'Returned').length
  const encashed = payOrders.filter((p) => p.status === 'Encashed').length

  const formatPKR = (n) => `PKR ${Number(n || 0).toLocaleString()}`

  const rows = payOrders
    .map(
      (p) => `<tr>
        <td>${escapeHtml(p.po)}</td><td>${escapeHtml(p.bank)}</td><td>${escapeHtml(p.nit)}</td>
        <td>${escapeHtml(p.tender)}</td><td>${escapeHtml(p.agency)}</td>
        <td>${formatPKR(p.amount)}</td><td>${escapeHtml(p.submitted)}</td>
        <td>${escapeHtml(p.status)}</td><td>${escapeHtml(p.bidResult)}</td>
      </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Pay Orders Export</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:24px}
    h1{font-size:18px;margin-bottom:4px}
    .meta{color:#666;margin-bottom:16px;font-size:11px}
    .summary{display:flex;gap:12px;margin-bottom:16px}
    .s-card{background:#f4f6f9;border-radius:8px;padding:10px 14px;min-width:100px}
    .s-card .label{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.05em}
    .s-card .val{font-size:16px;font-weight:700;margin-top:2px}
    table{width:100%;border-collapse:collapse}
    th{background:#0f2a4a;color:#fff;padding:7px 8px;text-align:left;font-size:11px}
    td{padding:6px 8px;border-bottom:1px solid #e8ecf4;font-size:11px}
    tr:nth-child(even) td{background:#f8fafc}
  </style></head><body>
  <h1>Grett Engineering — Pay Orders</h1>
  <div class="meta">Exported: ${new Date().toLocaleString()}</div>
  <div class="summary">
    <div class="s-card"><div class="label">Total Entries</div><div class="val">${payOrders.length}</div></div>
    <div class="s-card"><div class="label">Total Amount</div><div class="val">${formatPKR(total)}</div></div>
    <div class="s-card"><div class="label">At Risk</div><div class="val">${atRisk}</div></div>
    <div class="s-card"><div class="label">Returned</div><div class="val">${returned}</div></div>
    <div class="s-card"><div class="label">Encashed</div><div class="val">${encashed}</div></div>
  </div>
  <table><thead><tr>
    <th>PO #</th><th>Bank</th><th>NIT/Ref</th><th>Tender</th><th>Agency</th>
    <th>Amount</th><th>Submitted</th><th>Status</th><th>Bid Result</th>
  </tr></thead><tbody>${rows}</tbody></table>
  </body></html>`

  const win = window.open('', '_blank')
  if (!win) {
    console.error('PDF export popup was blocked.')
    return 'popup-blocked'
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
  return true
}

export async function exportAllDataJSON(userEmail) {
  const collections = [
    'tenders', 'payOrders', 'todos', 'notes', 'expenses',
    'contacts', 'calendarEvents', 'banks', 'users',
    'checklistTemplates', 'tenderFees', 'activityLog',
  ]
  const backup = {
    _meta: {
      format: 'grett-firestore-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: userEmail,
      scope: 'Firestore documents and storage object manifest only',
      restoreWarning: 'Firebase Auth accounts, environment configuration and file bytes are not included.',
    },
    storageManifest: [],
  }
  for (const col of collections) {
    const snap = await getDocs(collection(db, col))
    backup[col] = snap.docs.map((snapshot) => serializeBackupValue(documentData(snapshot)))
  }
  backup.storageManifest = (backup.tenders || []).flatMap((tender) => (
    (tender.documents || []).map((document) => ({
      tenderId: tender.id,
      documentId: document.id || null,
      objectPath: document.objectPath || document.path || null,
      url: document.url || null,
      fileName: document.fileName || document.title || null,
    }))
  ))
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `grett-backup-${new Date().toISOString().slice(0, 10)}.json`)
  return true
}
