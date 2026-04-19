# Claude Code Prompt — Grett Pay Order Tracker Fix Pass

Paste the block below to Claude Code from the repo root (the React/Vite project behind `grettpayordertracker.netlify.app`). It is written so Claude can pick up the work without needing the original audit conversation.

---

## Prompt to Claude Code

You are working on the Grett Pay Order Tracker (a React + Vite SPA deployed to Netlify, backed by Firebase Auth + Firestore, charted with Recharts, styled with Tailwind + shadcn/ui). The app is a personal business tool for one company tracking pay orders, tenders, expenses, contacts, a calendar, notes, a to‑do list, an activity log, and settings.

A UI/UX + performance audit identified the issues listed below. Fix them. Work through every item — do not skip any. After the code changes, run the build and the linter/tests, then write a short summary of what you changed and which files you touched.

### Ground rules

- Preserve existing functionality and data models — this is a live tool with real Firestore data.
- Keep the current shadcn/ui + Tailwind design language; do not rewrite the design system.
- When fixing accessibility, use semantic HTML first and ARIA only when semantic HTML is insufficient.
- For anything that changes visible behavior (e.g. auto‑advancing tender status), make it configurable or add a clear note in the settings screen.
- Do not introduce new heavy dependencies. Prefer code splitting and configuration over new packages.
- Keep the Firebase API key in the client (it is safe by design) but audit Firestore security rules and list any that look too permissive in your final summary.
- After every logical group of fixes, run `npm run build` (or the project equivalent) to make sure nothing regressed.
- Commit in small, focused commits named by the group (e.g. `fix(a11y): add labels to dashboard checkboxes`).

---

### Group 1 — Accessibility & semantic HTML

1. Fix heading hierarchy on every route. Home, Pay Orders, Expenses, Contacts, Notes, To‑Do, Activity, Search, and Settings currently jump from `<h1>` to `<h3>`. Convert the intermediate section titles (`Upcoming Submissions`, `Open Tasks`, `Status Distribution`, `Bid Results`, `Account`, `Change Password`, `Appearance`, `Data Backup`, `User Management`, etc.) to `<h2>`, and push card/group titles down to `<h3>` only when they truly nest under an `<h2>`.
2. Add a visually‑hidden "Skip to main content" link as the first focusable element in the layout shell. Target the `<main>` landmark.
3. Give every interactive element an accessible name:
   - Dashboard task checkboxes must have `<label>` or `aria-label` reflecting the task text.
   - "Open menu", dark‑mode toggle, row‑action ellipsis, calendar prev/next month, and any other icon‑only `<button>`/`<a>` must have `aria-label`s.
   - There are currently at least 2 empty `<button>`s and 2 empty `<a>`s — find and name them all.
4. Add `htmlFor`/`id` label association on every Settings form input (Display Name, Email, Current Password, New Password). Also add `name` attributes.
5. Add `autocomplete="current-password"` and `autocomplete="new-password"` on the two password fields. Add `autocomplete="email"` / `"name"` where appropriate.
6. Raise the password minimum from 6 → 10 characters and add a confirmation field with live match validation.
7. Ensure tap targets are ≥ 44×44 px on touch breakpoints. Grow the to‑do checkboxes and the "View all" buttons in particular. Use `min-h-[44px] min-w-[44px]` with padding rather than changing visual scale where possible.
8. If both a card grid and a `<table>` render for the same data (Pay Orders, Tenders), make sure the off‑view layout is `aria-hidden` and not announced twice by screen readers.
9. Audit color contrast at both light and dark themes — body text must hit WCAG AA (4.5:1). Status badges ("Pending", "Submitted", "Encashed", "Lost", "Awaiting", "N/A") must also pass.

### Group 2 — Data consistency & status bugs

1. Tender status must be deadline‑aware. Any tender whose submission date is in the past but status is still "Bidding" should automatically reflect "Overdue" (a new status) or be flipped to "Submitted" on a daily job. Add the computation on read so stale Firestore data doesn't need a migration. Visually flag overdue tenders with a red badge.
2. Stop displaying the checklist progress bar on tenders once they are `Awarded`, `Lost`, or `Cancelled`. Replace it with a neutral "—" or a completion summary. Do not keep showing 0/8 post‑award.
3. Normalize empty‑cell placeholders across the Pay Orders table and cards. Pick one convention (recommend "—" for truly empty, "Awaiting" only for pending bid results) and apply it everywhere. No mixing of "N/A", "—", and "Awaiting" for the same concept.
4. Fix the Home / Pay Orders metric tiles so label and description agree:
   - "POs At Risk" should count POs whose tender deadline is within N days AND the bid result is still pending. Update the sub‑text accordingly.
   - "Total Entries" should show the actual entries count, not "0 returned". Keep a separate "Returned" tile if that metric is needed.
   - Audit every other tile for a similar label/sub‑text mismatch.
