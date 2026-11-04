# Project Intelligence implementation plan

> Execute inline with the feature implementation, TDD, migration safety and verification skills. The user explicitly authorized implementation and Draft PR publication in the supplied Phase 1.3 request. Reuse the existing clean checkout on a dedicated branch; no additional approval gate is needed.

**Goal:** Compact project intelligence and record navigation, an overlap-free Backlog, and a complete source-qualified read-only repository Markdown library.

**Baseline:** Clean `master@ecc91b1d70852d7c77f725e007edc6b918541f67`, confirmed against the remote. Branch `codex/phase-1-3-project-intelligence`.

**Spec:** User-supplied Phase 1.3 implementation request, read in full. Private reference data stays outside this repository. Only synthetic fixtures and screenshots may be committed.

## Architecture and constraints

- Keep WorkspaceService, existing 20-tool MCP registry, SQLite transactions, revision checks, receipts and portable v1/v2 record/history contracts.
- Source-status labels are display-only. Recognize explicit leading status tokens; preserve unknown/unrecognized values without inferring execution. Always retain the exact source text in task details.
- Extract a compact Overview and compact question/decision/security/architecture workspaces from App. Reuse the existing editor and paged history; a consistent focused record drawer exposes every field, related record and claim without upgrading recorded claims into verification.
- Repository Library is a desktop-only allowlisted capability. A native directory chooser authorizes a local Git root; there is no arbitrary filesystem MCP tool or automatic URL checkout.
- Read committed Git snapshots pinned to a resolved exact SHA. Ignore working-tree changes until committed; say so in the UI. No hooks, shell, Git filters, network, source writes or document-body imports.
- New local-only SQLite index/configuration and append-only observation tables use migration 3. Index metadata only; portable project packages remain format 2 and exclude machine-local paths/cache. Local mutations share the global operation-receipt namespace and commit state/event/receipt together.
- Reindex resolves the configured ref again, builds metadata off-transaction and commits only after revision checking. Failed observations preserve the prior successful index and all managed project state. Added/changed/removed paths compare blob identities.
- Validate repository roots, metadata paths and document membership. Skip Git symlinks/submodules, reject traversal/absolute/invalid paths, and read blobs by pinned object ID. Bound Git time/output and read large document content in explicit UTF-8-safe pages with progress and no silent truncation.
- Library metadata includes path, bounded source-heading title with filename fallback, path-qualified category/status, blob ID, byte size, branch/ref, exact commit and observation time. Unknown provenance/status stays unknown. Full bodies load on demand; managed-document limits are unchanged.
- Relative document and heading links stay inside the indexed repository. Markdown retains existing HTML/image/network restrictions.

## Review focus

1. Long and unrecognized source statuses must stay inside their columns while retaining exact drawer text.
2. Large record collections must not produce an unbounded initial Overview or lose access to hidden rows/history/alternatives.
3. A malicious path, symlink, option-like ref, local Git configuration or missing source must not escape the selected repository or trigger a network/write operation.
4. A refresh/read racing another source revision must not mix content and metadata from different snapshots or lose the last good index.
5. Local source cache changes must not rewrite or invalidate v1/v2 records, events, receipts, package custody or managed document history.

## Stage 1 — Backlog and Overview

Files: `src/ui/work/{BacklogView,shared,model,work.css}`, new `src/ui/intelligence/{Overview,model,intelligence.css}`, `App.tsx`, focused UI/Electron tests.

- [x] Add regressions for explicit/ambiguous/unrecognized long statuses and 42 blockers, reproduce actual Electron geometry overlap at 1024/1366/1920.
- [x] Implement compact display labels and bounded, wrapping/clipped cells; preserve full task source text.
- [x] Implement identity/source revision/freshness qualification, counts, work distribution, five initial actionable blockers, all-blocker access, concise recent changes and record shortcuts. Put complete context in expandable details.
- [x] Run focused and existing checks; commit the independently testable stage.

## Stage 2 — Record intelligence workspaces

Files: `src/ui/intelligence/{RecordWorkspace,RecordDetails}`, `App.tsx`, shared styles, selector and Electron tests.

