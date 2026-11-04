# Phase 1 verification

This report records the original milestone. Current redesign evidence is in [Phase 1.2 Structured Workspace](structured-workspace.md).

Acceptance date: 2026-11-04, Windows x64. All content was synthetic. No paid model or model-provider request was executed by DMK2 or its acceptance clients.

## Environment

- Dedicated clean DMK2 checkout initially at `55dac642ea45c97386821fb2ed1974be1024166a`, default `master` confirmed against GitHub.
- Node 22.23.3, npm 10.9.9, Git 2.43.0.windows.1.
- Electron 45.2.2, React 19.3.1, Vite 8.3.5, TypeScript 7.0.2, official MCP SDK 1.32.2, Zod 4.6.7. Exact dependency graph in the lockfile.
- Native Electron downloaded successfully. No native addon compilation or Visual Studio tooling was needed. Node 22 emits its upstream experimental `node:sqlite` warning on stderr.
- GitHub SSH authentication was unavailable and `gh` absent. HTTPS and the GitHub connector are used for publication.

## Executed checks

| Command                | Verified behavior                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run build`        | Strict TypeScript, Electron/main/MCP compilation, bundled sandbox preload and production Vite output |
| `npm test`             | Service and real-stdio acceptance tests described below                                              |
| `npm run test:desktop` | Real Electron UI, persistence, sandbox and package-dialog handler smoke test                         |
| `npm run mcp:test`     | Initialize real stdio server, discover 19 tools and call capabilities                                |
| `npm run schema`       | Generate documented JSON Schema artifacts                                                            |
| `npm run licenses`     | Generate installed dependency license/notice inventory                                               |
| `npm audit`            | Installed dependency vulnerability audit (not a security certification)                              |

Final counts and review disposition are recorded in the delivery report. Test screenshots, runtime versions and desktop assertions are written under ignored `test-results/`. Public source fixtures contain synthetic text only.

## Synthetic Fitness acceptance coverage

The official SDK client launches the built MCP entrypoint as a separate stdio process and initializes the actual protocol. It creates **Sample Fitness Project**, then submits three discovery questions, answers two and defers one, records two storage architecture proposals, a selected SQLite decision with rationale and a synthetic user-confirmation conversation reference, functional/security requirements, a hierarchical WBS and dependency, and a work-item revision preserving source DONE versus execution partial. It creates/revises a Markdown brief and records a risk/mitigation. This produces **14 records and 20 project events**, including project creation.

The protocol test verifies tool discovery, actual summaries, stale-revision rejection, identical-operation retry without duplicate records/events, malformed version rejection with an unchanged destination, complete record/revision/project-event/receipt equality after import into a separate fresh data directory, and restart persistence. Successful import adds one explicit custody event; originals remain unchanged.

Two independently launched MCP server processes concurrently submit 20 work items while reading the same WAL database. They then race updates at the same project revision: exactly one succeeds and the other reports a conflict. The final event count confirms no missing/extra writes. Startup migration acquisition is also exercised concurrently.

Service tests additionally cover atomic rollback when event insertion deliberately fails, cross-project references, invalid WBS references/cycles, unsupported future schema versions, forged packages with recomputed checksums, missing history, receipt inconsistency, normalized operation/hash validation, rejection of unsorted packages, preservation of import custody events and verified retry hashes through a second export/import with intervening edits, and **4,101 events paginated without truncation**. Rendering tests verify that old/new titles, source/execution statuses, document metadata, Markdown and removed values are visible in revision panels.

The desktop test independently creates the synthetic data using stdio, opens actual Electron, visits all six views, checks source DONE is visible separately, renders Markdown tables and code, follows an internal heading link, and verifies script/image content remains inert with zero remote requests and no renderer exceptions. It edits the document through the local form, closes/reopens Electron and confirms revision persistence. It drives the UI export handler, then imports into another isolated Electron data directory and checks the edited document. Native dialog return values are supplied deterministically by the test; OS dialog interaction itself is not automated. The document edit adds event 21.

## Genuine limits of verification

- SDK stdio interoperability is tested; Codex CLI, Claude Code and Gemini CLI settings are documented against official sources but interactive host/model sessions were not run.
- Windows x64 desktop is tested; macOS/Linux have not been accepted on desktop.
- Source-launch flow is tested; signed installers, distribution packaging, crash/power-loss recovery and multi-gigabyte workloads are not qualified.
- Lock serialization and simultaneous clients are tested; no arbitrary-duration stress or performance benchmark is claimed.
- Markdown test covers representative HTML/script/remote-image content, sandbox flags and network denial; this is not a comprehensive security audit.
- The earlier incomplete-entrypoint desktop attempt failed. The test now builds the entire application before launch, and later runs exercise the built app successfully.
