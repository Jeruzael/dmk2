# Structured Workspace — Phase 1.2

Application version 0.2.0 implements the approved Work Management direction inside the existing Plan & WBS page. Work began from clean `master@9e353abf7486d13c731e295206b0081a1834d2dc` on `codex/phase-1-2-structured-workspace`. The existing sidebar, other workspace pages and local Electron/MCP architecture are retained.

## Views and shared behavior

| View       | Delivered behavior                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board      | Seven existing execution-status columns, readable cards, counts, bounded card rendering and keyboard-accessible task opening. Horizontal overflow stays within the board.                               |
| WBS        | Compact expandable parent/child outline, expand/collapse controls, source identifiers, descendant counts, execution/source labels and matching-child ancestor context. Standalone tasks remain visible. |
| Backlog    | Spacious paged table with source ID/title, parent, priority, risk, execution/source status and sprint. Long titles have room; overflow stays inside the table.                                          |
| Sprints    | Optional goal/date cards, unassigned work, scoped task lists, counts and explicitly labeled task-count completion. Sprint creation/edit and task assignment persist through the shared service.         |
| Checklists | Paged task groups, collapsible steps, completion filtering and actual completed/total counters. Toggling a step writes a task revision and activity event.                                              |

All views derive from the same current work-item entities. The shared toolbar supports search, execution status, source status, parent/group, priority, risk, sprint, owner and deterministic sorting. Tab/filter/sort state is remembered per project during the session. Refresh discovers MCP-created projects and MCP-updated tasks.

The right drawer has Details, Acceptance, Checklist, and Links & History sections. It edits status, description, source information, owner, planning fields, acceptance text, dependencies, related records and evidence; it also shows bounded revision history. It scrolls independently, traps keyboard focus, handles Escape, confirms dirty close and restores focus. Arrow/Home/End navigation works on the work tabs. Empty, loading, conflict and error states are explicit.

Source status, execution status, acceptance criteria, checklist counts and verification evidence remain separate. No schedule, project completion score or successful verification is inferred. Overlapping external edits require explicit reload or reconciliation; unrelated external fields survive reconciliation. Untouched acceptance/evidence/source arrays retain their original text exactly. Retry requests preserve the operation ID and arguments after ambiguous failures.

## Changed components and contracts

- `src/ui/work/`: shared selectors, toolbar, five views, drawer and scoped styling; `App.tsx` integrates them into Plan & WBS. `useHistory.ts` and `RecordHistory.tsx` provide bounded history reads.
- `src/core/schema.ts`, `work-values.ts`, `service.ts`, `database.ts`, `package.ts`: optional work fields, sprint records, revision/reference validation, migration marker and versioned package custody.
- `src/mcp/server.ts`: `save_sprint` brings the tool count to 20; the same service handles local and MCP mutations. Preload permissions were not expanded.
- `schemas/`: new v2 package/sprint schemas and additive work-item schema. The published v1 package schema is unchanged.
- `tests/work-contract.test.ts`, `work-ui.test.ts`, `work-desktop.test.mjs` and synthetic fixtures: compatibility, concurrency, selectors, real Electron flows and responsive acceptance.

