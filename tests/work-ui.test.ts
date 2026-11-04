import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Entity } from "../src/core/schema.js";
import {
  filterWork,
  outlineRows,
  progressCounts,
  sortWork,
  reconcileDraft,
} from "../src/ui/work/model.js";
import { WorkManagement } from "../src/ui/work/WorkManagement.js";
const entity = (
  id: string,
  title: string,
  data: Record<string, unknown> = {},
): Entity => ({
  id,
  projectId: "project",
  kind: "work_item",
  revision: 1,
  createdAt: "2026-11-04T00:00:00.000Z",
  updatedAt: "2026-11-04T00:00:00.000Z",
  data: {
    title,
    description: "",
    parentId: null,
    dependencies: [],
    sourceIdentifier: "",
    sourceNamespace: "",
    sourceStatus: "UNKNOWN",
    executionStatus: "unknown",
    acceptanceCriteria: [],
    owner: "",
    evidence: [],
    lastSourceRevision: "",
    sources: [],
    relatedIds: [],
    ...data,
  },
});
test("reconciling a draft preserves unrelated agent edits and identifies overlapping changes for review", () => {
  const base = {
    description: "Original",
    owner: "Morgan",
    sourceStatus: "DONE",
  };
  const result = reconcileDraft(
    base,
    { ...base, description: "Local draft" },
    { ...base, description: "Agent draft", owner: "Taylor" },
  );
  assert.deepEqual(result, {
    data: { description: "Local draft", owner: "Taylor", sourceStatus: "DONE" },
    conflicts: ["description"],
  });
});

test("hierarchy search retains ancestors and standalone tasks without inventing parents", () => {
  const root = entity("root", "Workout milestone");
  const child = entity("child", "Offline workout editor", { parentId: "root" });
  const solo = entity("solo", "Offline notes");
  const tasks = [root, child, solo];
  const matched = filterWork(tasks, { search: "offline" });
  assert.deepEqual(
    matched.map((t) => t.id),
    ["child", "solo"],
  );
  const rows = outlineRows(
    tasks,
    new Set(matched.map((t) => t.id)),
    new Set(["root"]),
    true,
  );
  assert.deepEqual(
    rows.map((r) => [r.task.id, r.depth, r.context]),
    [
      ["root", 0, true],
      ["child", 1, false],
      ["solo", 0, false],
    ],
  );
  assert.equal(solo.data.parentId, null);
});
test("source, execution, priority, sprint and owner filters stay independent and sorting has stable ties", () => {
  const a = entity("a", "Same title", {
    sourceStatus: "DONE",
    executionStatus: "partial",
    priority: "high",
    sprintId: "sprint",
    owner: "Alex",
  });
  const b = entity("b", "Same title", {
    sourceStatus: "DONE",
    executionStatus: "completed",
  });
  assert.deepEqual(
    filterWork([a, b], {
      execution: "partial",
      source: "DONE",
      priority: "high",
      sprint: "sprint",
      owner: "Alex",
    }).map((t) => t.id),
    ["a"],
  );
  assert.deepEqual(
    filterWork([a, b], { sprint: "@unassigned" }).map((t) => t.id),
    ["b"],
  );
  assert.deepEqual(
    sortWork([b, a], "title", "asc").map((t) => t.id),
    ["a", "b"],
  );
  assert.equal(a.data.executionStatus, "partial");
});
test("checklist counts and task-count completion never infer verification from a source label", () => {
  const a = entity("a", "Source complete", {
    sourceStatus: "DONE",
    executionStatus: "partial",
    checklist: [{ id: "step", text: "Prepare", done: true }],
  });
  const b = entity("b", "Actually marked completed", {
    executionStatus: "completed",
  });
  assert.deepEqual(progressCounts([a, b]), {
    total: 2,
    completed: 1,
    checklistTotal: 1,
    checklistDone: 1,
  });
});

test("a real sprint ID named unassigned stays distinct from the unassigned filter", () => {
  const assigned = entity("assigned", "Assigned", { sprintId: "unassigned" });
  const loose = entity("loose", "Without sprint");
  assert.deepEqual(
    filterWork([assigned, loose], { sprint: "unassigned" }).map((t) => t.id),
    ["assigned"],
  );
  assert.deepEqual(
    filterWork([assigned, loose], { sprint: "@unassigned" }).map((t) => t.id),
    ["loose"],
  );
});
test("five named views render with a bounded 500-task Board and no invented sprint or dates", () => {
  const project: Entity = {
    ...entity("project", "Project"),
    kind: "project",
    data: { name: "Synthetic 500-task project" },
  };
  const records = Array.from({ length: 500 }, (_, i) =>
    entity(
      `task-${i.toString().padStart(3, "0")}`,
      `Long synthetic workout planning task ${i} with readable details`,
      { executionStatus: "backlog" },
    ),
  );
  const html = renderToStaticMarkup(
    createElement(WorkManagement, {
      project,
      records,
      onChanged: async () => {},
    }),
  );
  for (const tab of ["Board", "WBS", "Backlog", "Sprints", "Checklists"])
    assert.ok(html.includes(`>${tab}</button>`), `Missing view ${tab}`);
  assert.ok(html.includes("500 work items"));
  assert.ok(html.includes("Show more"));
  assert.ok((html.match(/data-work-card=/g) ?? []).length <= 50);
  assert.ok(!html.includes("Sprint 0"));
});
