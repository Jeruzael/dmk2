# Phase 1.3 — Project Intelligence and Repository Library

Version 0.3.0 continues from verified `master@ecc91b1d70852d7c77f725e007edc6b918541f67` on `codex/phase-1-3-project-intelligence`. It retains the existing shell, Structured Workspace, 20 MCP tools and portable managed-record contracts.

Published for review in [Draft PR #3](https://github.com/Jeruzael/dmk2/pull/3), unmerged. Reviewed application commit: `e1d04ee99d89f864556ab40f686c6f9a52246c15`.

## Delivered UI

| Area                    | Behavior                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backlog                 | Compact explicit leading source classifications, exact original text in the task drawer, bounded chips and corrected column widths. Unrecognized/ambiguous values stay labeled Unrecognized. Real Electron geometry checks cover 1024, 1366 and 1920 px.                                                |
| Overview                | Identity/source pin, qualified observation freshness, requirement/decision/question/blocker counts, execution distribution, five initial blockers with access to all, five concise changes and record shortcuts. Complete context/provenance stays expandable. No overall completion score is inferred. |
| Decisions & Questions   | Questions and Decision Register tabs; compact searchable/filterable/paged rows; focused details with complete alternatives, reasoning, consequences, sources, linked records and on-demand revision history. Confirmation remains an agent-recorded claim.                                              |
| Security & Architecture | Components & Relationships, Architecture Decisions, Risks & Threats and Security Requirements. Related architecture decisions are explicitly linked, not inferred by title. Component details also expose incoming relationships. Recorded mitigation/status prose never establishes assurance.         |
| Documents               | Separate Managed Documents and Repository Library tabs, with separate counts. Managed notes retain their existing SQLite revisions/editor/history. Repository-owned files remain read-only source documents.                                                                                            |

The shared record drawer has independently scrolling content, focus handling, Escape close and linked-record navigation. Existing editors continue to use revision checks; editor focus and overlay ordering are covered by Electron interactions. All previous Board/WBS/Backlog/Sprints/Checklists journeys remain in the test suite.

## Repository Library workflow

1. Open **Documents → Repository Library → Choose repository** and select the top-level folder of a complete local Git checkout.
2. The default ref is `HEAD`. A branch, tag or commit can be entered; the index records its resolved exact SHA, branch when known, and observation time.
3. Browse folders, categories and source-status markers; search path/title/category; choose a file for an on-demand preview. Internal document links, encoded paths and heading targets stay inside the indexed source.
4. After the coding agent changes and **commits** source files, use **Refresh index**. Added/changed/removed paths compare pinned blob identities. **Check source** probes the configured ref without replacing the index.

The reader observes committed snapshots. Untracked files and uncommitted edits are excluded. A URL-only project is not silently indexed; acquisition/checkout remains an explicitly authorized action for the user's coding agent. DMK2 does not clone, fetch, edit repository files or request provider credentials.

Inventory is repository-wide for tracked `.md`, `.markdown` and `.mdown` files, including tracked vendor folders. Git symlinks and non-regular entries are skipped with reasons. Categories come from path markers; canonical/draft/archived labels are explicitly qualified as path-marked. Unrecognized status stays unknown. Titles use an H1 in a bounded 8 KiB metadata header, otherwise a disclosed filename fallback. Full source bodies are not copied into managed records.

Preview reads pinned Git blob IDs in explicit UTF-8-safe pages of at most 1 MiB. The UI shows loaded/total bytes and a completion label; it never silently truncates a file at the managed-document limit. The managed Markdown field remains limited to 100,000 characters. Heading navigation can load up to four additional pages automatically; more distant content remains available with **Load more content**. Duplicate and nested-format heading IDs are stable.

Ordinary long prose uses whitespace-equivalent CommonMark soft-break normalization during preview rendering. Exact source bytes stay intact; code fences, tables, structured Markdown and explicit hard breaks are preserved. A 1,456,071-byte synthetic prose case improved from approximately 9–11 seconds to approximately 0.6 seconds in the focused render check. This is local evidence, not a cross-machine performance guarantee.

## Storage, safety and compatibility

Migration 3 creates only `repository_sources` and immutable `repository_events`; it does not rewrite old project/record/event/import/receipt rows. Source configuration, metadata and refresh observations are local to the machine. New local receipts use the existing globally unique operation namespace with `is_import=2`. A source snapshot, its before/after observation event and receipt commit or roll back together, after Git inspection completes and the expected revision is checked again.

Portable exports remain **format 2**, with **format 1 and 2** imports supported. Local source paths/cache/receipts are excluded from packages; reconnect a checkout after importing elsewhere. Genuine legacy fixtures, before/after replay, custody checksums and idempotency hashes remain covered by the existing compatibility tests. New `get_summary.repositoryObservation` exposes only cached revision/ref/branch/SHA/time/count metadata; it does not inspect Git or expose paths/bodies. MCP input contracts and the 20-tool registry remain unchanged.

The native directory chooser authorizes a root through one additional allowlisted preload capability. Strict action schemas, project scoping and the existing IPC sender checks apply. Read requests must identify an indexed regular Markdown path and current index revision. Git executes by absolute host executable with argument arrays, without a shell, optional locks, replacement objects, hooks, global config or network protocols. External config includes, per-worktree configuration, object alternates, partial clones and Git-metadata symlinks are rejected. File-body reads use blob IDs, not filesystem paths derived from Markdown links.

Inspection limits are explicit: 50,000 eligible Markdown files, 32 MiB tree output, 100,000 Git-metadata entries with a three-second budget checked during traversal, ten seconds per Git process, four concurrent heading-header readers with a thirty-second header lookup budget. A metadata directory is enumerated before its per-entry checks; streaming enumeration remains a resource-hardening follow-up. Entries beyond the title lookup budget retain filename titles. Failed or unsupported observations leave the last good index and managed data intact. These limits do not assert that indexed prose is verified or safe to execute.

Migration risk is low: two new initially empty tables, existing project foreign keys, no backfill/drop/cascade/reinterpretation. WAL, bounded writer acquisition and transaction rollback are unchanged. Older binaries reject database marker 3; downgrade writing is unsupported. Restore a pre-upgrade database backup to use an older binary rather than lowering the marker. The acceptance work used temporary databases and fingerprinted the original user workspace read-only.

## Verification evidence

Windows x64, 2026-11-05 (Asia/Taipei); host Node 22.23.3 and real Electron 45.2.2. No new dependency was added. Lockfile installation succeeded after closing the running app that held the Electron executable locked.

- Automated checks cover source/Sprint geometry, 42 blockers, complete record details/claims/links/revisions, MCP refresh, all work views, source inventory, unsafe paths/refs/symlinks/configuration, UTF-8 and BOM preservation, atomic rollback, long rendering, source disappearance, restart and portable legacy/current packages.
- `npm run check` passed after review fixes: production build, **48 core/MCP/render tests and nine real Electron tests**, zero failures. `npm run schema` completed; the existing portable v1/v2 schemas are unchanged. Formatting and whitespace checks passed. `npm run mcp:test` connected with **20 tools** in an empty temporary workspace; `npm audit` reported **zero vulnerabilities**. No third-party model request was made.
- The actual imported 109-character source-status value reproduced the baseline component/CSS collision at 1024, 1366 and 1920 px. The fixed component contained it at all three widths and preserved the exact drawer text. This private-value acceptance used memory and an isolated temporary database, with no private screenshot or committed value.
- Real Electron exercises the native source-selection handler with deterministic dialog results, not a filesystem bypass from the renderer. Its synthetic source includes a tracked symlink, vendor Markdown, duplicate headings, encoded links and a document over 1 MB. The test window renders off-screen to avoid user input interference; end-of-file content and heading-navigation geometry are asserted.
- A separate authorized private-reference check at `17a3b0e4fd4de2b752809c905d160de9c397f186` indexed **284** eligible Markdown files, **271** under `Docs/`, with **zero skipped/unavailable**. All **eight files over 100 KB** were byte-compared against Git and previewed in real Electron; the largest is **240,259 bytes**. Heading metadata was available for 282 files, with two filename fallbacks. No renderer errors or network requests occurred. Managed export and source identity were unchanged. No private screenshot, body or copied project record is included here.

The original user database remains at marker 2: read-only comparison matched every project, record, event, operation and import table count/hash captured before this work. Its 139 records and 169 history events were preserved. The connection-check script now creates its own temporary database because the SDK does not inherit arbitrary caller environment variables.

Publication head and review outcome are recorded in the PR and implementation-plan ledger. Machine-specific logs and private-reference aggregates are under ignored `test-results/`; private source bodies and runtime databases are not stored in this checkout.

Independent whole-branch review found two material issues, both fixed with failing-then-passing regressions: underscore/literal-suffix heading-anchor collisions and branch/SHA provenance during a concurrent HEAD switch. Source resolution now chooses the full symbolic ref before peeling its SHA. The reviewer rechecked the fixes and independently passed all 16 source/heading tests, with no remaining blocking findings. Private acceptance was verified by the implementer, outside the reviewer's scope; non-Windows desktop remains unverified.

## Synthetic screenshots

[Overview](screenshots/project-intelligence/overview-1366.png) · [Backlog](screenshots/project-intelligence/backlog-1366.png) · [Decision Register](screenshots/project-intelligence/decisions-1366.png) · [Security Requirements](screenshots/project-intelligence/security-1366.png) · [Repository Library](screenshots/project-intelligence/repository-library-1366.png) · [Repository preview](screenshots/project-intelligence/repository-preview-1366.png)

## Remaining limits

This milestone supports regular complete local Git checkouts, not linked worktrees, bare/partial clones or alternate object stores. Git must already be installed. Source configuration is deliberately local rather than portable. There is no automatic remote acquisition, push update subscription, repository editing, full-text body search, Mermaid execution or assurance inferred from documentation. H1 lookup is bounded and path-marker status can remain unknown. Extremely large or complex Markdown can still be expensive despite paging; the tested large-file range is stated above. macOS/Linux desktop acceptance, signed installers and interactive third-party model-client sessions remain unverified. Publication is a Draft PR; no automatic merge is authorized.

Two nonblocking review recommendations are deferred: stream Git-metadata enumeration, and replace full-inventory local observation-history responses with byte-bounded summary pages. History currently returns at most 50 complete before/after snapshots and has no UI consumer; repeated observations also duplicate metadata in immutable events/receipts. Large histories can therefore consume substantial memory and disk. The tested 284-document reference is below this scale; compacting immutable history needs a separately designed retention/compatibility policy.
