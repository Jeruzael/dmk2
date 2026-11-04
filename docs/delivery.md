# Phase 1 bounded candidate delivery

This report records the original milestone. See [Phase 1.2 Structured Workspace](structured-workspace.md) for the current five-view redesign, compatibility evidence and synthetic screenshots.

DMK2 implements the Agent → standard MCP stdio → transactional SQLite → isolated Electron UI → durable revisions → portable export/import workflow. Architecture, table schema and migrations are in [architecture.md](architecture.md); exact tools, generated client configuration and agent workflow are in [integration.md](integration.md); [verification.md](verification.md) describes the acceptance evidence and its limits.

## Build and operate

```powershell
npm ci
npm run build
npm start
# Independent stdio process, usually launched by your AI client:
node dist-node/mcp/server.js
# Actual-path client configuration and no-model connection test:
npm run mcp:config
npm run mcp:test
```

Set `DMK2_DATA_DIR` identically in Electron and MCP when selecting a nondefault local workspace. No account setup is needed.

## Final verification result

On 2026-11-04 after a clean `npm ci`: `npm run check` passed strict typechecking, production builds, **16 unit/integration/rendering tests** and **1 real Electron desktop acceptance test** with no failures. `npm run mcp:test` discovered all **19 tools** and called capabilities over actual stdio. `npm audit` reported **0 vulnerabilities**. Formatting passed; license notices were generated for 235 installed packages. The desktop runtime reported Electron 45.2.2, Node 24.22.2 and SQLite 3.53.4.

An independent read-only reviewer approved the candidate for a Draft PR after the request-hash, revision-display and canonical-package-order regressions were fixed. It independently reran the 14 service/history tests. Remote CI and interactive model-driven client sessions are not claimed.

## Implemented

- Independent AGPL v3 application with pinned maintained dependencies and no copied DMK1 source/data.
- Seven typed record kinds plus project identity/goals/lifecycle/source metadata.
- Questions, answers/deferrals, decisions/options/rationale/confirmation claims and complete revision snapshots.
- Functional/nonfunctional/security requirements, optional WBS/dependency graphs, separate source/execution status and evidence.
- Documents, architecture proposals/components/relationships, risks, mitigation and verification references.
- Transactional state/events/idempotency, immutable history, optimistic conflicts, WAL and serialized writes.
- Nineteen explicit validated MCP operations; no shell, arbitrary file tools, TCP listener, OAuth or LLM SDK.
- Six consistent desktop views with intentionally empty states, search, structured local editing and safe Markdown.
- Schema-documented `.dmk2` packages, integrity/history/reference validation, atomic restore, identity conflict rejection and preserved import custody events.

## Limits and Phase 2 recommendation

Phase 1 is a source-launchable candidate, not an installer release. History is durable without an artificial cap, but the desktop currently keeps the loaded timeline in memory and is intended for modest local workspaces. Documents are limited to 100,000 characters; desktop import to 64 MiB. File attachments, arbitrary binary assets and secret detection/redaction are not provided.

Mermaid fences remain readable code. Automatic repository reconciliation, GitHub polling, WBS import adapters, background repository watchers, security standards mappings and chat capture hooks are deferred. There is no automatic verification of task completion, clean Git state, approval identity or project health. There is no authentication, multi-user security boundary, encrypted database or cloud collaboration.

Recommended Phase 2, in order:

1. Package/sign a Windows installer and qualify upgrade/restore behavior on real user profiles.
2. Add virtualized/paged desktop activity and document history with multi-process load/crash-recovery tests.
3. Add explicit, read-only repository observation and source reconciliation with provenance and conflict review; keep source status separate from implementation evidence.
4. Improve guided work-item/link editing, keyboard/focus accessibility, search and safe Mermaid rendering.
5. Qualify macOS/Linux and actual host connections in Codex CLI, Claude Code and Gemini CLI without adding provider dependencies to DMK2.

Published branch: `codex/phase-1-local-workspace`. [Draft PR #1](https://github.com/Jeruzael/dmk2/pull/1) targets `master`; it has not been merged. The implementation commit is `bcf3e05f8b389cce7b66e6962e05391f153881b6`; the final branch head is reported in chat to avoid a self-referential identifier. Commits are unsigned because the configured SSH signing helper waited for an unavailable passphrase; per-command overrides left global signing settings intact.
