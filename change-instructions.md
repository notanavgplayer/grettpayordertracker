# Grett Pay Order Tracker — Two Feature Changes
## Instructions for Claude Code

Apply these two changes across the entire codebase:

1. **Move delete from inline row icon → toolbar "Delete Selected" button with confirmation**
2. **Remove PO Expiry Date from everywhere in the app**

---

## CHANGE 1: RELOCATE DELETE — Remove Inline Delete Icons, Use Toolbar Button

### Concept
Currently, every row in Pay Orders, Activity Log, Notes, and Expenses has a small trash icon (`btn-icon del`) that instantly opens a single-item delete confirm. 

**New behavior:**
- Remove the inline trash icon from every row
- Keep the existing row-click selection (checkbox/highlight) behavior
- Keep the existing "Delete Selected" button in the toolbar/action bar above the table
- The "Delete Selected" button should be disabled/hidden when nothing is selected
- When clicked, show the existing "Delete selected entries?" confirmation modal before actually deleting
- Single-item delete: user selects one row → clicks "Delete Selected" → confirm → deleted
- Bulk delete: user selects multiple rows → clicks "Delete Selected" → confirm → all deleted

### Files to modify:

#### app.js (Pay Orders + Activity Log — ~29,551 chars)

**A) Remove inline delete button from PO table rows.**

In the `renderPOTable` function (around index ~8700-11000), find this block inside the row template:

```javascript
<button class="btn-icon del" title="Delete" onclick="openConfirm('po','${p.id}')">
  <svg viewBox="0 0 12 12" fill="none"><path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>
```

**Remove it entirely.** Keep the Edit button and the "Mark as Returned" button — only remove the delete trash icon.

The `<div class="row-actions">` should now only contain the Edit button and (conditionally) the Mark as Returned button.

**B) Remove inline delete button from Activity Log table rows.**

In the `renderLogTable` function (around index ~11231), find the same pattern — a `btn-icon del` button with an `openConfirm('log', ...)` onclick. **Remove it entirely.**

**C) Keep the existing `openConfirm`, `closeConfirm`, `confirmDelete` functions** — they're still used by the bulk delete flow.

**D) Keep the existing bulk selection bar** at the bottom of the page (`0 selected | Cancel | Delete Selected`). This is the primary delete UI now.

**E) Modify the `openConfirmBulk` / bulk delete function** (if it exists) to use the same confirm modal. If there's no bulk delete function yet, the existing selection + "Delete Selected" button at the bottom should trigger `confirmDeleteSelected()` which loops through selected IDs and deletes them.

#### notes.js (~10,905 chars)

Find the inline delete icon (`btn-icon del`) in the note card/item render function. **Remove it.**

Add a "Delete Selected" or "Delete" button in the toolbar/header area of the notes page. When a note is selected/active, this button becomes enabled. Clicking it shows a confirmation ("Delete this note?") before deleting.

If notes don't have multi-select, add a single "Delete" button in the toolbar that works on the currently viewed/selected note.

#### expenses.js (~21,618 chars)

Find the inline delete icon (`btn-icon del`) in the expense row render. **Remove it.**

The toolbar should have a "Delete Selected" button (similar to Pay Orders). Works the same way — select rows, click Delete Selected, confirm, then delete.

#### todo.js (~9,290 chars)

Check if there's an inline delete icon on each to-do item. If yes, **remove it.** 

Add a "Delete" or "Delete Completed" button in the toolbar area. For individual deletion, user can select a to-do and use the toolbar delete button with confirmation.

#### tenders.js (~12,168 chars)

Check if there's an inline delete on tender cards/rows. If yes, **remove it.** Add a toolbar "Delete" button that works on the selected tender, with confirmation.

#### contacts.js (~10,806 chars)

Same pattern — remove any inline delete icons, add toolbar delete button with confirmation.

### Confirmation behavior (all pages)

Every delete action must show a confirmation dialog before executing. The pattern should be:

