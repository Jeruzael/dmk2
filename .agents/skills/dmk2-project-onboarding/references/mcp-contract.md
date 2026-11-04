# DMK2 MCP contract reference (baseline Phase 1.2 / 0.2.0)

Authoritative sources: repository `src/core/schema.ts`, `src/core/service.ts`, `docs/integration.md` and runtime `get_capabilities`. **Runtime discovery wins**; this note is guidance, not a new API. The existing base server exposes 20 operations.

## Read-only discovery

`get_capabilities`, `list_projects`, `get_project`, `list_records` (optional `kind`), `get_record`, `get_summary`, `get_history`, `export_project`. `export_project` returns a portable package and should be treated as potentially sensitive. It is not needed for basic discovery. Neither `get_summary` nor any other Phase 1.2 MCP tool reads Git.

## Supported writes

`create_project`, `update_project`, `record_question`, `record_answer`, `record_decision`, `save_requirement`, `save_work_item`, `save_sprint`, `save_architecture`, `save_document`, `save_risk`, `import_project`.

- Mutations require `operationId` (globally unique, stable for exact retries), truthful `origin` and optionally `sourceRef`.
- Save calls use `projectId`, optional `id`, `expectedRevision` (0 on create) and validated `data`. For updates, use current `id` and full current data, preserving every field. `update_project` uses `projectId` and current revision, not record `id`.
- `record_answer` requires question `projectId`, `id`, current `expectedRevision`, `state`, `answer` and `rationale` (source reference optional). An answered state requires nonempty answer.
- On ambiguous transport failure, retry the *identical* tool and arguments with the same operation ID; changed input requires a fresh ID. On revision conflict, re-read and reconcile, never blindly overwrite.
- Record IDs come back from the server; do not fabricate target IDs. `relatedIds` must refer to existing records in the project. `parentId` and task `dependencies` must be work items; architecture `fromId`/`toId` must refer to architecture records. Preserve source links and their types.
- No deletion operation, automatic Git inspection, directory crawl, model-request execution, bulk project bootstrap or independent verification endpoint is exposed.

## Record mapping

| Kind | Crucial fields | Important allowed values |
| --- | --- | --- |
| `project` | `name`, `description`, `goals`, `lifecycle`, `repository`, `branch`, `observedCommit`, `sources` | `lifecycle`: idea/discovery/planning/implementation/maintenance/archived |
| `question` | `title`, `context`, `reason`, `state`, `answer`, `rationale` | state: unanswered/answered/deferred/not-applicable |
| `decision` | `title`, `alternatives`, `selectedOption`, `rationale`, `consequences`, `confirmation` | status: proposed/accepted/superseded/rejected/deferred |
| `requirement` | `title`, `statement`, `classification`, `priority`, `status`, `acceptanceCriteria`, `tests` | classification: functional/nonfunctional/security; priority: must/should/could; status: proposed/accepted/implemented/verified/deferred |
| `architecture` | `title`, `recordType`, `technology`, `fromId`, `toId`, `verification` | recordType: component/relationship/proposal/verification; status: proposed/selected/implemented/verified/deferred |
| `risk` | `title`, `threat`, `severity`, `mitigation`, `verification` | severity: unknown/low/medium/high/critical; status: open/mitigated/accepted/closed |
| `work_item` | `title`, `sourceIdentifier`, `sourceStatus`, `executionStatus`, `acceptanceCriteria`, `owner`, `evidence`, `parentId`, `dependencies`, optional `priority`/`risk`/`sprintId`/`checklist` | execution: unknown/backlog/in-progress/partial/blocked/completed/future |
| `sprint` | `title`, `goal`, optional `startDate`/`endDate` | dates never inferred |
| `document` | `title`, `category`, `markdown`, `repositoryPath` | managed note, *not* an indexed source file |

Every record kind has `title`, `description`, `sources` (array of strings) and `relatedIds` (record IDs). Arrays such as `acceptanceCriteria`, `tests` and `verification` hold **strings**, not objects. The schema is strict; avoid extra fields and check exact runtime schemas.

## Example minimal create (synthetic)

```json
{
  "operationId": "19ff6dd0-cb5b-4232-b445-5109fb739ff8",
  "origin": "agent-project-onboarding",
  "sourceRef": "user-request:synthetic-example",
  "data": {
    "name": "Synthetic Exercise",
    "goals": ["Organize documented milestones"],
    "lifecycle": "discovery",
    "repository": "",
    "branch": "",
    "observedCommit": "",
    "sources": []
  }
}
```

For `save_requirement`, specify `classification: "security"` explicitly when creating security requirements. The current UI editor defaults new requirements to `functional`, regardless of the selected Security tab.

## Phase 1.3 distinction

The separate [Draft PR #3](https://github.com/Jeruzael/dmk2/pull/3) proposes a desktop-only indexed Repository Library. It does not change the 20 MCP tool inputs. Do not assume this capability is merged, connected, current or an agent-accessible filesystem tool. Feature-detect runtime behavior.
