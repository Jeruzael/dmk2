# Phase 1 architecture

```text
Local AI client ── MCP stdio ── independent Node process ─┐
                                                       ├─ WorkspaceService ─ SQLite WAL
React renderer ─ preload/IPC ─ Electron main process ───┘
```

There is no mandatory HTTP backend, cloud service, authentication system or provider SDK. The process launcher chooses filesystem permissions. Source repository paths/URLs are metadata, not commands or files the runtime opens.

## Directory responsibilities

| Path                   | Responsibility                                                |
| ---------------------- | ------------------------------------------------------------- |
| `src/core/schema.ts`   | Strict Zod tool/domain/package contracts and defaults         |
| `src/core/database.ts` | Versioned migrations, lock acquisition, transactions          |
| `src/core/service.ts`  | Shared validation, revision checks, reads/mutations/receipts  |
| `src/core/package.ts`  | Canonical JSON checksum, history replay, graph validation     |
| `src/core/paths.ts`    | Identical platform data location for UI and MCP               |
| `src/mcp/server.ts`    | Official SDK tool registry and stdio transport                |
| `src/electron/`        | Sandboxed window, allowlisted IPC, native package dialogs     |
| `src/ui/`              | Six React views, structured editor, Markdown and history      |
| `schemas/`             | Public JSON Schema package and per-kind data contracts        |
| `scripts/`             | Config generation, protocol connection test, synthetic sample |
| `tests/`               | Service, real stdio and real Electron acceptance              |
| `dist-node/`, `dist/`  | Ignored build outputs; main/preload/MCP and renderer          |

## SQLite schema and migration strategy

`PRAGMA user_version` is the schema version. Each numbered migration and version increment executes under `BEGIN IMMEDIATE`. A newer unknown version is rejected. Future changes append migrations; do not edit an already released migration or destructively reinterpret records. Package versions are separately validated.

Version 1 tables:

| Table        | Columns / constraints                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `projects`   | `id` primary key, JSON `snapshot`                                                                                                  |
| `records`    | `id` primary key, `project_id` FK, indexed `kind`, JSON `snapshot`                                                                 |
| `events`     | `id` primary key, `project_id` FK, per-project monotonic `sequence`, `entity_id`, JSON `snapshot`; unique `(project_id, sequence)` |
| `operations` | Globally unique `id`, `project_id` FK, canonical `request_hash`, JSON `result`, `is_import`                                        |
| `imports`    | `id` primary key, `project_id` FK, JSON import-event snapshot                                                                      |

An entity snapshot contains stable ID/project ID, kind, revision, creation/update timestamps and validated typed data. First-class record kinds are question, decision, requirement, work item, document, architecture and risk. JSON payloads allow a small schema while Zod validates every domain field. Cross-record references are enforced by the service because their targets live inside typed JSON.

Every successful mutation writes state, an immutable event and its operation receipt in one transaction. Events include identity/sequence, project/entity, operation, old/new revision, complete before/after snapshots, origin, timestamp and optional source reference. Database triggers reject event updates/deletions. There is no application deletion API or history cap. `get_history` pages at 200 events by default, up to 1,000 per page.

Create operations use generated UUIDs, revision 1. Revisions replace the full validated data at `expectedRevision`; records must exist and their kind cannot change. Missing `id` means creation at expected revision 0. Questions can be unanswered, answered, deferred or not applicable; answered questions require text. Confirmation claims require a conversation reference. Source status remains unverified source text, distinct from execution status and evidence.

Operation IDs are global to a workspace and preserved on export. Canonical normalized request contents are SHA-256 bound to the ID. Identical retries return their original result without writing; changed requests with an existing ID fail. A stale revision has no side effects or receipt. Import rejects colliding IDs rather than changing identity.

WAL and `synchronous=FULL` provide durable commits with concurrent readers. Writes acquire `BEGIN IMMEDIATE`; each acquisition waits up to 1 second and retries three more times with small bounded delays. Transaction callbacks are never retried after partial execution. Exceptions roll back. SQLite returns a readable busy error if contention exceeds this bound. Startup WAL/migration acquisition uses the same bound.

## Portable package

`.dmk2` is UTF-8 structured JSON, not an archive or executable. See [`schemas/dmk2-v1.schema.json`](../schemas/dmk2-v1.schema.json), per-kind schemas and the authoritative runtime validators.

```text
format: "dmk2"
schemaVersion: 1
checksum: SHA-256(canonical(payload))
payload:
  project: current project snapshot
  records: all current typed records, sorted by ID
  events: all project mutations, ordered by sequence
  operations: project-mutation retry receipts, sorted by ID
  importHistory: import events and their retry hashes, ordered by import sequence
```

Canonicalization sorts object keys recursively, preserves array order and uses JSON scalar serialization. Version 1 requires records in strictly ascending ID order and operations in strictly ascending operation-ID order; unsorted packages are rejected before import. The checksum detects corruption; it is not a signature or identity proof. Semantic validation checks typed payloads, unique identifiers, project isolation, references, parent/dependency cycles, consecutive event/revision chains, exact before/after replay, timestamps and receipt/result correspondence. Every operation name must match its entity kind, and each retry hash must match the normalized request reconstructed from the event. Static JSON Schema is the structural layer; cross-record and refinement rules also run in TypeScript.

Import preserves original project events byte-for-value as JSON. A new custody event in `importHistory` records the import itself without changing the original project event sequence. Its `projectSequence` identifies the last project event in the imported source. The validator reconstructs that earlier package (including earlier custody events), checks its checksum and binds the custody retry hash to the full original import request before restoring it as a retry receipt. Subsequent exports carry the prior custody events and retry hashes. Round-trip equality compares original records, revisions, project events and receipts; there is intentionally one additional import event per successful import. Import history sequences are project-scoped and separate from project-mutation sequences.

All validation precedes the first insert, then all inserts and the new import receipt/event commit atomically. Constraint errors also roll back the transaction. Existing projects are never replaced. Desktop imports are limited to 64 MiB; document content to 100,000 characters; arrays have schema bounds. MCP export/import exchange JSON values only and never read/write arbitrary paths. Native desktop dialogs grant bounded package file access. Export uses a consistent read transaction and atomic destination-file replacement; export itself makes no database mutation.

## Renderer boundary

Context isolation, sandboxing and disabled Node integration protect the renderer. Preload exposes exactly `execute`, `exportProject` and `importProject`, never raw IPC or Node. Main checks sender web contents, top frame and the built local page URL. The execute handler accepts named known tools, with export/import routed through native dialogs. Every input is validated again by the service.

The production CSP permits only bundled scripts/styles, forbids connections, frames, objects and media. Session requests block non-file content; new windows, permissions, webviews and external navigation are denied. Markdown omits raw HTML and images. Hash links, matching document source paths and `dmk2:document/<ID>` links navigate within the workspace; external URLs remain text. No embedded Mermaid execution is enabled in Phase 1.

There is no automatic secret scanner or encryption at rest. OS user permissions protect local files; an agent can explicitly submit sensitive text. Origin and confirmation fields are provenance claims. Local user access to the SQLite file can bypass application invariants; no cryptographic audit authority is claimed.
