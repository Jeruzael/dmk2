# MCP integration and workflow

Build first, then run `npm run mcp:config`. It resolves `process.execPath` and the actual `dist-node/mcp/server.js` path relative to its own file, so it works from any checkout location, including paths with spaces. Copy its generated values; the portable examples below use placeholders rather than personal machine paths.

## Codex CLI

Add the generated TOML to your Codex `config.toml`:

```toml
[mcp_servers.dmk2]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/dmk2/dist-node/mcp/server.js"]

# Optional: select the same data directory used by Electron
[mcp_servers.dmk2.env]
DMK2_DATA_DIR = "/absolute/path/to/local-dmk2-data"
```

The generator escapes Windows paths correctly. [Official Codex MCP configuration](https://developers.openai.com/codex/mcp).

## Claude Code

Merge the generated JSON into the project `.mcp.json` (or configure an equivalent local/user-scoped entry). Do not overwrite existing servers:

```json
{
  "mcpServers": {
    "dmk2": {
      "type": "stdio",
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/dmk2/dist-node/mcp/server.js"],
      "env": { "DMK2_DATA_DIR": "/absolute/path/to/local-dmk2-data" }
    }
  }
}
```

[Official Claude Code MCP instructions](https://code.claude.com/docs/en/mcp). Host-specific project trust prompts are controlled by Claude Code, not DMK2.

## Gemini CLI

Merge the generated `mcpServers` JSON into `.gemini/settings.json` or the user settings file. Use the same command, args and optional env fields as above; omit `type` for Gemini:

```json
{
  "mcpServers": {
    "dmk2": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/dmk2/dist-node/mcp/server.js"],
      "env": { "DMK2_DATA_DIR": "/absolute/path/to/local-dmk2-data" }
    }
  }
}
```

[Official Gemini CLI MCP settings](https://geminicli.com/docs/tools/mcp-server/).

## Connection test and support claims

`npm run mcp:test` spawns the actual built entrypoint with the official SDK's stdio client, performs initialization, lists all 20 tools and calls `get_capabilities`. `npm test` executes the entire synthetic Fitness workflow and concurrent clients through real stdio. Real Electron acceptance also seeds and updates a 500-task project through MCP. No model request, enrollment, account or API key is used for these checks. Codex, Claude Code and Gemini configurations are documentation/configuration support; interactive model-driven sessions in those hosts were **not** exercised in acceptance.

If no tools appear: check Node version, run `npm run build`, confirm the printed script exists, restart the host, and check the host's stderr logs. Running the server manually waits on stdin; it is not a browser endpoint. Electron needs the same `DMK2_DATA_DIR` to show the same projects. No client configuration is installed automatically.

## Exact tool list

| Tool                | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `get_capabilities`  | Discover version, supported operations and limits                  |
| `list_projects`     | List local project heads                                           |
| `create_project`    | Create project identity/goals/source facts                         |
| `get_project`       | Read current project head                                          |
| `update_project`    | Replace project information with revision check                    |
| `list_records`      | List a project's records, optional kind filter                     |
| `get_record`        | Read one current record                                            |
| `record_question`   | Create/revise question/context/reason/state                        |
| `record_answer`     | Answer, defer or mark not applicable                               |
| `record_decision`   | Create/revise options, chosen decision and rationale               |
| `save_requirement`  | Create/revise functional/nonfunctional/security requirement        |
| `save_work_item`    | Create/revise tasks, WBS, planning fields, checklists and evidence |
| `save_sprint`       | Create/revise optional sprint goals and dates                      |
| `save_architecture` | Create/revise components, relationships and proposals              |
| `save_document`     | Create/revise Markdown with source path metadata                   |
| `save_risk`         | Create/revise threat, mitigation and verification                  |
| `get_history`       | Search/page project events and entity revisions                    |
| `get_summary`       | Source-qualified counts/questions/blockers/import history          |
| `export_project`    | Return a complete structured project package                       |
| `import_project`    | Validate and atomically restore a nonexisting project              |

Use the server's tool discovery JSON Schema for exact arguments. All modifying calls require `operationId` and `origin`; optional `sourceRef` explains the source/decision. IDs and operation IDs accept 1–200 alphanumeric, `.`, `_`, `:`, or `-` characters. UUIDs are recommended. Updates replace data: preserve current fields and supply `expectedRevision`. `record_answer` preserves other question fields and appends its source reference.

Example create arguments:

```json
{
  "operationId": "discovery-001",
  "origin": "my-local-agent",
  "sourceRef": "chat:project-discovery/1",
  "data": { "name": "My project", "goals": ["Understand the next useful step"] }
}
```

Use returned `id` as `projectId` for subsequent record calls. `record_question` accepts `{projectId, operationId, origin, data: {title, context, reason}}`. After the user answers, call `record_answer` with the question `id`, its `expectedRevision`, state and answer/rationale/source reference. Link later requirements, decisions, tasks and documents using `relatedIds`; targets must already exist in the same project. Work parents/dependencies must refer to work items, architecture endpoints to architecture records.

See [AGENTS.md](../AGENTS.md) for when agents must record material chat facts. DMK2 does not capture conversations automatically.

## Structured work records (0.2.0)

`save_work_item.data` additionally accepts optional `priority` (`unknown`, `low`, `medium`, `high`, `urgent`), `risk` (`unknown`, `low`, `medium`, `high`, `critical`), nullable `sprintId`, and `checklist`. Missing fields stay absent; they are not backfilled into historical records. A sprint reference must identify a `sprint` record in the same project.

Each checklist step has a stable `id`, nonempty `text`, explicit boolean `done`, and optional `kind` (`implementation` or `verification`), `evidence` string array and `sourceRef`. IDs must be unique within the task; at most 500 steps are allowed. Setting `done` records an action, not a passing test or accepted requirement. Preserve all existing task fields during updates, including text whitespace in untouched arrays.

`save_sprint` uses the usual `projectId`, `operationId`, `origin`, optional `id` and `expectedRevision` envelope. Its data contains the common record fields (`title`, optional description/links/sources), `goal`, and optional ISO calendar `startDate`/`endDate`. If both dates are set, the end cannot precede the start. Dates are never generated automatically.

`get_history` retains ascending order by default. For recent bounded pages, use `direction: "desc"`, `limit`, then `beforeSequence` equal to the last returned sequence. `afterSequence` remains available as a lower bound. Search and entity filtering execute in SQLite before pagination. `get_summary.latestSequence` lets clients detect new project events without retrieving the complete history.

Version 0.2.0 reads package formats 1 and 2 and exports format 2. See [migration and custody compatibility](architecture.md#phase-12-contract-version-2).
