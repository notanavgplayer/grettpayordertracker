# Security Audit Fixes — branch `security/audit-fixes`

One commit per task. Branch is ready to PR into `main`.

## What changed per task

### Task 1 — Role self-elevation hole (CRITICAL) — `firestore.rules`
- `users/{userId}` `create` now requires `request.auth.uid == userId`,
  pinned `role == 'viewer'`, and a `keys().hasOnly([...])` allowlist.
- `update` for self is now further constrained: cannot touch `role`, `email`,
  or `createdAt`, AND must stay within `['displayName','updatedAt']`.
- Admins can still update other users freely.

### Task 2 — `users/_appMeta` lockdown (CRITICAL) — `firestore.rules`
- The permissive `match /users/_appMeta` rule was **removed entirely** —
  `grep -r appMeta src/` returned no client code that reads/writes it.
  If you ever need it back, restrict `write: if isAdmin()`.

### Task 3 — Reads gated to admins (CRITICAL) — `firestore.rules` + `src/pages/Settings.jsx`
- Every data collection (`payOrders`, `tenders`, `expenses`, `contacts`,
  `notes`, `todos`, `calendarEvents`, `banks`, `activityLog`,
  `checklistTemplates`, `tenderFees`) now requires `isAdmin()` for reads.
- The "Export Full Backup" card in Settings is wrapped in `{isAdmin && ...}`.
- `exportAllDataJSON` is now **dynamic-imported** inside the click handler
  rather than statically imported at the top of the file. Result: the export
  entrypoint is its own chunk (`assets/export-*.js`) that is never fetched
  for a viewer session, so it cannot be invoked from the JS console with
  viewer-state.
- ⚠️ I did NOT carve out a "viewer can still read X" tier. Per your task,
  if you want a real viewer role for some collections, tell me which
  collections and I will gate them with a separate function.

### Task 4 — Custom claims via Cloud Functions (HIGH) — `functions/`, `src/context/AuthContext.jsx`, `firebase.json`, `README.md`
- `functions/index.js`: `onUserCreate` + `onUserUpdate` Firestore triggers
  call `admin.auth().setCustomUserClaims(uid, { admin: true|false })`
  whenever the `role` field changes.
- `firebase.json` adds the `functions` codebase entry (Node 20).
- `firestore.rules` `isAdmin()` is now **hybrid**: it accepts either
  `request.auth.token.admin == true` OR the user-doc `role == 'admin'`
  fallback. This avoids breaking existing admin sessions before the
  function has run on every user. **Action item below**: tighten to
  claim-only after migration.
- `AuthContext` reads `getIdTokenResult().claims.admin` first, with the
  user doc as fallback during the propagation window.
- README has a `firebase deploy --only functions` step.

### Task 5 — Field validation (HIGH) — `firestore.rules`
- Added `validPayOrder`, `validTender`, `validExpense`, `validContact`,
  `validNote`, `validTodo`, `validCalendarEvent`, `validBank`,
  `validActivity` helpers.
- Each enforces `keys().hasOnly([...])` against the actual fields written
  by the React pages (`EMPTY_PO`, `EMPTY_TENDER`, etc. plus
  `useFirestoreCRUD` auto-fields), checks types, and clamps string sizes.
- Enums constrained: PO `status`/`bidResult`/`purpose`, note `priority`.
- `activityLog` is **append-only**: `update: if false`.
- `checklistTemplates` and `tenderFees` (referenced in exports but never
  written by the React code) kept admin-only without field schema —
  add validators if/when they get a write surface.

### Task 6 — Stored-XSS in PDF print export (HIGH) — `src/lib/export.js`
- Added `escapeHtml()` and wrapped every interpolated user-supplied
  field (`po`, `bank`, `nit`, `tender`, `agency`, `submitted`, `status`,
  `bidResult`) in it. `formatPKR` and `new Date().toLocaleString()` are
  numeric/date-derived and left as-is.
- Audited the rest of `src/`: only sink found was the one in `export.js`.
  No `dangerouslySetInnerHTML`, no other `document.write` / `innerHTML`.

### Task 7 — `.env.example` sanitized (LOW)
- Replaced real Firebase project values with placeholders.
- README already has a note explaining web Firebase API keys are public
  project identifiers, not secrets — added in the Step 4.5 block.

### Task 8 — CSP tightened (MEDIUM) — `netlify.toml`, `_headers`
- Removed `'unsafe-inline'` from `script-src` in both files.
- The single inline `<script>` in `index.html` (theme-FOUC guard) is
  whitelisted by its sha256 hash:
  `'sha256-EAt0qlocE1wvReyDD3SsnFLfol8oCSww/LsMvxCT1aI='`.
