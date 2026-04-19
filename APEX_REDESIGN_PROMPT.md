# Claude Code Prompt — Restyle to Apex Dashboard Look

Paste everything below (starting at the `## Goal` heading) into Claude Code in this repo.

---

## Goal

Restyle this React app to visually match the **Apex Dashboard** admin template (https://apex-dashboard.pages.dev). Change **design, typography, spacing, borders, radii, colors, and component styling ONLY**. Do not change business logic, Firebase calls, data flow, routing, auth, or page behavior. After you're done, every page must still work exactly as it does today — it should just *look* like Apex.

## Scope

- **Target directory:** `src/` (the Vite + React + Tailwind + Radix + React Router app).
- **Do NOT touch** the legacy root-level `.html` / `.js` files (`home.html`, `tenders.html`, `nav.js`, `app.js`, etc.). Those are being replaced by `src/` and must be left alone.
- **Do NOT touch** `firebase.js`, `firebase-config.js`, `firestore.rules`, `src/context/AuthContext.jsx`, any Firebase calls inside pages, any React Router routes in `src/App.jsx`, or any `useEffect` that loads data. Keep all state, handlers, and props exactly as they are.
- You MAY edit / add freely:
  - `src/index.css`
  - `tailwind.config.js`
  - `index.html` (only the `<link>` tags for fonts)
  - `src/components/ui/*` (add shadcn-style primitives)
  - `src/components/layout/Layout.jsx` and any new layout files you add
  - The JSX markup inside `src/pages/*.jsx` — but only the markup/classNames, never the hooks, handlers, or data logic.
- Do NOT add new npm dependencies. Everything needed is already in `package.json` (Radix primitives, `lucide-react`, `recharts`, `sonner`, `cmdk`, `class-variance-authority`, `tailwind-merge`, `tailwindcss-animate`).

## Design system to implement

### Fonts

- **Body / UI:** Inter (400, 500, 600, 700) — load via Google Fonts in `index.html`.
- **Display / headings / large numbers:** Figtree (variable, 400–700) — load via Google Fonts.
- **Mono / numeric:** system monospace stack (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`).
- Set Tailwind `fontFamily.sans` to `["Inter", "ui-sans-serif", "system-ui", "sans-serif"]` and add `fontFamily.display` to `["Figtree", ...]`.
- Base size 14px. Body tracking `-0.01em`. Headings tracking `-0.02em`.

### Color tokens (OKLCH, shadcn-new-york style)

Define these in `src/index.css` on both `:root` (light) and `.dark` (dark). Emerald is the default primary.

Light mode:
```
--background: oklch(1 0 0);
--foreground: oklch(0.145 0 0);
--card: oklch(1 0 0);
--card-foreground: oklch(0.145 0 0);
--popover: oklch(1 0 0);
--popover-foreground: oklch(0.145 0 0);
--primary: oklch(0.55 0.19 160);          /* emerald */
--primary-foreground: oklch(1 0 0);
--secondary: oklch(0.97 0 0);
--secondary-foreground: oklch(0.205 0 0);
--muted: oklch(0.97 0 0);
--muted-foreground: oklch(0.556 0 0);
--accent: oklch(0.97 0 0);
--accent-foreground: oklch(0.205 0 0);
--destructive: oklch(0.577 0.245 27.325);
--destructive-foreground: oklch(1 0 0);
--border: oklch(0.922 0 0);
--input: oklch(0.922 0 0);
--ring: oklch(0.55 0.19 160);
--chart-1: oklch(0.55 0.19 160);
--chart-2: oklch(0.6  0.18 240);
--chart-3: oklch(0.65 0.17 50);
--chart-4: oklch(0.6  0.2  280);
--chart-5: oklch(0.6  0.2  350);
--sidebar: oklch(0.985 0 0);
--sidebar-foreground: oklch(0.145 0 0);
--sidebar-primary: oklch(0.55 0.19 160);
--sidebar-primary-foreground: oklch(1 0 0);
--sidebar-accent: oklch(0.97 0 0);
--sidebar-accent-foreground: oklch(0.205 0 0);
--sidebar-border: oklch(0.922 0 0);
--sidebar-ring: oklch(0.55 0.19 160);
--radius: 0.75rem;
```

Dark mode (`.dark`): invert — `--background: oklch(0.145 0 0)`, `--foreground: oklch(0.985 0 0)`, `--card: oklch(0.205 0 0)`, `--border/--input: oklch(0.269 0 0)`, `--muted-foreground: oklch(0.708 0 0)`, keep `--primary` the same, `--sidebar: oklch(0.205 0 0)`.

Optional color presets to support later (hue values only, same chroma/lightness as emerald): blue 240, violet 280, rose 350, orange 50, slate 260 (chroma 0.02). You don't need to build a preset switcher unless trivial.

### Tailwind mapping (`tailwind.config.js`)

- `darkMode: ["class"]`
- Extend `colors` to map every token above: `background: "oklch(var(--background))"` style, OR use `hsl(var(--x))` equivalent — pick one and be consistent. Include `sidebar.*` as its own group.
- Extend `borderRadius` with `lg: "var(--radius)"`, `md: "calc(var(--radius) - 2px)"`, `sm: "calc(var(--radius) - 4px)"`.
- Extend `fontFamily.sans` (Inter) and `fontFamily.display` (Figtree).
- Add `tailwindcss-animate` to plugins (already installed).

### Radii, spacing, borders, shadows

- Card radius: `rounded-xl` (12px via `--radius`).
- Inputs / buttons radius: `rounded-md` (10px).
- Card border: `border border-border`. No heavy shadow — `shadow-sm` max.
- Card padding: `p-6`. Card header padding: `p-6 pb-4`.
- Section gap in grids: `gap-4` or `gap-6`.
- Page container: full-width, `px-6 py-6` on desktop, `px-4 py-4` on mobile.

## Layout shell — `src/components/layout/Layout.jsx`

Rebuild as a shadcn-style admin shell:

1. **Sidebar** (left, fixed, 280px wide, collapsible to 64px icon-only):
   - Top 64px: logo/wordmark.
   - Grouped nav sections with uppercase 11px muted labels between groups. Adapt groups to this app's pages, e.g.:
     - **Overview:** Home, Activity
     - **Work:** Tenders, Pay Orders, Calendar, Todo
     - **Finance:** Expenses
     - **People & Notes:** Contacts, Notes
     - **System:** Settings
   - Each item: lucide icon + label + optional badge count (e.g., open todos). Active item: `bg-sidebar-accent text-sidebar-accent-foreground` + small primary-colored left indicator bar OR primary-tinted icon.
   - Bottom of sidebar: user card (avatar, name, role) that opens a DropdownMenu (Settings, Sign out).
   - Mobile (<1024px): sidebar is hidden, opens as a Sheet (`@radix-ui/react-dialog`) triggered by the topbar hamburger.

2. **Top bar** (sticky top, 56-64px tall, `border-b border-border bg-background/80 backdrop-blur`):
   - Left: sidebar collapse toggle (desktop) / hamburger (mobile).
   - Center: pill-shaped command palette trigger — search icon + muted placeholder "Search anything..." + `⌘K` kbd chip on the right. Clicking opens the command palette.
   - Right: theme toggle (Sun/Moon from lucide), notifications bell with numeric badge, user avatar that mirrors the sidebar dropdown.

3. **Main content:** `<main class="flex-1 overflow-auto"><div class="mx-auto w-full px-6 py-6">{children}</div></main>`.

### Command palette — `src/components/layout/CommandPalette.jsx`

Use `cmdk`. Global keyboard shortcut `⌘K` / `Ctrl+K`. Grouped results:
- **Pages** — list every route from `src/App.jsx` with its lucide icon.
- **Quick actions** — "Add Tender", "Add Pay Order", "Add Expense", "Add Note", "Add Todo" (each navigates to the respective page; don't invoke any creation handler).
- **Settings** — Theme toggle, Sign out.
Style: Dialog overlay, rounded-xl card, input with search icon, rows with icon + label + muted hint, keyboard focus ring.

## UI primitives to add/refresh under `src/components/ui/`

Use existing Radix primitives. Match shadcn "new-york" look exactly. Use `class-variance-authority` for variants and `tailwind-merge` + `clsx` via a `cn()` util in `src/lib/utils.js`.

- `button.jsx` — variants: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`; sizes: `sm`, `default`, `lg`, `icon`.
- `card.jsx` — `Card`, `CardHeader`, `CardTitle` (Figtree, 14/600), `CardDescription` (13, muted-foreground), `CardContent`, `CardFooter`.
- `input.jsx`, `label.jsx`, `textarea.jsx` — 10px radius, 1px border, focus ring via `--ring`.
- `badge.jsx` — variants `default` / `secondary` / `outline` / `destructive` PLUS soft-colored status variants: `success` (emerald), `warning` (amber), `info` (blue), `neutral` (zinc). Soft style = `bg-{color}-500/10 text-{color}-700 dark:text-{color}-300 border-transparent`.
- `table.jsx` — thin border, header `bg-muted/30`, row hover `bg-muted/50`, `border-b` between rows. Right-aligned numeric cells with `tabular-nums`.
- `tabs.jsx` — underline style, active tab gets primary-colored underline + foreground text.
- `progress.jsx` — 8px track, `bg-secondary`, fill `bg-primary`, rounded-full.
- `avatar.jsx` — circular, fallback shows initials on `bg-muted`.
- `dropdown-menu.jsx`, `dialog.jsx`, `sheet.jsx`, `separator.jsx`, `scroll-area.jsx`.
- `sonner.jsx` — wrapper around `<Toaster />` using the token palette.

## Page patterns to apply

Preserve all existing state/effects/handlers. Only change JSX structure and className usage.

### `src/pages/Home.jsx` (dashboard)

- Page header: H1 (Figtree 28/600) "Dashboard" + muted subtitle "Welcome back. Here's what's happening with your projects today."
- **Row 1 — KPI cards:** `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4`. Each Card has:
  - Muted uppercase label (e.g., "Active Tenders", "Pay Orders at Risk", "Open Tasks", "Awarded Tenders")
  - Big number: Figtree, 30px, 600, `tabular-nums`
  - Delta row: small colored arrow (ArrowUp/ArrowDown from lucide) + % change + "vs last month" in muted-foreground
  - Optional: tiny icon in top-right corner of the card in a soft-colored `rounded-md` square.
- **Row 2:** 2/3 chart Card (Overview) + 1/3 donut/list Card. Chart uses Recharts with `--chart-1..5` tokens. Tabs for "Revenue / Orders / Profit" — adapt to "Tenders / Pay Orders / Expenses" if a reasonable data shape exists; otherwise keep one series and drop tabs.
- **Row 3:** Monthly Goals Card with progress bars (label, Progress, value/target right-aligned).
- **Row 4:** Upcoming Deadlines — Card wrapping a Table.
- **Row 5:** Recent Activity — list of icon+title+sub+timestamp rows; icons sit in 36×36 `rounded-full bg-{color}/10` with the lucide icon tinted to the color.

### List pages: `Tenders.jsx`, `PayOrders.jsx`, `Expenses.jsx`, `Contacts.jsx`, `Notes.jsx`, `Todo.jsx`, `Activity.jsx`

- Page header row: H1 + muted subtitle on the left, primary action Button on the right ("New Tender", "New Pay Order", etc. — wired to whatever handler already exists; do not change the handler).
- Filter/search row: Input + 1-2 Selects inside a Card or as a flex row.
- Main Card wrapping a Table:
  - First cell: avatar or colored icon tile + primary text (name/title) over muted secondary text (sub-label/ID).
  - Status column: soft-colored Badge.
  - Right-aligned amount/count with `tabular-nums`.
  - Actions column: ghost icon Button (MoreHorizontal) opening a DropdownMenu.
- Empty state inside the Card: centered icon + headline + muted sub + primary Button.

### `TenderDetail.jsx`

- Top: back link + H1 title + status Badge + action Buttons on the right.
- Grid: main column (Tabs: Overview / Documents / Activity / Notes) + sidebar column (summary Card with key/value rows).

### `Calendar.jsx`

- Full-width Card containing the calendar. Event chips use soft-colored Badge styling.

### `Settings.jsx`

- Grouped Cards (Account, Appearance, Notifications, Data). Appearance Card has theme toggle + (optionally) color preset buttons.

### `Login.jsx`

- Centered Card (max-w-sm), logo on top, title, email/password inputs, primary Button, muted helper link.

## Icons

Use `lucide-react` only. Sidebar icons 18px; topbar and inline icons 16px; activity-feed icons 16px inside 36×36 circular tinted background.

## What NOT to do

- Do not change routes, `App.jsx`, auth guards, or `ProtectedRoute`.
- Do not touch Firebase, Firestore rules, or data queries.
- Do not rename pages, files, or exported components.
- Do not add new npm dependencies.
- Do not modify any `.html` / `.js` files at the repo root.
- Do not change the semantics of any form — only its visual styling.

## Phased plan — finish each phase, run `npm run build`, fix errors, then stop and wait

1. **Foundation** — `src/index.css` tokens (light + dark), `tailwind.config.js` mapping, `index.html` font links, `src/lib/utils.js` with `cn()`.
2. **UI primitives** — build/refresh every component in `src/components/ui/` listed above.
3. **Layout shell** — rewrite `src/components/layout/Layout.jsx` with sidebar + topbar + mobile Sheet. Add `CommandPalette.jsx` + keyboard shortcut hook.
4. **Home dashboard** — restyle `src/pages/Home.jsx` using KPI cards, charts, progress, activity.
5. **List pages** — `Tenders`, `PayOrders`, `Expenses`, `Contacts`, `Notes`, `Todo`, `Activity` one by one.
6. **Detail & misc** — `TenderDetail`, `Calendar`, `Settings`, `Search`, `Login`.
7. **Polish** — dark mode pass, status badge conventions, empty states, loading skeletons, toast colors.

After each phase: run `npm run build` and report what you changed and any issues. Do not move to the next phase without my go-ahead.

## Verification checklist

When the redesign is complete the app should:

- Use Inter for body and Figtree for display text everywhere.
- Use the OKLCH token palette with emerald primary — same tokens in light and dark.
- Have a collapsible sidebar + sticky topbar + working ⌘K command palette.
- Render every page inside Card containers with 12px radius, 1px borders, no heavy shadows.
- Use soft-colored Badge status pills, tabular-nums numbers, and lucide icons throughout.
- Work in both light and dark mode with no contrast issues.
- Have **identical functionality** to before — same routes, same data, same Firebase writes, same auth flow.

If you find any place where the visual change would require changing logic, stop and ask me first.