- [x] Add failing navigation/preservation tests for Questions, Decision Register and four Security & Architecture subviews.
- [x] Implement compact searchable/filterable/paged rows and shared accessible details with full fields, links, alternatives, consequences, qualified confirmation claims and paged revision history.
- [x] Reuse revision-safe service writes through the existing editor; verify old/new revisions and MCP refresh behavior.
- [x] Run stage and existing tests; commit the stage.

## Stage 3 — Repository Library

Files: new `src/repository/{schema,git,library}.ts`, migration 3, narrow Electron/preload/bridge methods, `src/ui/documents/` components/navigation, `Records.tsx`, schema generator, synthetic Git fixtures and core/Electron tests.

- [x] Add synthetic Git tests for complete discovery, path/status/category metadata, pinned reads, >100 KB Markdown, UTF-8 pages, unsafe paths/symlinks/configuration, refresh diffs and unavailable sources.
- [x] Add local migration/receipt/revision/rollback and v1/v2 package preservation tests before implementing the library service.
- [x] Implement bounded read-only Git operations and transactional metadata observations without body copying or MCP filesystem access.
- [x] Add Managed Documents / Repository Library tabs with separate counts, native source selection, folders/category/path/title search, pinned source/freshness, truthful index results, on-demand preview and internal document/heading navigation.
- [x] Verify real ORBAN read-only acceptance at the requested source revision when locally available/acquirable; report actual counts/SHA and limitations without publishing private text or screenshots.
- [x] Run production build, all core/MCP/Electron tests, schema, formatting, connection and audit checks. Review the whole branch independently and fix material issues.
- [ ] Capture only synthetic screenshots, document compatibility/results/limits, commit and push, open a Draft PR against master, verify its final head and leave unmerged.

## Ledger

- Baseline clean and remote SHA matches. Existing checkout reused per host preference; dedicated feature branch created.
- Initial `npm ci` hit the running Electron binary's Windows lock. The app was on Overview with no edit dialog; closed gracefully, then lockfile install and all baseline tests passed. No user project migration or mutation was performed.
- Ruling: repository metadata/cache is machine-local, separate from portable managed records — avoids copying source bodies or private checkout paths into exported project packages and preserves existing custody hashes.
- Ruling: observe committed revisions, not a mutable working tree — exact-SHA provenance and reproducible on-demand reads; uncommitted edits require a source commit before reindex.
- Ruling: use explicit path markers for category/status; unrecognized status stays unknown. Initial filename-only metadata was refined to a bounded 8 KiB heading lookup for actual title search, with a disclosed filename fallback. Only header metadata is retained, not document bodies.
- Stage 1: reproduced Source/Sprint collision (chip right 5228 px vs next-cell left 1147 px at 1024). Two focused unit regressions and two real Electron regressions failed before the fix, then passed. Full production check passed 31 core/MCP/render tests and six Electron tests, including all prior work views and package/restart cases. Full source text remains exact in task details; Overview initially shows five of 42 blockers.
- Stage 2: added two failing real Electron journeys, then implemented question/decision registers and four security/architecture subviews. Fixed editor layering/focus and reverse component relationship navigation; details history now loads on demand. The original smoke test follows the new tabs/drawer while retaining its content and persistence assertions. Full production check passes 31 core/MCP/render tests and eight real Electron tests.
- Private reference acquisition: earlier temporary matches were import artifacts and an existing candidate checkout had no valid HEAD. A separate no-checkout clone outside this repository was acquired for authorized read-only acceptance. Remote develop and the clone resolve to the supplied SHA; independent Git inventory confirms 284 Markdown files, 271 under Docs, eight over 100 KB (largest 240259 bytes). No private document body or copied DMK2 record is in this branch. Original user DB v2 table counts/hashes were captured read-only in ignored local results.
- Stage 3 evidence so far: core regressions found/fixed BOM loss and external per-worktree configuration. Ten library tests plus three Markdown/navigation tests pass. The full Electron library journey passes, including exact inventory, >1 MB reading, internal links, refresh diffs, restart, unavailable source and unchanged managed export. Profiling reproduced GFM's slow long wrapped-prose case (about 9–11 seconds); whitespace-equivalent soft-break normalization for ordinary prose reduced it to about 0.58 seconds while code/tables/hard breaks remain unchanged. Tests use an off-screen active-rendering window and bounded polling to avoid user input interference; assertions still check the end marker and its visible geometry through heading navigation.
- Stage 3 final automated check: production build, 45 core/MCP/render tests and nine Electron tests passed, zero failures. Schema generation leaves portable v1/v2 schemas unchanged. Isolated stdio connection reports 20 tools; audit reports zero vulnerabilities. `get_summary` exposes a cached source-observation pointer without filesystem access; Overview qualifies it separately from agent pins. Managed Documents obtains the persisted library count before switching tabs; regression coverage includes restart.
- Actual imported source-status acceptance: 109-character value, held only in memory/an isolated external temporary database. Baseline Backlog component and CSS reproduce collision at all three requested widths; fixed layout contains the chip, and full drawer text remains exact. No private screenshot/value is committed.
- Private reference acceptance: 284 indexed, 271 under Docs, zero skipped/unavailable, eight complete large-file byte comparisons and Electron previews, 282 heading-derived titles, no renderer errors/network. Source identity and managed export unchanged. Original user DB remains version 2 with all five original table counts/hashes unchanged (139 records, 169 events). Fixed the connection-check script to create an empty temporary database explicitly, preventing the SDK's restricted environment inheritance from touching the live workspace.
- Independent whole-branch review identified and verified fixes for two P2 findings: underscore/literal-suffix heading-anchor collisions and branch/SHA mismatch during concurrent HEAD switching. New source resolution pins the full symbolic ref before its commit. Both regressions failed before their fixes; the reviewer independently passed 16 focused source/heading tests. Final `npm run check` passes 48 core/MCP/render tests and nine Electron tests. Repeated private-reference acceptance after the fixes reproduces all exact counts/eight complete previews with no errors/network; original DB hashes remain unchanged.
- Review rulings: private acceptance remains the implementer's separately verified evidence; non-Windows desktop is explicitly unverified. Two P3 resource recommendations are deferred and documented: stream directory enumeration (current budget checks follow each directory listing), and byte-bound local observation history (currently complete inventories, no UI consumer). The supported reference is small relative to these worst cases; metadata retention/compaction must preserve immutable audit evidence rather than silently rewriting history. No remaining blocking finding.