- `style-src` keeps `'unsafe-inline'` for now with a TODO comment to
  revisit (Tailwind/Radix runtime inline styles).

### Task 9 — Friendlier Firestore errors (LOW) — `src/hooks/useFirestore.js`
- Added `friendlyFirestoreError(e, verb)` mapping `permission-denied`,
  `unavailable`, `failed-precondition`, `not-found` to short user-facing
  strings. Everything else gets the generic
  "Something went wrong, please try again."
- Full `e` object still logged via `console.error` for debugging.

### Task 10 — Repo cleanup (LOW)
- Removed tracked `appgrett.zip` and the LibreOffice lock file
  `.~lock.Electrical Work at UC-05 Qaidabad Ward No. 1,2,3,4 District Malir.xlsx#`.
- `.gitignore` now ignores `.~lock.*#` and `*.zip`.
- `.vscode.zip` (78 MB, untracked working-tree only) deleted.
- `.claude/worktrees/...` was never tracked (existing `.gitignore`
  already covers `.claude/`), so nothing to remove from git there.
  If those folders bother you on disk, delete them locally.

---

## Verification results

| Check | Result |
| --- | --- |
| `firebase deploy --only firestore:rules --dry-run` | ✅ rules compiled successfully (`pay-order-tracker`) |
| `npm run build` | ✅ built in ~7s, no errors. Note `assets/export-*.js` is now a separate chunk (lazy-imported) |
| `git log -- .env` | ✅ empty (`.env` was never tracked) |
| `git ls-files \| grep -E '\.claude/\|\.vscode\.zip\|\.~lock'` | ✅ empty after cleanup |
| Live SDK: viewer cannot `setDoc(users/<uid>, {role:'admin'})` | ⚠️ **Not run by me** — requires a real non-admin Firebase user in the live project. See "Verification you still need to run" below. |
| Live SDK: viewer cannot `getDocs(payOrders)` | ⚠️ **Not run by me** — same. |
| Live SDK: viewer cannot write `users/_appMeta` | ⚠️ **Not run by me** — same. (Note the rule was removed; default-deny applies.) |
| Admin can still create/edit/delete in every collection | ⚠️ **Not run by me** — needs the live app + admin login. |
| `npm run preview` shows no CSP violations | ⚠️ **Not applicable locally** — Vite preview does NOT apply `netlify.toml` / `_headers`. CSP only takes effect on Netlify. After you deploy, open DevTools → Console on the deployed site and check. |
| Print export with `<img src=x onerror=alert(1)>` in `notes` renders literally | ⚠️ **Not run by me** — needs a live data row. The fix in `export.js` is straight HTML escaping; behavior is straightforward to verify by hand. |

I marked the live-SDK / live-preview checks as not run because they need
your real Firebase project + a clean browser session with a non-admin
account. Run them after deploying this branch.

---

## What you have to do manually (Firebase Console)

1. **Disable email/password sign-up** (so admins must add accounts manually):
   - https://console.firebase.google.com → select project `pay-order-tracker`
   - **Build → Authentication → Sign-in method**
   - Click the **Email/Password** row → toggle **Enable** to **Off**, **Save**
   - Add new users via **Authentication → Users → Add user** as you do today.

2. **Deploy the new rules and the Cloud Function** (after merging this branch):
   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions
   firebase deploy --only firestore:rules
   ```
   The function trigger will fire as you (re-)edit user docs. To bootstrap
   existing admins, briefly toggle their `role` in the Settings → User
   Management UI (admin → viewer → admin) — each toggle invokes the
   trigger and sets the claim. Then have them sign out and back in once.

3. **Tighten `isAdmin()` to claim-only after step 2** is verified for all
   admins. Edit `firestore.rules`:
   ```
   function isAdmin() {
     return isAuthenticated() && request.auth.token.admin == true;
   }
   ```
   and re-deploy. This drops the user-doc `get()` from every rule eval
   (faster + race-free).

4. **Decide on the viewer tier**. The current rules are
   admin-only-everything. If you want viewers to still see a subset
   (e.g. `tenders` + `payOrders` read-only), tell me which collections
   and I'll add a `viewer` carve-out.

---

## Tasks I could not complete

None — all 10 numbered tasks have a commit. The only items deferred are
the runtime-verification rows above and the manual console steps, which
require credentials and a deployed environment.
