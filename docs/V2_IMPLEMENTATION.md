# Version 2 checklist and release notes

The supplied live audit is evidence to investigate, not an instruction to change historical amounts. This branch preserves the uncommitted calendar and email integration work already present when Version 2 began.

| Finding | Confirmed code | Change and verification |
| --- | --- | --- |
| F01 | `TenderDetail` and `Home` derive “profit” from contract less recorded expenses | Shared forecast logic; missing cost forecast stays pending |
| F02 | Bill approval falls back to submitted amount; dashboard calls unbilled value receivable | Shared bill definitions, approved outstanding and unbilled separately |
| F03 | Work order status can override completed tender status | Execution state follows completed lifecycle and closeout date |
| F04 | PO detail joins by NIT/name/number | Stable `tenderRef` as canonical; legacy matches flagged for review |
| F05 | Global expense has a free text link and one amount | Project selector, payee and payment events; separate payable |
| F06 | PO records lack refund events | Instrument exposure, funded cash, follow-up and refund ledger |
| F07 | BOQ actual amounts and expenses coexist | Allocation is classification only; bill receipt events |
| F08 | KPI numbers use `overflow-wrap:anywhere` | No breaks inside digits; horizontal overflow when necessary |
| F09 | Detail section precedes project tabs | Tabs near top, compact financial summary |
| F10 | Health field list omits supported schema | Updated fields, review queue and dry-run migration report |
| F11 | Expense totals have different scopes | Project/firm/unassigned scope; reminders and backup limits documented |

Historical data to confirm with source documents:

| Affected records | Conflicting or incomplete values | Needed from owner |
| --- | --- | --- |
| Sharahe-Attar tender and PO register | Linked PO 17027774 versus register PO 17027775 | Bank instrument and tender award documents; confirm the correct instrument and canonical tender link |
| Awarded tender totals | Dashboard Rs 36,753,159 versus register Rs 36,248,159 (Rs 505,000 gap) | Approved work orders and revisions for all awarded tenders; identify the contract basis |
| Mustafabad tender | Completed/100% versus in-progress work order; blank actual completion; start date appears to equal submission date | Work order, commencement order, and completion certificate dates |
| Three POs flagged in Data Health | Tender IDs point to missing records | Confirm each PO's instrument number and whether it belongs to an existing tender or is standalone |
| Four held securities on completed works | Rs 61,000 plus three Rs 60,000 entries remain held | Bank refund/encashment receipts and contractual release eligibility for each instrument |
| Unassigned expense | Rs 4,200 outside linked-project expense total | Invoice/payment document and whether this is a project cost, firm overhead, or owner transaction |

No historical business value is inferred or overwritten.

Verification on 27 September 2026: `npm run check` passed (lint, 25 domain/integration tests, 22 UI tests, CSP, build). Portable Temurin JDK 21.0.12.1 and the Firestore emulator JAR were downloaded. `npm run test:rules` still could not start the emulator: Java's Windows selector fails to create an internal Unix-domain loopback pipe (`Invalid argument: connect`) under this Codex host, including with sandbox escalation. The five Firestore role tests therefore remain unverified and must run in a normal Windows terminal or CI. The dry run was exercised against `test/fixtures/v2-backup.json`; its output is `docs/v2-dry-run-example.json`. These figures are disposable examples, not the firm's historical totals. The local preview was checked at a narrow viewport in light and dark themes. Live authenticated screens and production financial records were not modified or verified in this task.

Before deploying: export business records from Settings and retain a Firebase backup. Run `node scripts/v2-migration-dry-run.mjs path/to/grett-backup.json > v2-review.json` on that export. Review the proposed forward/inverse changes and correct historical items with source documents; the command performs no writes. If a proposal is approved, `node scripts/v2-migrate-backup.mjs path/to/grett-backup.json v2-review.json v2-forward.json forward` creates a new offline backup file; `node scripts/v2-migrate-backup.mjs v2-forward.json v2-review.json v2-restored.json inverse` reverses it. The script refuses to overwrite a file, rejects stale proposals, and checks record counts and source totals. It does not import anything into Firebase. Reconcile the files before planning any future approved live migration. Run `npm run check` and review the local preview with `npm run dev` at `/v2-preview.html`. This preview uses synthetic local state and never writes to Firebase. A signed-in review of the full application requires an existing admin account. Deploy this branch to a Netlify draft/branch preview only; merge or promote to the production site after business reconciliation. The existing reminder settings describe browser-only delivery; the separate calendar/email integration in this working tree requires the setup described in `TENDER_CALENDAR_EMAIL_SETUP.md` before it can be claimed active. Record export excludes storage file contents and access configuration; back those up separately.
