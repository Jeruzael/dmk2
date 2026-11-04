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
- Library metadata includes path, filename-derived title, path-qualified category/status, blob ID, byte size, branch/ref, exact commit and observation time. Unknown provenance/status stays unknown. Full bodies load on demand; managed-document limits are unchanged.
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

- [ ] Add failing navigation/preservation tests for Questions, Decision Register and four Security & Architecture subviews.
- [ ] Implement compact searchable/filterable/paged rows and shared accessible details with full fields, links, alternatives, consequences, qualified confirmation claims and paged revision history.
- [ ] Reuse revision-safe service writes through the existing editor; verify old/new revisions and MCP refresh behavior.
- [ ] Run stage and existing tests; commit the stage.

## Stage 3 — Repository Library

Files: new `src/repository/{schema,git,library}.ts`, migration 3, narrow Electron/preload/bridge methods, `src/ui/documents/` components/navigation, `Records.tsx`, schema generator, synthetic Git fixtures and core/Electron tests.

- [ ] Add synthetic Git tests for complete discovery, path/status/category metadata, pinned reads, >100 KB Markdown, UTF-8 pages, unsafe paths/symlinks/configuration, refresh diffs and unavailable sources.
- [ ] Add local migration/receipt/revision/rollback and v1/v2 package preservation tests before implementing the library service.
- [ ] Implement bounded read-only Git operations and transactional metadata observations without body copying or MCP filesystem access.
- [ ] Add Managed Documents / Repository Library tabs with separate counts, native source selection, folders/category/path/title search, pinned source/freshness, truthful index results, on-demand preview and internal document/heading navigation.
- [ ] Verify real ORBAN read-only acceptance at the requested source revision when locally available/acquirable; report actual counts/SHA and limitations without publishing private text or screenshots.
- [ ] Run production build, all core/MCP/Electron tests, schema, formatting, connection and audit checks. Review the whole branch independently and fix material issues.
- [ ] Capture only synthetic screenshots, document compatibility/results/limits, commit and push, open a Draft PR against master, verify its final head and leave unmerged.

## Ledger

- Baseline clean and remote SHA matches. Existing checkout reused per host preference; dedicated feature branch created.
- Initial `npm ci` hit the running Electron binary's Windows lock. The app was on Overview with no edit dialog; closed gracefully, then lockfile install and all baseline tests passed. No user project migration or mutation was performed.
- Ruling: repository metadata/cache is machine-local, separate from portable managed records — avoids copying source bodies or private checkout paths into exported project packages and preserves existing custody hashes.
- Ruling: observe committed revisions, not a mutable working tree — exact-SHA provenance and reproducible on-demand reads; uncommitted edits require a source commit before reindex.
- Ruling: use filename-derived titles and explicit path markers for initial metadata — index does not read every body. Actual document headings appear on demand; unrecognized status remains unknown.
- Stage 1: reproduced Source/Sprint collision (chip right 5228 px vs next-cell left 1147 px at 1024). Two focused unit regressions and two real Electron regressions failed before the fix, then passed. Full production check passed 31 core/MCP/render tests and six Electron tests, including all prior work views and package/restart cases. Full source text remains exact in task details; Overview initially shows five of 42 blockers.
