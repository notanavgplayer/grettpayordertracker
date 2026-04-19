# Grett Pay Order Tracker — Full Web App Audit Report

**Audit Date:** April 10, 2026  
**App URL:** https://grettpayordertracker.netlify.app/home.html  
**Stack:** HTML / CSS / JavaScript + Firebase/Firestore, Netlify Hosting  
**Auditor Role:** Senior Full-Stack Web Auditor & Performance Optimization Expert

---

## Executive Summary

The Grett Pay Order Tracker is a multi-page Firebase-powered web app covering pay orders, tenders, calendar, to-do, contacts, notes, and expenses. The application has a solid feature set but suffers from several functional bugs, performance bottlenecks, and UX gaps that diminish the user experience — particularly on mobile. The most critical issue reported (Pay Order add confirmation lacking details) is diagnosed below with root cause analysis and code fixes.

---

## 1. Critical Issues (Must Fix)

### 1.1 — Pay Order "Added" Toast Shows No Details or Count

**Symptom:** When a user adds a new Pay Order from the dashboard, a toast notification only says `"Pay order – added"` without displaying the PO number, tender name, amount, or updated count.

**Root Cause Analysis:**

This is almost certainly a problem in the `save` handler of the Pay Order modal form. The likely pattern in your code is:

```javascript
// CURRENT (buggy) — generic message, no interpolation
showToast("Pay order – added");
```

The handler writes to Firestore but never reads back the saved document's fields to populate the toast. Additionally, the dashboard stat cards (Total Entries, etc.) are not refreshed after the write completes.

**Fix — Show details in toast and refresh counts:**

```javascript
// In your Pay Order form submit handler (e.g., dashboard.js)
async function savePayOrder(formData) {
  try {
    const docRef = await addDoc(collection(db, "payOrders"), formData);

    // ✅ FIX 1: Show meaningful toast with PO details
    const amount = Number(formData.amount).toLocaleString("en-PK");
    showToast(
      `Pay Order added — ${formData.poNumber} | Rs. ${amount} | ${formData.status}`,
      "success",
    );

    // ✅ FIX 2: Refresh dashboard stats after adding
    await loadDashboardStats(); // re-query Firestore aggregates
    await loadPayOrdersTable(); // refresh the table so user sees new row

    closeModal("payOrderModal");
  } catch (err) {
    console.error("Save failed:", err);
    showToast("Failed to save Pay Order. Please try again.", "error");
  }
}
```

**Fix — Also update the stat cards reactively:**

```javascript
async function loadDashboardStats() {
  const snapshot = await getDocs(collection(db, "payOrders"));
  const orders = snapshot.docs.map((d) => d.data());

  document.getElementById("statTotalEntries").textContent = orders.length;
  document.getElementById("statTotalAmount").textContent =
    "Rs. " +
    orders
      .reduce((s, o) => s + (Number(o.amount) || 0), 0)
      .toLocaleString("en-PK");
  document.getElementById("statAtRisk").textContent = orders.filter(
    (o) => o.status === "Submitted",
  ).length;
  document.getElementById("statReturned").textContent = orders.filter(
    (o) => o.status === "Returned",
  ).length;
  // ... etc for Encashed, Pending
}
```

### 1.2 — All Pages Show Perpetual "Loading…" Without Auth

Every page (home, dashboard, tenders, calendar, todo) renders "Loading…" placeholder text that never resolves if the user is not authenticated or if Firebase initialization fails silently. There is **no error state or timeout fallback**.

**Fix:**

```javascript
// Add a timeout fallback to every data-loading function
function loadWithTimeout(loadFn, containerId, timeoutMs = 8000) {
  const timer = setTimeout(() => {
    document.getElementById(containerId).innerHTML =
      `<p class="empty-state">Unable to load data. Please check your connection or 
       <a href="/">sign in again</a>.</p>`;
  }, timeoutMs);

  loadFn()
    .then(() => clearTimeout(timer))
    .catch(() => {
      clearTimeout(timer);
      document.getElementById(containerId).innerHTML =
        `<p class="empty-state">Something went wrong. Please refresh the page.</p>`;
    });
}
```

