const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/

export function safeSpreadsheetText(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ')
  return FORMULA_PREFIX.test(text) ? `'${text}` : text
}

export function csvCell(value, { numeric = false } = {}) {
  const normalized = numeric && typeof value === 'number'
    ? String(value)
    : safeSpreadsheetText(value)
  return `"${normalized.replace(/"/g, '""')}"`
}

export function rowsToCSV(headers, rows, numericColumns = new Set()) {
  return [headers, ...rows]
    .map((row, rowIndex) => row.map((value, columnIndex) => (
      csvCell(value, { numeric: rowIndex > 0 && numericColumns.has(columnIndex) })
    )).join(','))
    .join('\n')
}