5. Tenders page metric cards (Bidding / Submitted / Awarded / Lost / Cancelled) must render their numeric counts. Right now the number doesn't appear in the accessibility tree — likely a rendering bug where the value `<div>` is empty. Fix the component and add a unit test for the metric values.
6. Calendar: add a clear "today" indicator (highlighted cell + `aria-current="date"`). Visually distinguish past dates from future dates. Show overdue submissions in red.
7. Calendar: make the "Upcoming This Month" widget either (a) respect its name by only listing future dates, and show an empty state that says "No upcoming events for the rest of the month" or (b) rename it and include past events. Right now it says "No upcoming events" while the grid shows events, which is confusing.
8. Notes preview should append a period + space separator between fields when the content lacks punctuation, so previews don't render as `…3,000,000This tender is won…`.
9. User Management must disambiguate users beyond display name — show the email as the primary identifier and the name as secondary when there are duplicates. Add a uniqueness check when creating / editing users.
10. Search page: add a scope filter row ("All / Tenders / Pay Orders / Notes / Tasks / Expenses") and a recent‑searches list so the page isn't empty before typing. Also add `type="search"` on the input.

### Group 3 — SEO, meta, and shell

1. Add `<meta name="description">` (under 160 chars) describing the app.
2. Add Open Graph + Twitter card tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `twitter:card`, `twitter:image`). Generate a simple 1200×630 PNG OG image and commit it under `public/og.png`.
3. Add `<link rel="canonical">` and `<link rel="manifest">` pointing at a real `site.webmanifest` so the PWA install prompt works.
4. Add `<meta name="color-scheme" content="light dark">` alongside the existing `theme-color`.
5. Pre‑render or SSR the shell. At minimum, use Vite SSG (`vite-ssg` or `vite-plugin-ssr`) or Netlify's pre‑render option so the HTML has the `<title>`, meta tags, and above‑the‑fold skeleton at response time. This directly improves LCP/FCP.

### Group 4 — Performance

1. Dynamically import Firebase only where needed:
   - Auth on the root/layout.
   - Firestore lazily inside feature hooks.
   - Avoid loading the full Firestore bundle on routes that don't read it (Settings, Search empty state, Activity empty state).
2. Dynamically import Recharts only on routes that render charts (currently Pay Orders and Expenses). The Contacts/Notes/To‑Do/Activity routes should not include Recharts.
3. Drop one of the two font families. The body uses Inter — remove the Geist + Geist Mono requests unless Geist is actually used somewhere. If Geist is intentional, self‑host both families and preload only the weights you actually render.
4. Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the 1‑2 critical font weights used above the fold.
5. Self‑host Google Fonts (or use `@fontsource/*`) to avoid the extra DNS + connection to `fonts.googleapis.com` + `fonts.gstatic.com`.
6. Review all the per‑component chunks (`MetricCard`, `LoadingSkeletons`, `ellipsis`, `pencil`, `plus`, etc.). Collapse tiny chunks back into their parent route bundles so a single route doesn't need ~15 HTTP requests to hydrate.
7. Add a Vite `manualChunks` config that groups `firebase`, `recharts`, and `react-vendor` explicitly and uses long‑term caching hashes.
8. Add a service worker (Workbox via `vite-plugin-pwa`) to cache the shell + static assets and enable offline use. This is a personal productivity tool — offline read support is a real win. Gate writes behind network availability.
9. Memoize or defer the Firestore realtime listeners. Currently a short browsing session accumulates ~698 network requests and the listener re‑subscribes on every route change. Hoist listeners into a provider so they persist across navigation, and tear them down on sign‑out.
10. Investigate the JS heap sitting near 219 MB. Look for unmounted components retaining Firestore `onSnapshot` unsubscribes or Recharts instances. Fix any leaks (`useEffect` cleanup returning the Firestore `unsubscribe`).
11. Add a simple web‑vitals reporter (`web-vitals` package) that logs LCP/FCP/CLS/INP to the console in dev and to an analytics endpoint in prod. The current build exposes no paint entries, which makes perf regressions invisible.
12. Audit Netlify caching headers. Ensure `/assets/*` has `Cache-Control: public, max-age=31536000, immutable` and the HTML shell has `no-cache`.

### Group 5 — Polish & nice‑to‑haves

1. Fix the duplicate search affordance in the header (an input + a separate search icon button). Keep one, not both.
2. Add a "Sign out" confirmation so a mis‑click doesn't drop the user out.
3. Add toasts for every Firestore write success/failure so failures aren't silent. Use the existing notifications region (`region [ref_62] "Notifications alt+T"` is already in the DOM).
4. Add keyboard shortcuts discoverability — at minimum a `?` shortcut that opens a modal listing them (the Notifications region already hints `alt+T`, but nothing lists shortcuts anywhere).
5. Add breadcrumbs or a visible page title in the header when the sidebar is collapsed on mobile so users always know where they are.
6. Add a small "Last synced X seconds ago" indicator driven by Firestore's snapshot metadata, so users know whether they are looking at cached or live data.

### Deliverables

After implementing the above:

1. Run `npm run build`, `npm run lint`, and any existing tests. Fix everything red.
2. Run Lighthouse (desktop + mobile) against a local preview build and paste the before/after scores into your summary.
3. List any Firestore security rules that look overly permissive.
4. Produce a short `CHANGELOG.md` entry describing user‑visible changes.
5. Print a final summary grouped by the 5 groups above, with the list of files touched and any follow‑up items you couldn't complete.

Begin by reading the repo structure, the current `vite.config.*`, `tailwind.config.*`, `index.html`, and the route files for Home, Pay Orders, Tenders, and Settings. Then work through the groups in order.

---

### Tip for you (the user)

If Claude Code runs out of context mid‑way, resume with: "Continue from Group X. Here is the file list you already touched: …". The prompt above is intentionally grouped so you can also hand Claude one group at a time if you want smaller, reviewable PRs.
