import { createHash } from "node:crypto";
import {
  entitySchema,
  packageSchema,
  projectData,
  recordSchemas,
  toolSchemas,
  toolKinds,
  type ChangeEvent,
  type ToolName,
  type Entity,
  type ProjectPackage,
  type RecordKind,
} from "./schema.js";
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}
export function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function validateEntity(entity: Entity): void {
  entitySchema.parse(entity);
  const schema =
    entity.kind === "project"
      ? projectData
      : recordSchemas[entity.kind as RecordKind];
  if (canonical(schema.parse(entity.data)) !== canonical(entity.data))
    throw new Error("Validation: incomplete entity payload");
  if (entity.updatedAt < entity.createdAt)
    throw new Error("Validation: inconsistent timestamps");
}
export function validateReferences(
  entity: Entity,
  entities: Map<string, Entity>,
): void {
  const d = entity.data;
  for (const ref of (d.relatedIds ?? []) as string[])
    if (!entities.has(ref) || entities.get(ref)?.kind === "project")
      throw new Error(`Invalid record reference: ${ref}`);
  if (entity.kind === "work_item") {
    const parent = d.parentId as string | null;
    for (const ref of [
      ...(parent ? [parent] : []),
      ...(d.dependencies as string[]),
    ])
      if (entities.get(ref)?.kind !== "work_item")
        throw new Error(`Invalid work item reference: ${ref}`);
    for (const field of ["parentId", "dependencies"] as const) {
      const active = new Set<string>();
      const done = new Set<string>();
      const stack = [{ key: entity.id, exit: false }];
      while (stack.length) {
        const { key, exit } = stack.pop()!;
        if (exit) {
          active.delete(key);
          done.add(key);
          continue;
        }
        if (done.has(key)) continue;
        if (active.has(key)) throw new Error(`Work item ${field} cycle`);
        const item = entities.get(key);
        if (!item) continue;
        active.add(key);
        stack.push({ key, exit: true });
        const next =
          field === "parentId"
            ? item.data.parentId
              ? [item.data.parentId as string]
              : []
            : (item.data.dependencies as string[]);
        for (const ref of next) stack.push({ key: ref, exit: false });
      }
    }
  }
  if (entity.kind === "architecture")
    for (const field of ["fromId", "toId"])
      if (d[field] && entities.get(d[field] as string)?.kind !== "architecture")
        throw new Error(`Invalid architecture reference: ${d[field]}`);
}

