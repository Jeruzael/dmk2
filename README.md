# DMK2 — Docmonstakrakin v2

**Your project canvas. AI does the organizing.**

A local desktop workspace for projects, requirements, WBS/tasks, questions, decisions, Markdown documents, architecture and risks. External AI clients organize records through standard MCP stdio. No account, login, API key, built-in model or listening server is required.

## Run the desktop app

Prerequisites: Windows x64 (verified), Git, npm and Node **22.13+ on the 22 line, or 24+**. Node 22.23.3 was used for acceptance. Dependencies are pinned in `package-lock.json`.

```powershell
npm ci
npm run build
npm start
```

Electron opens its own window. After source changes, use `npm run dev` to rebuild and launch. `npm run preview:ui` is an optional Vite layout preview with no database bridge; use Electron for functional work.

Electron's prebuilt download requires network access during installation/first launch. Node's built-in SQLite avoids native addon rebuilds, Visual Studio/C++ tooling and Python requirements. Node 22 prints an experimental SQLite warning to **stderr**; this does not enter the MCP protocol stream. Other operating systems have path support but have not been accepted on desktop in this milestone.

## Connect an agent

```powershell
npm run build
npm run mcp:config
npm run mcp:test
```

The configuration generator prints ready-to-copy Codex CLI TOML and Claude Code/Gemini CLI JSON using the **actual absolute Node executable and built server path on your machine**. It never edits your client settings. See [client examples and workflow](docs/integration.md), [AGENTS.md](AGENTS.md), and the [project onboarding agent skill](docs/onboarding-skill.md). The skill is optional agent guidance; it must be installed/discovered by a compatible host and does not add new MCP tools.

To run the independent MCP process directly:

```powershell
node dist-node/mcp/server.js
```

It waits for protocol input on stdin; stdout is reserved for JSON-RPC. The desktop app and MCP processes share the same database by default. They can run independently or concurrently.

## Local data and portability

Windows: `%LOCALAPPDATA%\DMK2\workspace.sqlite`. macOS: `~/Library/Application Support/DMK2/workspace.sqlite`. Linux: `${XDG_DATA_HOME:-~/.local/share}/dmk2/workspace.sqlite`.

Set `DMK2_DATA_DIR` to select another directory; **use the same value for Electron and MCP**:

```powershell
$env:DMK2_DATA_DIR = Join-Path $env:LOCALAPPDATA 'DMK2-Synthetic-Demo'
npm run sample
npm start
```

`sample` submits a synthetic **Sample Fitness Project** using a real stdio MCP client without requesting any AI model. Use an empty directory for a clean demo.

Use **Export project** to save a `.dmk2` JSON package and **Import .dmk2** to restore it. Export is a consistent transaction snapshot written to a sibling temporary file, flushed, then renamed. Import validates checksums, schemas, identifiers, links, history replay and operation receipts before any state is committed. Existing projects are rejected; import into a fresh directory to preserve identity. Import activity is itself durable and preserved across later exports. [Package contract](docs/architecture.md#portable-package).

The package contains submitted project records, including full historical text. Review that text before sharing. DMK2 never collects credentials, source clones or unrelated files; it cannot identify a secret an agent explicitly pastes into a document. Local runtime data and packages are Git-ignored.

## What works in Phase 1.2

- Six desktop views: Overview, Plan & WBS, Documents, Decisions & Questions, Security & Architecture, Activity.
- Plan & WBS has Board, expandable WBS, paged Backlog, optional Sprints and grouped Checklists, sharing one task drawer and filter state.
- Create/edit all record types locally or through 20 validated MCP tools, including `save_sprint`.
- Atomic state, append-only before/after events and idempotency receipts; optimistic revision checks.
- Source status separated from execution status, optional WBS, validated links and cycle checks.
- Safe Markdown headings, tables, lists, code and internal links; revision history and search.
- SQLite WAL, concurrent readers, serialized writers, bounded lock acquisition, versioned migrations.
- Portable exports/imports preserving project identity, records, every revision, provenance, events and retry receipts.
- Optional priority, risk, sprint assignments and structured checklist steps. Checklist counts remain distinct from execution, acceptance and verification evidence.

DMK2 records explicit submissions. It does not automatically observe chat, Git changes, repository health or implementation completion. Confirmation is an agent-recorded claim, not identity proof.

## Verify

```powershell
npm run build
npm test
npm run test:desktop
npm run mcp:test
npm audit
```

Tests use temporary synthetic databases. Real Electron tests exercise the original flows plus 500 tasks across five work views at 1024, 1366 and 1920 pixels, MCP updates, conflicts, restart, legacy packages and export/import. Native dialog results are deterministic. Evidence: [Structured Workspace delivery and screenshots](docs/structured-workspace.md) and [original Phase 1 verification](docs/verification.md).

## Structure and limits

See [architecture/schema](docs/architecture.md), [integration/tool reference](docs/integration.md), [Structured Workspace delivery](docs/structured-workspace.md) and [original delivery / Phase 2](docs/delivery.md). This remains a source-launchable desktop candidate. Installers, signed distribution, Mermaid rendering, automatic repository reconciliation and UI virtualization beyond bounded paging remain future work.

## License and provenance

GNU Affero General Public License v3; see [LICENSE](LICENSE). This is a new application. No DMK1 source or private project material was copied. Third-party packages retain their own licenses; `npm run licenses` generates an installed dependency notice inventory under ignored `test-results/`.
