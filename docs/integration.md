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

`npm run mcp:test` spawns the actual built entrypoint with the official SDK's stdio client, performs initialization, lists all 19 tools and calls `get_capabilities`. `npm test` executes the entire synthetic Fitness workflow and concurrent clients through real stdio. No model request, enrollment, account or API key is used for these checks. Codex, Claude Code and Gemini configurations are documentation/configuration support; interactive model-driven sessions in those hosts were **not** exercised in acceptance.

If no tools appear: check Node version, run `npm run build`, confirm the printed script exists, restart the host, and check the host's stderr logs. Running the server manually waits on stdin; it is not a browser endpoint. Electron needs the same `DMK2_DATA_DIR` to show the same projects. No client configuration is installed automatically.

## Exact tool list

| Tool                | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `get_capabilities`  | Discover version, supported operations and limits           |
| `list_projects`     | List local project heads                                    |
| `create_project`    | Create project identity/goals/source facts                  |
| `get_project`       | Read current project head                                   |
| `update_project`    | Replace project information with revision check             |
| `list_records`      | List a project's records, optional kind filter              |
| `get_record`        | Read one current record                                     |
| `record_question`   | Create/revise question/context/reason/state                 |
| `record_answer`     | Answer, defer or mark not applicable                        |
| `record_decision`   | Create/revise options, chosen decision and rationale        |
| `save_requirement`  | Create/revise functional/nonfunctional/security requirement |
| `save_work_item`    | Create/revise tasks, WBS, dependencies and evidence         |
| `save_architecture` | Create/revise components, relationships and proposals       |
| `save_document`     | Create/revise Markdown with source path metadata            |
| `save_risk`         | Create/revise threat, mitigation and verification           |
| `get_history`       | Search/page project events and entity revisions             |
| `get_summary`       | Source-qualified counts/questions/blockers/import history   |
| `export_project`    | Return a complete structured project package                |
| `import_project`    | Validate and atomically restore a nonexisting project       |

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
