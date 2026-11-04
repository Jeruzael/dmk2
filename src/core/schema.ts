import { z } from "zod";
import { executionStatuses, workPriorities, workRisks } from "./work-values.js";
export { executionStatuses, workPriorities, workRisks } from "./work-values.js";
export const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9._:-]+$/);
const text = z.string().max(100_000);
const short = z.string().max(2000);
const title = z.string().trim().min(1).max(300);
const refs = z.array(short.min(1)).max(500).default([]);
const links = z.array(id).max(500).default([]);
const common = {
  title,
  description: text.default(""),
  relatedIds: links,
  sources: refs,
};
export const checklistItemSchema = z.strictObject({
  id,
  text: z.string().trim().min(1).max(2000),
  done: z.boolean(),
  kind: z.enum(["implementation", "verification"]).optional(),
  evidence: z.array(short.min(1)).max(100).optional(),
  sourceRef: short.optional(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export const projectData = z.strictObject({
  name: title,
  description: text.default(""),
  goals: refs,
  lifecycle: z
    .enum([
      "idea",
      "discovery",
      "planning",
      "implementation",
      "maintenance",
      "archived",
    ])
    .default("idea"),
  repository: short.default(""),
  branch: short.default(""),
  observedCommit: z
    .string()
    .max(64)
    .regex(/^$|^[a-fA-F0-9]{7,64}$/)
    .default(""),
  sources: refs,
});
export const recordSchemas = {
  question: z
    .strictObject({
      ...common,
      context: text.default(""),
      reason: text.default(""),
      state: z
        .enum(["unanswered", "answered", "deferred", "not-applicable"])
        .default("unanswered"),
      answer: text.default(""),
      rationale: text.default(""),
    })
    .refine(
      (v) => v.state !== "answered" || v.answer.trim().length > 0,
      "An answered question needs an answer",
    ),
  decision: z
    .strictObject({
      ...common,
      alternatives: refs,
      selectedOption: text.default(""),
      rationale: text.default(""),
      consequences: text.default(""),
      status: z
        .enum(["proposed", "accepted", "superseded", "rejected", "deferred"])
        .default("proposed"),
      confirmation: z
        .strictObject({
          claimed: z.boolean(),
          conversationRef: short.default(""),
        })
        .default({ claimed: false, conversationRef: "" }),
    })
    .refine(
      (v) =>
        !v.confirmation.claimed ||
        v.confirmation.conversationRef.trim().length > 0,
      "A user-confirmation claim needs a supporting conversation reference",
    ),
  requirement: z.strictObject({
    ...common,
    classification: z
      .enum(["functional", "nonfunctional", "security"])
      .default("functional"),
    statement: text.min(1),
    priority: z.enum(["must", "should", "could"]).default("should"),
    status: z
      .enum(["proposed", "accepted", "implemented", "verified", "deferred"])
      .default("proposed"),
    acceptanceCriteria: refs,
    tests: refs,
  }),
  work_item: z.strictObject({
    ...common,
    parentId: id.nullable().default(null),
    dependencies: links,
    sourceIdentifier: short.default(""),
    sourceNamespace: short.default(""),
    sourceStatus: short.default("UNKNOWN"),
    executionStatus: z
      .enum([
        "unknown",
        "backlog",
        "in-progress",
        "partial",
        "blocked",
        "completed",
        "future",
      ])
      .default("unknown"),
    acceptanceCriteria: refs,
    owner: short.default(""),
    evidence: refs,
    lastSourceRevision: short.default(""),
    // No defaults on additive fields: v1 snapshots and normalized hashes stay exact.
    priority: z.enum(workPriorities).optional(),
    risk: z.enum(workRisks).optional(),
    sprintId: id.nullable().optional(),
    checklist: z
      .array(checklistItemSchema)
      .max(500)
      .refine(
        (items) => new Set(items.map((i) => i.id)).size === items.length,
        "Checklist IDs must be unique",
      )
      .optional(),
  }),
  sprint: z
    .strictObject({
      ...common,
      goal: text.default(""),
      startDate: z.iso.date().optional(),
      endDate: z.iso.date().optional(),
    })
    .refine(
      (v) => !v.startDate || !v.endDate || v.startDate <= v.endDate,
      "Sprint end date must not be before start date",
    ),
  document: z.strictObject({
    ...common,
    category: short.default("general"),
    markdown: text.default(""),
    repositoryPath: short.default(""),
  }),
  architecture: z.strictObject({
    ...common,
    recordType: z
      .enum(["component", "relationship", "proposal", "verification"])
      .default("component"),
    technology: short.default(""),
    fromId: id.nullable().default(null),
    toId: id.nullable().default(null),
    status: z
      .enum(["proposed", "selected", "implemented", "verified", "deferred"])
      .default("proposed"),
    verification: refs,
  }),
  risk: z.strictObject({
    ...common,
    threat: text.default(""),
    severity: z
      .enum(["unknown", "low", "medium", "high", "critical"])
      .default("unknown"),
    mitigation: text.default(""),
    status: z.enum(["open", "mitigated", "accepted", "closed"]).default("open"),
    verification: refs,
  }),
};
export type RecordKind = keyof typeof recordSchemas;
export const kinds = Object.keys(recordSchemas) as RecordKind[];
export const kindSchema = z.enum([
  "question",
  "decision",
  "requirement",
  "work_item",
  "document",
  "architecture",
  "risk",
  "sprint",
]);
export const entitySchema = z.strictObject({
  id,
  projectId: id,
  kind: z.enum([
    "project",
    "question",
    "decision",
    "requirement",
    "work_item",
    "document",
    "architecture",
    "risk",
    "sprint",
  ]),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  data: z.record(z.string(), z.unknown()),
});
export type Entity = z.infer<typeof entitySchema>;
export const eventSchema = z.strictObject({
  id,
  sequence: z.number().int().positive(),
  projectId: id,
  entityType: entitySchema.shape.kind,
  entityId: id,
  operation: z.string().min(1).max(100),
  operationId: id,
  previousRevision: z.number().int().nonnegative(),
  newRevision: z.number().int().positive(),
  before: entitySchema.nullable(),
  after: entitySchema,
  origin: short.min(1),
  timestamp: z.iso.datetime(),
  sourceRef: short.default(""),
});
export type ChangeEvent = z.infer<typeof eventSchema>;
export const receiptSchema = z.strictObject({
  operationId: id,
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  projectId: id,
  result: entitySchema,
});
export const importEventSchema = z.strictObject({
  id,
  sequence: z.number().int().positive(),
  projectSequence: z.number().int().positive(),
  projectId: id,
  entityType: z.literal("project"),
  entityId: id,
  operation: z.literal("import_project"),
  operationId: id,
  origin: short.min(1),
  timestamp: z.iso.datetime(),
  sourceRef: short.default(""),
  previousRevision: z.literal(0),
  newRevision: z.number().int().positive(),
  before: z.null(),
  after: entitySchema,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  packageVersion: z.union([z.literal(1), z.literal(2)]).optional(),
});
export const payloadSchema = z.strictObject({
  project: entitySchema,
  records: z.array(entitySchema).max(50_000),
  events: z.array(eventSchema).max(200_000),
  operations: z.array(receiptSchema).max(200_000),
  importHistory: z.array(importEventSchema).max(50_000),
});
export const packageSchema = z.strictObject({
  format: z.literal("dmk2"),
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  payload: payloadSchema,
});
export type ProjectPackage = z.infer<typeof packageSchema>;
const mutation = {
  operationId: id,
  origin: short.min(1),
  sourceRef: short.default(""),
};
const save = {
  ...mutation,
  projectId: id,
  id: id.optional(),
  expectedRevision: z.number().int().nonnegative().default(0),
};
const query = { projectId: id };
export const toolSchemas = {
  get_capabilities: z.strictObject({}),
  list_projects: z.strictObject({}),
  create_project: z.strictObject({ ...mutation, data: projectData }),
  get_project: z.strictObject(query),
  update_project: z.strictObject({
    ...mutation,
    ...query,
    expectedRevision: z.number().int().positive(),
    data: projectData,
  }),
  list_records: z.strictObject({ ...query, kind: kindSchema.optional() }),
  get_record: z.strictObject({ ...query, id }),
  record_question: z.strictObject({ ...save, data: recordSchemas.question }),
  record_answer: z.strictObject({
    ...mutation,
    ...query,
    id,
    expectedRevision: z.number().int().positive(),
    state: z.enum(["answered", "deferred", "not-applicable"]),
    answer: text.default(""),
    rationale: text.default(""),
  }),
  record_decision: z.strictObject({ ...save, data: recordSchemas.decision }),
  save_requirement: z.strictObject({
    ...save,
    data: recordSchemas.requirement,
  }),
  save_work_item: z.strictObject({ ...save, data: recordSchemas.work_item }),
  save_architecture: z.strictObject({
    ...save,
    data: recordSchemas.architecture,
  }),
  save_document: z.strictObject({ ...save, data: recordSchemas.document }),
  save_risk: z.strictObject({ ...save, data: recordSchemas.risk }),
  save_sprint: z.strictObject({ ...save, data: recordSchemas.sprint }),
  get_history: z.strictObject({
    ...query,
    entityId: id.optional(),
    search: short.default(""),
    afterSequence: z.number().int().nonnegative().default(0),
    beforeSequence: z.number().int().positive().optional(),
    direction: z.enum(["asc", "desc"]).default("asc"),
    limit: z.number().int().min(1).max(1000).default(200),
  }),
  get_summary: z.strictObject(query),
  export_project: z.strictObject(query),
  import_project: z.strictObject({ ...mutation, package: packageSchema }),
};
export type ToolName = keyof typeof toolSchemas;
export const modifyingTools = new Set<ToolName>([
  "create_project",
  "update_project",
  "record_question",
  "record_answer",
  "record_decision",
  "save_requirement",
  "save_work_item",
  "save_architecture",
  "save_document",
  "save_risk",
  "save_sprint",
  "import_project",
]);
export const toolKinds: Partial<Record<ToolName, RecordKind>> = {
  record_question: "question",
  record_decision: "decision",
  save_requirement: "requirement",
  save_work_item: "work_item",
  save_architecture: "architecture",
  save_document: "document",
  save_risk: "risk",
  save_sprint: "sprint",
};