// A receipt is trusted for retries only if it describes the actual recorded call.
function recordedRequest(event: ChangeEvent): unknown {
  const tool = event.operation as ToolName;
  const base = {
    operationId: event.operationId,
    origin: event.origin,
    sourceRef: event.sourceRef,
  };
  let input: Record<string, unknown>;
  if (tool === "create_project") {
    if (event.entityType !== "project" || event.before)
      throw new Error("Invalid project creation operation");
    input = { ...base, data: event.after.data };
  } else if (tool === "update_project") {
    if (event.entityType !== "project" || !event.before)
      throw new Error("Invalid project update operation");
    input = {
      ...base,
      projectId: event.projectId,
      expectedRevision: event.previousRevision,
      data: event.after.data,
    };
  } else if (tool === "record_answer") {
    if (event.entityType !== "question" || !event.before)
      throw new Error("Invalid answer operation");
    const data = event.after.data;
    const expected = recordSchemas.question.parse({
      ...event.before.data,
      state: data.state,
      answer: data.answer,
      rationale: data.rationale,
      sources: [
        ...(event.before.data.sources as string[]),
        ...(event.sourceRef ? [event.sourceRef] : []),
      ],
    });
    if (canonical(expected) !== canonical(data))
      throw new Error("Answer operation changed unrelated question fields");
    input = {
      ...base,
      projectId: event.projectId,
      id: event.entityId,
      expectedRevision: event.previousRevision,
      state: data.state,
      answer: data.answer,
      rationale: data.rationale,
    };
  } else {
    if (!Object.hasOwn(toolKinds, tool) || toolKinds[tool] !== event.entityType)
      throw new Error("Unsupported history operation");
    input = {
      ...base,
      projectId: event.projectId,
      ...(event.before ? { id: event.entityId } : {}),
      expectedRevision: event.previousRevision,
      data: event.after.data,
    };
  }
  return { tool, args: toolSchemas[tool].parse(input) };
}
export function validatePackage(input: unknown): ProjectPackage {
  const pkg = packageSchema.parse(input);
  if (hash(pkg.payload) !== pkg.checksum)
    throw new Error("Package integrity checksum mismatch");
  const { project, records, events, operations, importHistory } = pkg.payload;
  // Stable array order is part of v1: custody hashes reconstruct earlier exports.
  if (
    records.some((r, i) => i > 0 && records[i - 1]!.id >= r.id) ||
    operations.some(
      (r, i) => i > 0 && operations[i - 1]!.operationId >= r.operationId,
    )
  )
    throw new Error(
      "Package records and operations must be in canonical ID order",
    );
  if (project.kind !== "project" || project.projectId !== project.id)
    throw new Error("Invalid project identity");
  const entities = new Map<string, Entity>();
  for (const entity of [project, ...records]) {
    validateEntity(entity);
    if (
      entities.has(entity.id) ||
      entity.projectId !== project.id ||
      (entity !== project && entity.kind === "project")
    )
      throw new Error("Invalid or duplicate entity identity");
    entities.set(entity.id, entity);
  }
  for (const entity of records) validateReferences(entity, entities);
  const replay = new Map<string, Entity>();
  const eventIds = new Set<string>();
  const opIds = new Set<string>();
  for (const [i, event] of events.entries()) {
    if (
      event.sequence !== i + 1 ||
      event.projectId !== project.id ||
      eventIds.has(event.id) ||
      opIds.has(event.operationId)
    )
      throw new Error("Invalid history sequence or duplicate event/operation");
    eventIds.add(event.id);
    opIds.add(event.operationId);
    const previous = replay.get(event.entityId) ?? null;
    if (
      canonical(previous) !== canonical(event.before) ||
      event.previousRevision !== (previous?.revision ?? 0) ||
      event.newRevision !== event.previousRevision + 1
    )
      throw new Error("Invalid revision history");
    const after = event.after;
    validateEntity(after);
    if (
      after.id !== event.entityId ||
      after.projectId !== project.id ||
      after.kind !== event.entityType ||
      after.revision !== event.newRevision ||
      after.updatedAt !== event.timestamp ||
      (previous &&
        (after.createdAt !== previous.createdAt ||
          after.kind !== previous.kind))
    )
      throw new Error("History snapshot mismatch");
    if (!previous && after.createdAt !== event.timestamp)
      throw new Error("Invalid creation timestamp");
    replay.set(after.id, after);
    if (after.kind !== "project") {
      if (replay.get(project.id)?.kind !== "project")
        throw new Error("Record history precedes project creation");
      validateReferences(after, replay);
    }
  }
  if (
    replay.size !== entities.size ||
    [...entities].some(
      ([key, value]) => canonical(value) !== canonical(replay.get(key) ?? null),
    )
  )
    throw new Error("History does not reproduce current state");
  const receiptIds = new Set<string>();
  const eventByOp = new Map(events.map((e) => [e.operationId, e]));
  for (const receipt of operations) {
    const event = eventByOp.get(receipt.operationId);
    if (
      receiptIds.has(receipt.operationId) ||
      receipt.projectId !== project.id ||
      !event ||
      canonical(receipt.result) !== canonical(event.after) ||
      receipt.requestHash !== hash(recordedRequest(event))
    )
      throw new Error("Invalid operation receipt");
    receiptIds.add(receipt.operationId);
  }
  if (operations.length !== events.length)
    throw new Error("Missing operation receipts");
  for (const [i, event] of importHistory.entries()) {
    validateEntity(event.after);
    if (
      event.sequence !== i + 1 ||
      event.projectId !== project.id ||
      event.entityId !== project.id ||
      event.after.id !== project.id ||
      event.after.projectId !== project.id ||
      event.after.kind !== "project" ||
      event.newRevision !== event.after.revision ||
      eventIds.has(event.id) ||
      opIds.has(event.operationId)
    )
      throw new Error("Invalid import history");
    const previousImportSequence = importHistory[i - 1]?.projectSequence ?? 0;
    if (
      event.projectSequence > events.length ||
      event.projectSequence < previousImportSequence
    )
      throw new Error("Invalid custody project sequence");
    const sourceEvents = events.slice(0, event.projectSequence);
    const sourceState = new Map(sourceEvents.map((e) => [e.entityId, e.after]));
    const historicalProject = sourceState.get(project.id);
    if (canonical(historicalProject ?? null) !== canonical(event.after))
      throw new Error("Import history project mismatch");
    const sourceOperationIds = new Set(sourceEvents.map((e) => e.operationId));
    const sourcePayload = {
      project: historicalProject,
      records: [...sourceState.values()]
        .filter((r) => r.kind !== "project")
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      events: sourceEvents,
      operations: operations
        .filter((op) => sourceOperationIds.has(op.operationId))
        .sort((a, b) =>
          a.operationId < b.operationId
            ? -1
            : a.operationId > b.operationId
              ? 1
              : 0,
        ),
      importHistory: importHistory.slice(0, i),
    };
    if (hash(sourcePayload) !== event.checksum)
      throw new Error("Invalid custody source checksum");
    const request = {
      tool: "import_project",
      args: {
        operationId: event.operationId,
        origin: event.origin,
        sourceRef: event.sourceRef,
        package: {
          format: "dmk2",
          schemaVersion: 1,
          checksum: event.checksum,
          payload: sourcePayload,
        },
      },
    };
    if (hash(request) !== event.requestHash)
      throw new Error("Invalid custody request hash");
    eventIds.add(event.id);
    opIds.add(event.operationId);
  }
  return pkg;
}