### 1.3 — No Auth Guard on Page Navigation

The pages (dashboard, tenders, calendar, etc.) are directly accessible via URL without any authentication redirect. If Firebase auth state is not checked before rendering content, any unauthenticated user can see the shell UI and broken "Loading…" states.

**Fix:**

```javascript
// auth-guard.js — include on every protected page
import { getAuth, onAuthStateChanged } from "firebase/auth";

const auth = getAuth();
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/index.html"; // redirect to login
  } else {
    initializePage(); // only load data if authenticated
  }
});
```

---

## 2. Bugs & Functional Errors

### 2.1 — Dashboard Stat Cards Show "—" Indefinitely

The six stat cards on the dashboard (Total Amount, Total Entries, At Risk, Returned, Encashed, Pending Result) all display "—" as placeholder and never populate if data loading encounters a silent failure or race condition.

**Fix:** Initialize stats to `0` after auth confirmation, then update once Firestore resolves. Show "0" instead of "—" when collection is empty.

### 2.2 — Home Page Quick Stats Cards Link to Wrong Pages

The home page cards link to generic routes (`/tenders`, `/dashboard`, `/todo`) without hash fragments or query params to pre-filter to the relevant view. For example, "POs Expiring ≤7d" links to `/dashboard` but doesn't filter to expiring-soon orders.

**Fix:** Use query params: `/dashboard?filter=expiring-soon` and read them on the dashboard page to auto-set the filter.

### 2.3 — Calendar Shows Empty Grid

The calendar page loads an empty month grid with no events. Likely causes: the render function executes before Firestore data resolves, or events from tenders/pay-orders are not being cross-referenced.

**Fix:** Ensure `renderCalendar()` is called inside the `.then()` or `await` after fetching all tender submission dates, opening dates, and PO expiry dates from Firestore.

### 2.4 — To-Do Counters Always Show "0"

The to-do page shows `Open 0 | Done 0` regardless of actual data. The counter elements are likely being set before the Firestore query returns results.

**Fix:** Move counter updates inside the callback after the data is loaded:

```javascript
const snapshot = await getDocs(
  query(collection(db, "todos"), where("uid", "==", uid)),
);
const todos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
document.getElementById("openCount").textContent = todos.filter(
  (t) => !t.done,
).length;
document.getElementById("doneCount").textContent = todos.filter(
  (t) => t.done,
).length;
```

### 2.5 — Export PDF Button May Not Include All Visible Data

The dashboard has an "Export PDF" button. If this uses only the currently rendered DOM rows rather than the full Firestore dataset, paginated or filtered-out entries will be missing from the export.

**Recommendation:** Confirm that the export queries Firestore directly (not the DOM table) to capture all records, or at minimum exports whatever the current filter shows with a note.

### 2.6 — Delete Confirmation Modal Has No Keyboard Trap

The delete modals ("Delete this entry?" and "Delete selected entries?") don't trap focus. Users can tab behind the modal to interact with the table, potentially triggering unintended actions.

---

## 3. Performance Issues

### 3.1 — No Code Splitting or Lazy Loading

Every page appears to load the full Firebase SDK and all page-specific JS synchronously. Firebase alone is ~100KB+ gzipped. For a multi-page app, each HTML page should only load its own JS module.

**Fix:**

```html
<!-- Use defer on all script tags -->
<script src="js/firebase-init.js" defer></script>
<script src="js/dashboard.js" defer></script>

<!-- Or better: dynamic import -->
<script type="module">
  const { initDashboard } = await import("./js/dashboard.js");
  initDashboard();
</script>
```

### 3.2 — No Firestore Query Pagination

The dashboard loads all pay orders at once (`getDocs(collection(db, "payOrders"))`). As the dataset grows, this will degrade performance significantly.

**Fix:** Implement Firestore cursor-based pagination:

```javascript
import { query, orderBy, limit, startAfter } from "firebase/firestore";

const PAGE_SIZE = 25;
let lastVisible = null;

async function loadPage() {
  let q = query(
    collection(db, "payOrders"),
    orderBy("dateIssued", "desc"),
    limit(PAGE_SIZE),
  );
  if (lastVisible) q = query(q, startAfter(lastVisible));

  const snapshot = await getDocs(q);
  lastVisible = snapshot.docs[snapshot.docs.length - 1];
  // render rows...
}
```

