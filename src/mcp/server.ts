import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WorkspaceService } from "../core/service.js";
import { databasePath } from "../core/paths.js";
import { modifyingTools, toolSchemas, type ToolName } from "../core/schema.js";

const service = new WorkspaceService(databasePath());
const server = new McpServer({ name: "dmk2", version: "0.3.0" });
const descriptions: Record<ToolName, string> = {
  get_capabilities:
    "Discover local DMK2 capabilities, record kinds and limits.",
  list_projects: "List local projects with stable IDs and recorded provenance.",
  create_project:
    "Create a project. Use a unique operationId; retry identical input safely.",
  get_project: "Read project identity, goals and observed source revision.",
  update_project:
    "Replace project information at expectedRevision. Preserve fields from get_project.",
  list_records: "List records in a project, optionally by kind.",
  get_record: "Read the current revision of one project record.",
  record_question:
    "Create or revise a discovery question. Updates need id and expectedRevision.",
  record_answer:
    "Record an answer, defer a question or mark it not applicable; preserves earlier revisions.",
  record_decision:
    "Create or revise a decision with alternatives, rationale and consequences. Confirmation is an agent claim requiring a conversation reference.",
  save_requirement:
    "Create or replace a functional, nonfunctional or security requirement with acceptance criteria.",
  save_work_item:
    "Create or replace a task or WBS node with optional priority, risk, sprint and checklist. Source status, execution, checklist completion and verification remain separate. References must exist in this project; preserve untouched fields.",
  save_architecture:
    "Create or replace a component, relationship, proposal or verification record.",
  save_document:
    "Create or replace Markdown content; source paths are metadata and never opened.",
  save_risk:
    "Create or replace an identified threat, mitigation and verification requirements.",
  save_sprint:
    "Create or revise an optional sprint/milestone with a title, goal and optional dates. Work items reference its stable ID; task-count and checklist progress do not prove delivery verification.",
  get_history:
    "Read immutable project events. Default ascending order pages with afterSequence; direction desc pages with beforeSequence. Search includes snapshots and provenance before pagination.",
  get_summary:
    "Read source-qualified counts, unresolved questions, blockers and local import receipts. No invented health or completion score.",
  export_project:
    "Return a versioned, checksummed JSON project package with all records, revisions, project events and operation receipts. No filesystem access.",
  import_project:
    "Validate and atomically import a package. Existing project IDs or operation IDs cannot be overwritten. A local import event is recorded separately from preserved project history.",
};
for (const [name, schema] of Object.entries(toolSchemas)) {
  const tool = name as ToolName;
  server.registerTool(
    tool,
    {
      description: descriptions[tool],
      inputSchema: schema,
      annotations: {
        readOnlyHint: !modifyingTools.has(tool),
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: unknown) => {
      try {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(service.execute(tool, args)),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                error instanceof Error
                  ? error.message
                  : "DMK2 operation failed",
            },
          ],
        };
      }
    },
  );
}
const transport = new StdioServerTransport();
transport.onclose = () => service.close();
await server.connect(transport);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