```javascript
// Example: toolbar delete button handler
window.deleteSelected = function() {
  if (selectedIds.length === 0) {
    toast('Select items to delete first.');
    return;
  }
  // Show confirm modal
  const count = selectedIds.length;
  document.getElementById('confirmMsg').textContent = 
    `Delete ${count} selected ${count === 1 ? 'entry' : 'entries'}? This cannot be undone.`;
  document.getElementById('confirmOverlay').classList.add('open');
};
```

### CSS change (style.css or layout.css)

The `.btn-icon.del` styles can remain (they won't hurt), but you may want to add styles for the toolbar delete button:

```css
.toolbar-delete {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--red-fg, #ef4444);
  background: transparent;
  color: var(--red-fg, #ef4444);
  transition: background 0.15s, color 0.15s;
}

.toolbar-delete:hover {
  background: var(--red-fg, #ef4444);
  color: white;
}

.toolbar-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-delete:disabled:hover {
  background: transparent;
  color: var(--red-fg, #ef4444);
}
```

### HTML changes (dashboard.html and other page HTML files)

In dashboard.html, there should already be a selection bar and "Delete Selected" button. Make sure it's visible and functional.

For other pages (notes.html, expenses.html, todo.html, tenders.html, contacts.html), add a toolbar delete button near the "Add" button:

```html
<!-- Add near the existing "+ Add" button in the toolbar -->
<button class="toolbar-delete" id="deleteSelectedBtn" onclick="deleteSelected()" disabled>
  <svg viewBox="0 0 12 12" fill="none" width="14" height="14">
    <path d="M1 3h10M4 3V2h4v1M2.5 3l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  Delete Selected
</button>
```

---

## CHANGE 2: REMOVE PO EXPIRY DATE — Everywhere in the App

### What to remove
The "PO Expiry Date" field, column, calculations, and references must be removed from:
- The Pay Order form (modal)
- The Pay Order table
- The home page "POs Expiring ≤7d" stat card
- The home page "Pay Orders Expiring Soon" section
- The calendar (expiry events)
- Any dashboard stat that references expiry

### Files to modify:

#### dashboard.html

1. **Remove the "PO Expiry Date" form field** from the New Pay Order modal. Find:
```html
<label for="f_expiry">PO Expiry Date</label>
<input type="date" id="f_expiry">
```
**Delete both the label and input.**

2. If there's a table header column for expiry/days remaining, **remove it.**

#### app.js

1. **Remove `expiry` from the savePO data object.** In the `savePO` function, find:
```javascript
expiry: gv('f_expiry'),
```
**Delete this line.**

2. **Remove the daysLeft/daysHtml calculation** from `renderPOTable`. Find the block:
```javascript
const daysLeft = daysTo(p.expiry);
let daysHtml = '—';
if (p.status === 'Returned' || p.status === 'Encashed' || p.status === 'Forfeited') {
  daysHtml = `<span class="days-closed">Closed</span>`;
} else if (daysLeft !== null) {
  const cls = daysLeft <= 7 ? 'days-danger' : daysLeft <= 14 ? 'days-warn' : 'days-ok';
  daysHtml = `<span class="${cls}">${daysLeft}d</span>`;
}
```
**Delete this entire block.** It's no longer needed.

3. **Remove any expiry-related column** from the table row template if one exists (like a "Days Left" or "Expiry" `<td>`). The current table columns visible are: PO Number, Bank, NIT/Ref, Tender, Agency, Amount, Issued, Status, Bid Result, Actions. If there's a hidden expiry column, remove it.

4. **Remove the `daysTo` helper function** if it's only used for expiry:
```javascript
function daysTo(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const exp = new Date(dateStr + 'T00:00:00');
  return Math.round((exp - today) / 86400000);
}
```
**Check if `daysTo` is used anywhere else** (e.g., for tender submission deadlines). If it's used elsewhere, keep it. If it's only used for PO expiry, delete it.

5. **Remove expiry from the `openEditPO` function** — the line that populates `f_expiry`:
```javascript
document.getElementById('f_expiry').value = p.expiry || '';
```
**Delete this line.**

#### home.js

1. **Remove the "POs Expiring ≤7d" stat card data.** Find where this stat is calculated:
```javascript
const expiringSoon = payOrders.filter(o => {
  if (!o.expiryDate || !o.expiry) return false;
  // ... expiry logic
}).length;
```
**Delete this calculation** and set the stat to not render, OR remove the stat card entirely.

2. **Remove the "Pay Orders Expiring Soon" section.** Find the section that renders expiring POs (likely a function like `renderExpiring()` or a block that filters POs by expiry date). **Delete the entire rendering block.**

3. **Remove the stat card update** for expiring POs:
```javascript
setText("statPOsExpiring", expiringSoon);
```
**Delete this line.**

#### home.html

1. **Remove the "POs Expiring ≤7d" stat card.** Find:
```html
<a href="/dashboard" class="stat-card">
  <span class="stat-label">POs Expiring ≤7d</span>
  <span class="stat-value" id="statPOsExpiring">—</span>
</a>
```
**Delete the entire card element.**

2. **Remove the "Pay Orders Expiring Soon" section.** Find:
```html
<section>
  <h3>Pay Orders Expiring Soon</h3>
  <a href="/dashboard">View all →</a>
  <!-- content -->
</section>
```
**Delete the entire section.**

#### calendar.js

1. **Remove PO expiry events from the calendar.** Find where expiry dates are added as calendar events. It likely looks like:
```javascript
// Something like:
payOrders.forEach(p => {
  if (p.expiry) {
    events.push({ date: p.expiry, type: 'expiry', label: '...' });
  }
});
```
**Delete the expiry event generation.** Keep tender submission dates and opening dates.

2. **Remove the "PO Expiry" legend/filter** from the calendar if one exists. The calendar page shows filter toggles: "Submission", "Opening", "PO Expiry". **Remove the "PO Expiry" toggle.**

#### calendar.html

1. **Remove the "PO Expiry" filter button/toggle.** Find:
```html
<button>PO Expiry</button>
```
or similar. **Delete it.**

#### style.css / layout.css

1. **Remove CSS classes** related to expiry badges if they exist:
```css
.days-danger { ... }
.days-warn { ... }
.days-ok { ... }
.days-closed { ... }
```
**These can be deleted** if they're only used for PO expiry days display. Check first.

---

## Summary of All Files to Modify

| File | Change 1 (Delete) | Change 2 (Expiry) |
|------|-------------------|-------------------|
| **app.js** | Remove `btn-icon del` from PO and Log row templates | Remove `expiry` from savePO, remove daysLeft calc, remove daysTo (if only for expiry), remove expiry from openEditPO |
| **home.js** | — | Remove expiring stat calc, remove renderExpiring section |
| **home.html** | — | Remove "POs Expiring ≤7d" card, remove "Pay Orders Expiring Soon" section |
| **dashboard.html** | — | Remove `f_expiry` form field (label + input) |
| **calendar.js** | — | Remove expiry event generation, remove PO Expiry filter logic |
| **calendar.html** | — | Remove "PO Expiry" filter toggle button |
| **notes.js** | Remove inline delete icon, add toolbar delete | — |
| **expenses.js** | Remove inline delete icon, add toolbar delete | — |
| **todo.js** | Remove inline delete (if exists), add toolbar delete | — |
| **tenders.js** | Remove inline delete (if exists), add toolbar delete | — |
| **contacts.js** | Remove inline delete (if exists), add toolbar delete | — |
| **style.css** | Add `.toolbar-delete` styles | Remove `.days-danger`, `.days-warn`, `.days-ok`, `.days-closed` (if only for expiry) |

---

## Claude Code Command

Open terminal in your project folder and run `claude`. Then paste:

> Read the file `change-instructions.md` in this directory. Apply all changes described in CHANGE 1 (relocate delete from inline icons to toolbar button with confirmation) and CHANGE 2 (remove PO expiry date from everywhere). Modify every file listed in the summary table. Do NOT delete any data from Firestore — only remove the UI elements and code that references expiry. For the delete relocation, keep the Edit button and Mark as Returned button in PO rows — only remove the trash icon. Test that all pages still work after changes.