### 3.3 — Render-Blocking Resources

If CSS files are loaded without `media` attributes and JS files lack `defer` or `async`, the browser blocks rendering until these are downloaded and parsed.

**Fix:** Add `defer` to all non-critical `<script>` tags. Inline critical CSS or use `<link rel="preload">` for fonts and stylesheets.

### 3.4 — No Service Worker or Offline Support

For a business-critical tracker, offline access is important. Currently, if the network drops, the app shows perpetual loading states.

**Recommendation:** Add a basic service worker that caches the app shell and shows a user-friendly offline banner.

### 3.5 — Multiple Firestore Reads on Home Page

The home page makes separate queries for: active tenders, at-risk POs, expiring POs, open tasks, and awarded tenders — that's at minimum 5 separate Firestore reads on every page load.

**Fix:** Consolidate into fewer queries or use Firestore's `getCountFromServer()` for stat cards to avoid downloading full documents just for counts.

---

## 4. UX/UI Improvements

### 4.1 — Empty States Are Generic and Unhelpful

Messages like "No pay orders found" and "No activity logged yet" lack actionable context. Better empty states would guide the user:

```html
<!-- Instead of: "No pay orders found." -->
<div class="empty-state">
  <svg><!-- illustration --></svg>
  <h3>No Pay Orders Yet</h3>
  <p>Track your bank guarantees and bid security here.</p>
  <button onclick="openModal('payOrderModal')">
    + Add Your First Pay Order
  </button>
</div>
```

### 4.2 — Search (Ctrl+K) Overlay Needs Polish

The home page has a search overlay showing "0 results / Clear". Issues:

- No placeholder text explaining what can be searched
- No keyboard shortcut hint is visible until you discover it
- Search results area shows even when empty

**Fix:** Add a visible search icon in the header with tooltip "Search (Ctrl+K)" and hide the results container until the user types.

### 4.3 — Dashboard Table Lacks Sorting

The Pay Orders table has column headers (PO Number, Bank, Amount, Status, etc.) but none appear to be sortable by click. For a data-heavy tracker, column sorting is essential.

**Fix:** Add click handlers on `<th>` elements that re-sort the data array and re-render the table. Show a sort indicator arrow.

### 4.4 — No Visual Distinction Between Status Types

The status column (Pending, Submitted, Returned, Encashed, Forfeited) likely displays as plain text. Color-coded badges improve scanability:

```css
.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}
.status-pending {
  background: #fef3c7;
  color: #92400e;
}
.status-submitted {
  background: #dbeafe;
  color: #1e40af;
}
.status-returned {
  background: #d1fae5;
  color: #065f46;
}
.status-encashed {
  background: #fee2e2;
  color: #991b1b;
}
.status-forfeited {
  background: #f3e8ff;
  color: #6b21a8;
}
```

### 4.5 — Mobile Responsiveness Gaps

The dashboard table with 10 columns will overflow on mobile. While you've done responsiveness work previously, the table layout is inherently problematic on small screens.

**Fix:** Convert the table to stacked cards on screens below 768px:

```css
@media (max-width: 768px) {
  .po-table thead {
    display: none;
  }
  .po-table tr {
    display: block;
    margin-bottom: 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
  }
  .po-table td {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }
  .po-table td::before {
    content: attr(data-label);
    font-weight: 600;
    color: #64748b;
  }
}
```

### 4.6 — Modal Close Behavior

The modals have a "✕" button but likely lack "click outside to close" and "Escape key to close" behavior.

**Fix:**

```javascript
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal(modal.id);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal.active").forEach((m) => closeModal(m.id));
  }
});
```

### 4.7 — Tender Preview Panel UX

The tenders page has a split-panel layout: list on left, detail preview on right showing "No tender selected." The preview panel shows multiple "—" placeholders that look like broken data rather than intentional empty state.

**Fix:** Replace with a single centered message: "Select a tender from the list to see details" with a subtle illustration.

