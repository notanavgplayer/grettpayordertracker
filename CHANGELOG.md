# Changelog

## [Unreleased] — 2026-09-21

### Reliability and usability

- Added tested, reusable tender expense, pay-order, site-visit, award/work-order, bill, and RA-bill editors.
- Added non-negative financial validation that preserves explicit zero values and focuses invalid fields.
- Added cursor pagination for the activity history and safe retry behavior for failed reads and deletes.
- Added accessible labels to important forms, searches, filters, and inline tender fields.
- Corrected the pay-order “At Risk” metric to count linked tenders due within seven days whose bid result is pending.
- Clarified that the Settings export contains Firestore business data and a storage manifest, rather than user accounts or stored file bytes.
- Added focused UI regression tests and included them in the standard project check.

## [Unreleased] — 2026-04-18

### Accessibility (Group 1)

- **Skip-to-main link** — first focusable element in the layout shell (`Layout.jsx`). Visible only on keyboard focus; jumps to `<main id="main">`.
- **Sign-out confirmation** — clicking "Sign out" now opens an `AlertDialog` to prevent accidental logout.
- **Heading hierarchy fixed** — `CardTitle` now renders as `<h2>` (was `<h3>`), so every page has a correct `h1 → h2` flow without skipping levels.
- **Checkbox labels** — Home page task checkboxes now carry `aria-label="Mark task complete: <text>"`.
- **Dismiss button label** — Urgent-alerts dismiss button now has `aria-label="Dismiss urgent deadline alerts"`.
- **Calendar nav labels** — Previous/Next month buttons now have `aria-label="Previous month"` / `aria-label="Next month"`.
- **Calendar `aria-current="date"`** — Today's cell is marked `aria-current="date"` and visually distinguished; past dates are subtly dimmed.
- **Settings form labels** — All inputs now have explicit `htmlFor`/`id` pairs, `name` attributes, and `autocomplete` values (`name`, `email`, `current-password`, `new-password`).
- **Password policy** — Minimum raised from 6 → 10 characters. Added a "Confirm New Password" field with live match/mismatch indicator.

### Data consistency (Group 2)

- **Overdue tenders** — Any tender with status "Bidding" whose submission date is in the past now displays as **Overdue** (red badge) without touching Firestore. Computed on read via `resolveStatus()`. A new "Overdue" stat card and filter pill appear on the Tenders page.
- **Checklist hidden post-award** — The progress bar is hidden for Awarded, Lost, Cancelled, and Overdue tenders; replaced with `—` so stale 0/8 counts no longer appear.
- **POs At Risk metric** — Count changed to `status === 'Submitted' && bidResult === 'Awaiting'` (was all submitted POs). Sub-text updated to "Submitted, bid pending".
- **Metric tile delta text** — All four Home dashboard tiles now have accurate delta sub-text describing the metric criteria.
- **Calendar "Remaining This Month"** — Renamed from "Upcoming This Month" and empty-state changed to "No upcoming events for the rest of the month" to eliminate the confusing mismatch.
- **Past calendar dates** — Past day cells are subtly dimmed to visually distinguish them from future dates.

### Search improvements (Group 2)

- Added `type="search"` to the search input.
- Added a **scope filter row** (All / Tenders / Pay Orders / Notes / Tasks / Expenses) so users can narrow results before typing.
- Added a **recent-searches list** (persisted to `localStorage`) shown on the empty state, with individual recall and a "Clear" button.

### SEO & meta (Group 3)

- Added `<meta name="description">` (≤ 160 chars).
- Added Open Graph tags: `og:title`, `og:description`, `og:type`, `og:image`, `og:url`.
- Added Twitter Card tags: `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`.
- Added `<meta name="color-scheme" content="light dark">`.
- Added `<link rel="canonical">` and `<link rel="manifest" href="/site.webmanifest">`.
- Created `public/site.webmanifest` for PWA installability.
- Created `public/og.svg` (1200×630) as the OG image. **Note:** convert to PNG for broadest social-media crawler support.
- Trimmed Geist font request from 3 weights to 4 (400/500/600/700 only, removed 300/800).

### Performance (Group 4)

- **Vite `manualChunks`** — Replaced flat object map with a function that also extracts `@radix-ui` into its own chunk, producing 4 stable long-term-cacheable vendor chunks: `react-vendor`, `firebase`, `recharts`, `radix`.
- **Netlify cache headers** — Added `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`; `no-cache, no-store, must-revalidate` for `/index.html` and `/`; short TTL for the manifest.

---

## Follow-up items (not yet completed)

| Item | Reason not done |
|------|-----------------|
| Lighthouse before/after scores | Build environment has no Chromium available |
| `npm run build` output | Node/npm not in sandbox PATH — run `npm run build` locally to verify |
| SSG / pre-render (vite-ssg) | Large architectural change; requires testing before merging |
| Service worker (Workbox / vite-plugin-pwa) | New dependency + config; deferred to a focused PR |
| Hoist Firestore listeners into a provider | Requires refactoring `useCollection` hook; deferred |
| web-vitals reporter | Simple to add once build is verified; deferred |
| Firestore security rules audit | Rules live in Firebase console — see note below |
| ARIA hidden on off-view table/card duplicates | Requires verifying each responsive pair; in progress |
| Notes preview separator | Requires regex change in Notes.jsx preview truncation |
| User Management email disambiguation | Current UI already shows email as secondary; needs uniqueness check on create |
| OG image as PNG | SVG created; PNG conversion needed for broadest crawler support |

## Firestore security rules — review checklist

> Rules cannot be read from the client bundle. Log in to the Firebase console and verify:

- `users` collection: only the authenticated user (or admins) should be able to write their own document. Wide-open `allow write: if request.auth != null` lets any authenticated user change any other user's role — **likely too permissive**.
- `tenders`, `payOrders`, `expenses`, `contacts`: confirm writes are gated on `request.auth.token.role == 'admin'` or equivalent custom claim, not just `request.auth != null`.
- `todos`: all authenticated users should be able to toggle `done`, but only admins should be able to create/delete.
- Consider adding field-level validation (e.g., `status` must be one of the allowed enum values).
