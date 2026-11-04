import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import { z } from "zod";
import { WorkspaceDatabase } from "./database.js";
import { hash, validatePackage, validateReferences } from "./package.js";
import {
  kinds,
  modifyingTools,
  recordSchemas,
  toolKinds,
  toolSchemas,
  type ChangeEvent,
  type Entity,
  type ToolName,
} from "./schema.js";
type Args = Record<string, any>;
export class WorkspaceService {
  private store: WorkspaceDatabase;
  constructor(path: string) {
    this.store = new WorkspaceDatabase(path);
  }
  close(): void {
    this.store.close();
  }
  private snapshots(sql: string, ...params: SQLInputValue[]): any[] {
    return this.store.db
      .prepare(sql)
      .all(...params)
      .map((r) => JSON.parse(r.snapshot as string));
  }
  private project(id: string): Entity {
    const p = this.snapshots(
      "SELECT snapshot FROM projects WHERE id=?",
      id,
    )[0] as Entity | undefined;
    if (!p) throw new Error(`Project not found: ${id}`);
    return p;
  }
  private records(projectId: string): Entity[] {
    return this.snapshots(
      "SELECT snapshot FROM records WHERE project_id=? ORDER BY id",
      projectId,
    );
  }
  private record(projectId: string, id: string): Entity {
    const r = this.snapshots(
      "SELECT snapshot FROM records WHERE project_id=? AND id=?",
      projectId,
      id,
    )[0] as Entity | undefined;
    if (!r) throw new Error(`Record not found: ${id}`);
    return r;
  }
  execute(name: string, input: unknown): unknown {
    if (!Object.hasOwn(toolSchemas, name))
      throw new Error(`Unsupported operation: ${name}`);
    const tool = name as ToolName;
    let args: Args;
    try {
      args = toolSchemas[tool].parse(input) as Args;
    } catch (e) {
      if (e instanceof z.ZodError) throw new Error(`Validation: ${e.message}`);
      throw e;
    }
    return this.store.transaction(() => {
      if (!modifyingTools.has(tool)) return this.read(tool, args);
      const requestHash = hash({ tool, args });
      const receipt = this.store.db
        .prepare("SELECT request_hash, result FROM operations WHERE id=?")
        .get(args.operationId);
      if (receipt) {
        if (receipt.request_hash !== requestHash)
          throw new Error(
            "Idempotency conflict: operation ID already used for different input",
          );
        return JSON.parse(receipt.result as string);
      }
      const result =
        tool === "import_project"
          ? this.import(args, requestHash)
          : this.mutate(tool, args);
      const projectId =
        tool === "import_project"
          ? args.package.payload.project.id
          : (result as Entity).projectId;
      this.store.db
        .prepare(
          "INSERT INTO operations(id,project_id,request_hash,result,is_import) VALUES(?,?,?,?,?)",
        )
        .run(
          args.operationId,
          projectId,
          requestHash,
          JSON.stringify(result),
          tool === "import_project" ? 1 : 0,
        );
      return result;
    }, modifyingTools.has(tool));
  }
  private mutate(tool: ToolName, args: Args): Entity {
    let before: Entity | null = null;
    let kind: Entity["kind"];
    let data: Record<string, unknown> = args.data;
    if (tool === "create_project") kind = "project";
    else {
      this.project(args.projectId);
      if (tool === "update_project") {
        kind = "project";
        before = this.project(args.projectId);
      } else {
        kind = tool === "record_answer" ? "question" : toolKinds[tool]!;
        if (args.id) {
          before = this.record(args.projectId, args.id);
          if (before.kind !== kind)
            throw new Error("Record kind cannot change");
        }
        if (tool === "record_answer") {
          if (!before) throw new Error("Question not found");
          data = recordSchemas.question.parse({
            ...before.data,
            state: args.state,
            answer: args.answer,
            rationale: args.rationale,
            sources: [
              ...(before.data.sources as string[]),
              ...(args.sourceRef ? [args.sourceRef] : []),
            ],
          });
        }
      }
      if ((before?.revision ?? 0) !== args.expectedRevision)
        throw new Error(
          `Revision conflict: expected ${args.expectedRevision}, current ${before?.revision ?? 0}. Reload and retry with a new operation ID.`,
        );
    }
    const entityId = before?.id ?? randomUUID();
    const now = new Date().toISOString();
    const after: Entity = {
      id: entityId,
      projectId: kind === "project" ? entityId : args.projectId,
      kind,
      revision: (before?.revision ?? 0) + 1,
      createdAt: before?.createdAt ?? now,
      updatedAt: now,
      data,
    };
    if (kind !== "project") {
      const records = new Map(
        this.records(args.projectId).map((r) => [r.id, r]),
      );
      records.set(after.id, after);
      validateReferences(after, records);
      this.store.db
        .prepare(
          "INSERT INTO records(id,project_id,kind,snapshot) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot",
        )
        .run(after.id, after.projectId, kind, JSON.stringify(after));
    } else
      this.store.db
        .prepare(
          "INSERT INTO projects(id,snapshot) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot",
        )
        .run(after.id, JSON.stringify(after));
    const sequence = Number(
      this.store.db
        .prepare(
          "SELECT COALESCE(MAX(sequence),0)+1 AS next FROM events WHERE project_id=?",
        )
        .get(after.projectId)?.next,
    );
    const event: ChangeEvent = {
      id: randomUUID(),
      sequence,
      projectId: after.projectId,
      entityType: kind,
      entityId,
      operation: tool,
      operationId: args.operationId,
      previousRevision: before?.revision ?? 0,
      newRevision: after.revision,
      before,
      after,
      origin: args.origin,
      timestamp: now,
      sourceRef: args.sourceRef,
    };
    this.store.db
      .prepare(
        "INSERT INTO events(id,project_id,sequence,entity_id,snapshot) VALUES(?,?,?,?,?)",
      )
      .run(
        event.id,
        event.projectId,
        event.sequence,
        event.entityId,
        JSON.stringify(event),
      );
    return after;
  }
  private read(tool: ToolName, args: Args): unknown {
    if (tool === "get_capabilities")
      return {
        name: "DMK2",
        version: "0.1.0",
        schemaVersion: 1,
        tools: Object.keys(toolSchemas),
        recordKinds: kinds,
        transport: "stdio",
        authentication: "local-user-process",
        limits: { historyPage: 1000, documentCharacters: 100000 },
        notes: [
          "Only explicitly submitted facts are recorded.",
          "Confirmation is an agent claim with a conversation reference.",
          "Source status is distinct from execution status.",
          "Export preserves project history; local import receipts are available in summaries.",
        ],
      };
    if (tool === "list_projects")
      return this.snapshots("SELECT snapshot FROM projects ORDER BY id");
    const project = this.project(args.projectId);
    if (tool === "get_project") return project;
    if (tool === "get_record") return this.record(args.projectId, args.id);
    if (tool === "list_records")
      return this.records(args.projectId).filter(
        (r) => !args.kind || r.kind === args.kind,
      );
    if (tool === "get_history") {
      return this.snapshots(
        "SELECT snapshot FROM events WHERE project_id=? AND sequence>? AND (? IS NULL OR entity_id=?) AND instr(lower(snapshot),lower(?))>0 ORDER BY sequence LIMIT ?",
        args.projectId,
        args.afterSequence,
        args.entityId ?? null,
        args.entityId ?? null,
        args.search,
        args.limit,
      );
    }
    if (tool === "get_summary") {
      const records = this.records(args.projectId);
      const work = records.filter((r) => r.kind === "work_item");
      const breakdown: Record<string, number> = {};
      work.forEach((r) => {
        const status = r.data.executionStatus as string;
        breakdown[status] = (breakdown[status] ?? 0) + 1;
      });
      return {
        project,
        counts: Object.fromEntries(
          kinds.map((k) => [k, records.filter((r) => r.kind === k).length]),
        ),
        executionStatus: breakdown,
        unresolvedQuestions: records.filter(
          (r) =>
            r.kind === "question" &&
            ["unanswered", "deferred"].includes(r.data.state as string),
        ),
        blockers: work.filter((r) => r.data.executionStatus === "blocked"),
        sources: project.data.sources,
        qualification:
          "Agent/application-submitted records only. Source labels and confirmation claims are not independent verification.",
        imports: this.snapshots(
          "SELECT snapshot FROM imports WHERE project_id=?",
          args.projectId,
        ),
      };
    }
    if (tool === "export_project") {
      const events = this.snapshots(
        "SELECT snapshot FROM events WHERE project_id=? ORDER BY sequence",
        args.projectId,
      );
      const operations = this.store.db
        .prepare(
          "SELECT id,request_hash,result FROM operations WHERE project_id=? AND is_import=0 ORDER BY id",
        )
        .all(args.projectId)
        .map((r) => ({
          operationId: r.id,
          requestHash: r.request_hash,
          projectId: args.projectId,
          result: JSON.parse(r.result as string),
        }));
      const importHistory = this.snapshots(
        "SELECT snapshot FROM imports WHERE project_id=? ORDER BY json_extract(snapshot,'$.sequence')",
        args.projectId,
      );
      const payload = {
        project,
        records: this.records(args.projectId),
        events,
        operations,
        importHistory,
      };
      return {
        format: "dmk2",
        schemaVersion: 1,
        checksum: hash(payload),
        payload,
      };
    }
    throw new Error(`Unsupported read: ${tool}`);
  }
  private import(
    args: Args,
    requestHash: string,
  ): { projectId: string; imported: boolean } {
    const pkg = validatePackage(args.package);
    const { project, records, events, operations, importHistory } = pkg.payload;
    if (
      this.store.db
        .prepare("SELECT id FROM projects WHERE id=?")
        .get(project.id)
    )
      throw new Error(
        "Project already exists. Import into a fresh data directory to preserve identity.",
      );
    for (const op of [...operations, ...importHistory]) {
      if (
        op.operationId === args.operationId ||
        this.store.db
          .prepare("SELECT id FROM operations WHERE id=?")
          .get(op.operationId)
      )
        throw new Error(
          `Import operation ID conflicts with existing operation: ${op.operationId}`,
        );
    }
    this.store.db
      .prepare("INSERT INTO projects(id,snapshot) VALUES(?,?)")
      .run(project.id, JSON.stringify(project));
    for (const r of records)
      this.store.db
        .prepare(
          "INSERT INTO records(id,project_id,kind,snapshot) VALUES(?,?,?,?)",
        )
        .run(r.id, project.id, r.kind, JSON.stringify(r));
    for (const e of events)
      this.store.db
        .prepare(
          "INSERT INTO events(id,project_id,sequence,entity_id,snapshot) VALUES(?,?,?,?,?)",
        )
        .run(e.id, project.id, e.sequence, e.entityId, JSON.stringify(e));
    for (const op of operations)
      this.store.db
        .prepare(
          "INSERT INTO operations(id,project_id,request_hash,result) VALUES(?,?,?,?)",
        )
        .run(
          op.operationId,
          project.id,
          op.requestHash,
          JSON.stringify(op.result),
        );
    for (const event of importHistory) {
      this.store.db
        .prepare("INSERT INTO imports(id,project_id,snapshot) VALUES(?,?,?)")
        .run(event.id, project.id, JSON.stringify(event));
      this.store.db
        .prepare(
          "INSERT INTO operations(id,project_id,request_hash,result,is_import) VALUES(?,?,?,?,1)",
        )
        .run(
          event.operationId,
          project.id,
          event.requestHash,
          JSON.stringify({ projectId: project.id, imported: true }),
        );
    }
    const importEvent = {
      id: randomUUID(),
      sequence: importHistory.length + 1,
      projectSequence: events.length,
      projectId: project.id,
      entityType: "project",
      entityId: project.id,
      operation: "import_project",
      operationId: args.operationId,
      origin: args.origin,
      timestamp: new Date().toISOString(),
      sourceRef: args.sourceRef,
      previousRevision: 0,
      newRevision: project.revision,
      before: null,
      after: project,
      checksum: pkg.checksum,
      requestHash,
    };
    this.store.db
      .prepare("INSERT INTO imports(id,project_id,snapshot) VALUES(?,?,?)")
      .run(importEvent.id, project.id, JSON.stringify(importEvent));
    return { projectId: project.id, imported: true };
  }
}