---

## 5. Optimization Recommendations

### 5.1 — Asset Optimization

- **Minify CSS and JS** for production using a build step (esbuild, terser, or even a simple npm script)
- **Compress images** if any are used (logos, illustrations) to WebP format
- **Add cache headers** via Netlify `_headers` file:

```
/*.js
  Cache-Control: public, max-age=31536000, immutable
/*.css
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache
```

### 5.2 — Firebase SDK Tree-Shaking

If you're importing the full Firebase SDK via CDN, switch to modular imports:

```javascript
// ❌ Don't import the entire SDK
import firebase from "firebase/app";

// ✅ Import only what you need
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
```

### 5.3 — Add Netlify Redirects for Clean URLs

Your app uses paths like `/dashboard` and `/tenders` but serves `.html` files. Add a `_redirects` file:

```
/dashboard    /dashboard.html    200
/tenders      /tenders.html      200
/calendar     /calendar.html     200
/todo         /todo.html         200
/home         /home.html         200
```

### 5.4 — Implement Optimistic UI Updates

Instead of waiting for Firestore writes to complete before updating the UI:

```javascript
// 1. Immediately add row to table
appendRowToTable(formData);
// 2. Update counters locally
incrementStatCard("statTotalEntries");
// 3. Write to Firestore in background
addDoc(collection(db, "payOrders"), formData).catch(() => {
  // Rollback if write fails
  removeRowFromTable(formData.poNumber);
  showToast("Save failed – please try again", "error");
});
```

### 5.5 — Add Error Boundaries

Wrap all async operations with try/catch and show user-facing error messages instead of silent failures:

```javascript
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise:", event.reason);
  showToast("Something went wrong. Please refresh.", "error");
});
```

### 5.6 — Accessibility Improvements

- Add `aria-label` attributes to icon-only buttons
- Ensure all modals have `role="dialog"` and `aria-modal="true"`
- Add `aria-live="polite"` to toast notification containers
- Ensure color contrast meets WCAG AA (especially on stat cards)

---

## 6. Summary Priority Matrix

| Priority | Issue                                               | Impact | Effort |
| -------- | --------------------------------------------------- | ------ | ------ |
| 🔴 P0    | Pay Order toast missing details + no count refresh  | High   | Low    |
| 🔴 P0    | Auth guard missing on all pages                     | High   | Low    |
| 🔴 P0    | Perpetual "Loading…" with no error/timeout fallback | High   | Low    |
| 🟡 P1    | Dashboard stats stuck on "—"                        | Medium | Low    |
| 🟡 P1    | Calendar empty / events not loading                 | Medium | Medium |
| 🟡 P1    | To-Do counters always "0"                           | Medium | Low    |
| 🟡 P1    | Table not responsive on mobile                      | Medium | Medium |
| 🟢 P2    | No Firestore pagination                             | Medium | Medium |
| 🟢 P2    | Status badges / visual polish                       | Low    | Low    |
| 🟢 P2    | Column sorting on tables                            | Low    | Medium |
| 🟢 P2    | Optimistic UI updates                               | Low    | Medium |
| ⚪ P3    | Service worker / offline support                    | Low    | High   |
| ⚪ P3    | Firebase SDK tree-shaking                           | Low    | Medium |
| ⚪ P3    | Accessibility audit                                 | Low    | Medium |

---

## Assumptions & Notes

1. **No backend access assumed** — all fixes target frontend HTML/CSS/JS and Firestore client SDK usage.
2. **Firebase config is assumed functional** — the "Loading…" states suggest auth or initialization may silently fail rather than the config being wrong.
3. **The codebase uses vanilla JS + Firebase CDN** — fixes are written accordingly (no React/Vue).
4. **Multi-user role support exists** (admin/viewer) — auth guard should respect role-based access.
5. **Without access to the raw JS source files**, some diagnoses are inferred from observable behavior. The exact variable names and function names in the code examples should be adapted to match your actual codebase.

---

_This audit covers observable frontend behavior. For a deeper code-level review, sharing the GitHub repository or the JS source files directly would enable line-by-line analysis and more precise fixes._