Work items may include `priority`, `risk`, nullable `sprintId` and `checklist`. All four fields are optional with no parsing defaults. Checklist entries require stable IDs, text and explicit done booleans, with optional kind/evidence/source reference. Sprints use the existing entity envelope plus goal and optional calendar dates. Same-project sprint links, date ranges, duplicate checklist IDs, stale revisions and other invalid references are rejected atomically. See [exact integration contract](integration.md#structured-work-records-020).

## Migration and portability evidence

Migration 2 only advances the domain-contract marker; it does not rewrite released migration 1, tables, snapshots, event text or operation receipts. A synthetic v1 database is opened and all original state/event/receipt values compared exactly after upgrade. Older binaries reject the newer marker. This is forward upgrade compatibility, not permission to write a v2 workspace with old software.

Exports use package format 2; formats 1 and 2 are accepted for import. Original v1 snapshots are not backfilled with new defaults. Newly recorded import custody includes its source package version; missing version on authentic old custody means v1. Reconstruction validates each source version before checking canonical package checksums and request hashes. A forged v1 custody claim containing v2 fields is rejected without writes.

Committed v1 fixtures were generated using the baseline implementation before this change. Tests import a genuine v1 package with prior custody, export v2, import again, make new edits and repeat the round trip while checking original history and hashes. Real Electron acceptance opens a v1 project with empty optional planning/checklist data and compares its original records/history. A separate v2 fixture verifies that legal task ID `new` and sprint ID `unassigned` cannot collide with UI controls.

## Verification

Acceptance: 2026-11-04, Windows x64. Host Node 22.23.3; real Electron 45.2.2 with Node 24.22.2 and SQLite 3.53.4. Dependencies remain pinned; no new dependency was introduced. Every test database and screenshot uses synthetic content, separate from the user's local workspace.

| Check                                                        | Result                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `npm ci`                                                     | Lockfile installation succeeds.                                                              |
| `npm run check`                                              | Production/type builds, 29 core/MCP/render tests and four real Electron tests pass.          |
| `npm run mcp:test`                                           | Real stdio initialize/discover/capabilities check; 20 tools including `save_sprint`.         |
| `npm run schema`, `npm run format:check`, `git diff --check` | Generated contracts and formatting checked.                                                  |
| `npm audit`                                                  | No known vulnerabilities reported.                                                           |
| Independent review                                           | Three integrity findings fixed with regression coverage; final review approved for Draft PR. |

The 500-task acceptance uses nested/standalone work, mixed source/execution statuses, optional priorities/risks, checklist steps and real sprint records. It exercises all five views at 1024, 1366 and 1920 pixels, no page-level horizontal overflow, independently scrolling drawer, keyboard focus/dirty close, checklist history, MCP refresh, per-project session state, concurrent edits/reconciliation, sprint creation/assignment, SQLite restart and complete package round trips. All 15 measured tab transitions completed below the test's five-second bound; one recorded run measured 41–374 ms. These are local smoke timings, not a cross-machine performance guarantee. Rendering is bounded by paging/incremental controls rather than full virtualization.

The original Electron smoke test continues to verify other pages, Markdown restrictions, renderer isolation, native export/import handlers and restart. Both desktop reports contain no renderer errors; the original smoke reports no external requests. Logs and machine-specific timing reports are generated under ignored `test-results/`.

Codex/Claude/Gemini configurations remain supported examples; interactive model sessions in those clients were not exercised. macOS/Linux desktop acceptance and packaged installers remain unverified.

## Synthetic screenshots

All images below come from the automated 500-task fixture. The supplied private concept artwork was used locally and is not included.

| View       | Screenshot                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Board      | [1366 px](screenshots/structured-workspace/board-1366.png)                                                                           |
| WBS        | [1366 px](screenshots/structured-workspace/wbs-1366.png)                                                                             |
| Backlog    | [1366 px](screenshots/structured-workspace/backlog-1366.png)                                                                         |
| Sprints    | [1366 px](screenshots/structured-workspace/sprints-1366.png)                                                                         |
| Checklists | [1366 px](screenshots/structured-workspace/checklists-1366.png)                                                                      |
| Drawer     | [1024 px](screenshots/structured-workspace/board-drawer-1024.png), [1920 px](screenshots/structured-workspace/board-drawer-1920.png) |

## Deferred enhancements

Drag-and-drop transitions, bulk actions, push update subscriptions, cross-session saved filters, advanced sprint workflows and full UI virtualization are outside this change. Existing periodic record refresh remains; newly created projects are discovered with Refresh. No cloud, login, provider integration, repository scanner or DMK1 governance system was added. Existing installers/signing and Mermaid limitations remain as documented in the original delivery.

Close an older running window before using `npm start` to launch the newly built UI. Tests did not seed, import or migrate the user's default workspace. Published for review as [Draft PR #2](https://github.com/Jeruzael/dmk2/pull/2) against `master`; merging is left to the user. The implementation commit is `e59928203b13f558a123019f051017d7cde9b9dc`; the final publication head also includes this documentation update.