## Stage 3 interface rulings

- `RepositoryLibrary(databasePath)` opens a second existing WorkspaceDatabase connection. `getSnapshot(projectId)` is synchronous metadata-only; `describe(projectId)` adds a bounded read-only availability/current-ref probe. `connect(args, root)` and `refresh(args)` are async observation operations. `read({projectId,indexRevision,path,offset})` returns UTF-8-safe text pages, `nextOffset`, `totalBytes`, `hasMore` and pinned commit. A stale index revision fails explicitly.
- Native selection is `repositoryLibrary('choose', {projectId,expectedRevision,ref,operationId,origin})`. Main checks a replay receipt before opening the directory chooser, then passes the chosen root to `connect`; raw renderer-supplied paths are never accepted. Other actions are `get`, `refresh`, `read`, and bounded local observation history. Strict schemas and sender validation apply.
- Root/ref/index metadata lives in `repository_sources`; immutable before/after observations live in `repository_events`. Reuse global `operations` for local receipts with category `is_import=2`, excluded by the existing portable export query (`is_import=0`). Existing core/MCP/import operations still share and enforce the global ID namespace. State/event/receipt commit in one transaction after filesystem work completes. Format 2 and all existing managed-record schemas stay unchanged.
- Connect request hashes bind action, parsed client arguments and selected root. Main can verify an identical retry against the root in its stored receipt without reopening the chooser. Refresh hashes bind action and parsed arguments; expectedRevision binds the previously configured source. Changed roots/refs/arguments need a new operation ID.
- Git executable is resolved to an absolute trusted host path, never from the selected repository's working directory. Spawn directly with fixed arguments and `shell:false`; sanitize Git environment, disable optional locks/replacements/lazy fetch/global config. Reject unsupported linked worktrees, alternate object stores, partial clones, external config includes and Git-metadata symlinks. Bound traversal/time/output; report unsupported sources honestly.
- Inventory uses NUL-delimited `ls-tree` at a verified SHA, regular Markdown blobs only. Paths, object IDs and sizes are validated; symlinks are skipped. Per-page blob reads use the indexed object ID and bounded streaming, not arbitrary filesystem paths, shell strings or mutable working-tree files. Reindex reports blob-based added/changed/removed sets. Failed reads/refreshes preserve prior index and managed history.
