# Structured Workspace implementation plan

> Execute inline using the implementation, frontend, migration safety, TDD and verification skills. The user explicitly approved Proposal 2 and authorized implementation, push and a Draft PR. No additional design gate is needed.

**Goal:** Five useful Work Management views of the same durable task records, with a shared right drawer and honest planning/checklist indicators.

**Baseline:** Clean `master@9e353abf7486d13c731e295206b0081a1834d2dc`. The current implementation has nested work cards, not an existing Board/drawer; add the specified workflow within Plan & WBS without redesigning other pages.

**Authority:** User Phase 1.2 request and locally supplied `DMK2_Work_Management_Proposal_2_Spec_v1.md` (read in full). Reference artwork remains outside the repository. All committed fixtures/screenshots are synthetic.

## Constraints and design decisions

- Preserve sidebar, local-only Electron/preload/service/MCP path, execution/source statuses and all transaction/receipt invariants.
- New work fields are optional with no parsing defaults: `priority`, `risk`, `sprintId`, `checklist`. This keeps historical v1 snapshots and request hashes identical.
- Checklist entries have stable IDs, text and explicit done boolean; optional kind/evidence/source reference. They never imply verified requirements or tests.
- Add a small `sprint` record and `save_sprint` tool, using title/goal and optional ISO start/end dates. Validate same-project sprint references and date ranges.
- Append SQLite migration 2 as an additive contract-version marker, without rewriting migration 1 or snapshots/events. Old binaries reject the newer marker instead of misreading new records.
- Export package v2; continue accepting v1 with its original semantics. Custody events remember source package version (optional for original v1 events) so historical request hashes remain reproducible.
- Board uses seven existing execution statuses. WBS is an iterative expandable outline. Backlog/Board/checklist panels are paged. Sprints include unassigned work; progress labels state exactly what is counted.
- Shared drawer owns revision-safe drafts, four sections, checklist actions, conflict/reload/reconcile, focus restoration and dirty-close confirmation. No extra UI dependency.
- Per-project session view/filter state; committed refresh updates all views without replacing dirty drafts. History loads are bounded and selected-record history is paginated.

## Review focus

- v1 packages with custody receipts and pre-redesign DB snapshots must retain exact history and replay/hash validity.
- Edits must not change source status, task execution, acceptance or checklist state implicitly.
- Conflicts must preserve draft text and require an explicit reload/reconcile choice.
- Filters/search must retain hierarchy context rather than hiding matching children.
- A 500-task nested project must remain responsive at 1024, 1366 and 1920 pixels, including drawer/keyboard use.

## Tasks

### 1. Compatible domain contract

Files: `src/core/{schema,database,package,service}.ts`, MCP registry, schema generator, synthetic v1 fixtures, focused core tests.
Interface: Existing `save_work_item` accepts optional planning fields; `save_sprint` uses normal create/revise arguments. Existing Entity/Event envelopes remain unchanged. v1 package data remains unmodified.

- [x] Capture baseline v1 fixtures before implementation and run baseline checks.
- [x] Add failing migration/legacy import/new field/sprint/checklist/conflict/round-trip tests.
- [x] Add optional schemas, migration 2, package v2 compatibility, same-project validation and MCP sprint tool; pass tests and regenerate schemas.

### 2. Shared Work Management UI

Files: `src/ui/work/{model,WorkManagement,BoardView,WbsView,BacklogView,SprintsView,ChecklistsView,TaskDrawer,work.css}`, limited App integration and sprint creation support.
Interface: `WorkManagement` consumes project, authoritative Entity records and refresh callback. Shared work selectors expose typed work/checklist/sprint data, deterministic filtering/sorting and hierarchy rows.

- [x] Write selector/rendering and desktop acceptance tests that fail on the missing views.
- [x] Build shared toolbar/tabs and drawer with revision-safe persistence and complete task links/history.
- [x] Build Board, compact WBS, paged spacious Backlog, optional Sprints and independent Checklists.
- [x] Integrate only into Plan & WBS and retain the other existing user journeys.

### 3. Qualify and publish

Files: focused MCP/Electron tests, `docs/structured-workspace.md`, synthetic screenshot artifacts, integration/compatibility notes.

- [x] Exercise MCP↔desktop edits, conflicts/retries, legacy state, restart and mixed-format package round trips.
- [x] Exercise 500 tasks, keyboard/focus/dirty close, all five views and target widths; capture synthetic screenshots only.
- [x] Run existing applicable checks, production build, MCP connection test, formatting and audit; obtain independent final review and fix material findings.
- [x] Commit/push feature branch; open Draft PR against master; report exact commit and remaining limitations. Do not merge.

## Ledger

- Repository/default branch verified against remote; existing checkout reused on dedicated feature branch.
- Ruling: original DOCX and Markdown are alternate formats of the same supplied specification; the full Markdown is the implementation reference. No document edits or public copies of the private concept image are needed.
- Five views and shared drawer implemented; optional fields have no legacy-mutating defaults. Migration and genuine v1 custody round trips pass with original values intact.
- Review found three integrity issues (untouched text normalization, imported-ID UI collisions, and forged legacy custody format claims). Focused regressions reproduce each; fixes pass independent review. Screenshot review also corrected compressed Board cards with a geometry assertion.
- Fresh production checks pass 29 core/MCP/render tests and four real Electron tests. Synthetic 500-task responsive screenshots and delivery evidence are in `docs/structured-workspace.md`.
- Lockfile reinstall, 20-tool stdio connection test, formatting and audit pass. A fresh-install desktop rerun exposed a test-only assumption about initial project ordering; restart now explicitly selects the fixture project before checking durable state.
- Published implementation commit `e59928203b13f558a123019f051017d7cde9b9dc` on the dedicated branch and opened [Draft PR #2](https://github.com/Jeruzael/dmk2/pull/2) against unchanged `master`. Final publication head is reported in chat; no merge requested or performed.
