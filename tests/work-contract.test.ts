import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { WorkspaceService } from "../src/core/service.js";
import { migrations } from "../src/core/database.js";
import { hash } from "../src/core/package.js";
import type { Entity, ProjectPackage } from "../src/core/schema.js";

const origin = "synthetic-work-contract-test";
const legacy = JSON.parse(
  readFileSync("tests/fixtures/phase1-package.json", "utf8"),
);
const legacyImported = JSON.parse(
  readFileSync("tests/fixtures/phase1-imported-package.json", "utf8"),
);
function setup(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), "dmk2-work-"));
  const s = new WorkspaceService(join(dir, "workspace.sqlite"));
  t.after(() => {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const p = s.execute("create_project", {
    operationId: "project",
    origin,
    data: { name: "Synthetic work planning" },
  }) as Entity;
  return { s, p, dir };
}

test("migration upgrades preserve v1 snapshots, events and receipts exactly", () => {
  const dir = mkdtempSync(join(tmpdir(), "dmk2-v1-migration-"));
  const path = join(dir, "old.sqlite");
  const db = new DatabaseSync(path);
  db.exec(migrations[0]!.sql);
  db.exec("PRAGMA user_version=1");
  const { project, records, events, operations } = legacy.payload;
  db.prepare("INSERT INTO projects VALUES(?,?)").run(
    project.id,
    JSON.stringify(project),
  );
  for (const r of records)
    db.prepare("INSERT INTO records VALUES(?,?,?,?)").run(
      r.id,
      r.projectId,
      r.kind,
      JSON.stringify(r),
    );
  for (const e of events)
    db.prepare("INSERT INTO events VALUES(?,?,?,?,?)").run(
      e.id,
      e.projectId,
      e.sequence,
      e.entityId,
      JSON.stringify(e),
    );
  for (const op of operations)
    db.prepare("INSERT INTO operations VALUES(?,?,?,?,0)").run(
      op.operationId,
      project.id,
      op.requestHash,
      JSON.stringify(op.result),
    );
  db.close();
  const s = new WorkspaceService(path);
  try {
    const read = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(read.prepare("PRAGMA user_version").get()!.user_version, 3);
    } finally {
      read.close();
    }
    const exported = s.execute("export_project", {
      projectId: project.id,
    }) as any;
    assert.equal(exported.schemaVersion, 2);
    assert.deepEqual(exported.payload, legacy.payload);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("original v1 packages and custody hashes survive a v2 export/import and subsequent work edits", (t) => {
  const { s, dir } = setup(t);
  const restored = new WorkspaceService(join(dir, "restored.sqlite"));
  try {
    s.execute("import_project", {
      operationId: "import-original-v1",
      origin,
      package: legacyImported,
    });
    const projectId = legacy.payload.project.id;
    const originalRecords = s.execute("list_records", { projectId });
    assert.deepEqual(originalRecords, legacyImported.payload.records);
    const pkg = s.execute("export_project", { projectId }) as any;
    assert.equal(pkg.schemaVersion, 2);
    assert.deepEqual(pkg.payload.events, legacyImported.payload.events);
    assert.deepEqual(pkg.payload.operations, legacyImported.payload.operations);
    restored.execute("import_project", {
      operationId: "import-upgraded-v2",
      origin,
      package: pkg,
    });
    const task = (
      restored.execute("list_records", { projectId }) as Entity[]
    ).find((r) => r.data.title === "Legacy task")!;
    restored.execute("save_work_item", {
      projectId,
      id: task.id,
      expectedRevision: task.revision,
      operationId: "extend-old-task",
      origin,
      data: {
        ...task.data,
        priority: "high",
        checklist: [
          { id: "step-1", text: "Document migration evidence", done: false },
        ],
      },
    });
    const second = s.execute("get_history", { projectId }) as any[];
    assert.deepEqual(second, legacyImported.payload.events);
    assert.equal(task.data.sourceStatus, "DONE");
    assert.equal(task.data.executionStatus, "partial");
    const fresh = new WorkspaceService(join(dir, "third.sqlite"));
    try {
      fresh.execute("import_project", {
        operationId: "mixed-history-import",
        origin,
        package: restored.execute("export_project", { projectId }),
      });
    } finally {
      fresh.close();
    }
  } finally {
    restored.close();
  }
});

test("sprints and structured checklists persist revisions without implying task or acceptance verification", (t) => {
  const { s, p, dir } = setup(t);
  const projectId = p.id;
  const sprint = s.execute("save_sprint", {
    projectId,
    operationId: "sprint",
    origin,
    data: {
      title: "Offline milestone",
      goal: "Prove a local edit survives restart",
    },
  }) as Entity;
  assert.equal(sprint.data.startDate, undefined);
  assert.equal(sprint.data.endDate, undefined);
  const task = s.execute("save_work_item", {
    projectId,
    operationId: "task",
    origin,
    data: {
      title: "Local workout editor",
      sprintId: sprint.id,
      priority: "high",
      risk: "medium",
      sourceStatus: "DONE",
      executionStatus: "partial",
      acceptanceCriteria: ["Independently verify persistence"],
      checklist: [
        {
          id: "implement",
          text: "Build form",
          done: false,
          kind: "implementation",
        },
        {
          id: "review",
          text: "Review evidence",
          done: false,
          kind: "verification",
        },
      ],
    },
  }) as Entity;
  const update = {
    projectId,
    id: task.id,
    expectedRevision: 1,
    operationId: "toggle",
    origin,
    data: {
      ...task.data,
      checklist: [
        {
          id: "implement",
          text: "Build form",
          done: true,
          kind: "implementation",
        },
        {
          id: "review",
          text: "Review evidence",
          done: false,
          kind: "verification",
        },
      ],
    },
  };
  const result = s.execute("save_work_item", update) as Entity;
  assert.equal(result.revision, 2);
  assert.equal(result.data.executionStatus, "partial");
  assert.equal(result.data.sourceStatus, "DONE");
  assert.deepEqual(result.data.acceptanceCriteria, [
    "Independently verify persistence",
  ]);
  assert.deepEqual(result.data.evidence, []);
  assert.deepEqual(s.execute("save_work_item", update), result);
  assert.throws(
    () =>
      s.execute("save_work_item", { ...update, operationId: "stale-toggle" }),
    /Revision conflict/,
  );
  assert.equal((s.execute("get_history", { projectId }) as any[]).length, 4);
  const pkg = s.execute("export_project", { projectId }) as ProjectPackage;
  const fresh = new WorkspaceService(join(dir, "roundtrip.sqlite"));
  try {
    fresh.execute("import_project", {
      operationId: "new-work-import",
      origin,
      package: pkg,
    });
    const imported = fresh.execute("export_project", { projectId }) as any;
    for (const field of ["project", "records", "events", "operations"])
      assert.deepEqual(
        imported.payload[field],
        pkg.payload[field as keyof typeof pkg.payload],
      );
    assert.deepEqual(
      fresh.execute("get_record", { projectId, id: task.id }),
      result,
    );
  } finally {
    fresh.close();
  }
});

test("invalid sprint links, dates, checklist IDs and field values fail atomically", (t) => {
  const { s, p } = setup(t);
  const projectId = p.id;
  assert.throws(
    () =>
      s.execute("save_sprint", {
        projectId,
        operationId: "bad-date",
        origin,
        data: {
          title: "Impossible",
          startDate: "2026-11-09",
          endDate: "2026-11-01",
        },
      }),
    /date|range|before/i,
  );
  const other = s.execute("create_project", {
    operationId: "other",
    origin,
    data: { name: "Other synthetic project" },
  }) as Entity;
  const foreign = s.execute("save_sprint", {
    projectId: other.id,
    operationId: "foreign",
    origin,
    data: { title: "Other sprint" },
  }) as Entity;
  const values = [
    { sprintId: foreign.id },
    { sprintId: "missing" },
    { priority: "invented" },
    {
      checklist: [
        { id: "same", text: "One", done: false },
        { id: "same", text: "Two", done: true },
      ],
    },
    { checklist: [{ id: "one", text: "One", done: "yes" }] },
  ];
  for (const [i, data] of values.entries())
    assert.throws(() =>
      s.execute("save_work_item", {
        projectId,
        operationId: `invalid-${i}`,
        origin,
        data: { title: "Bad input", ...data },
      }),
    );
  assert.equal((s.execute("get_history", { projectId }) as any[]).length, 1);
});

test("a package cannot disguise v2 planning fields as the v1 contract", (t) => {
  const { s, p, dir } = setup(t);
  s.execute("save_work_item", {
    projectId: p.id,
    operationId: "task",
    origin,
    data: { title: "New field", priority: "high" },
  });
  const pkg = s.execute("export_project", { projectId: p.id }) as any;
  pkg.schemaVersion = 1;
  pkg.checksum = hash(pkg.payload);
  const fresh = new WorkspaceService(join(dir, "v1-disguise.sqlite"));
  try {
    assert.throws(
      () =>
        fresh.execute("import_project", {
          operationId: "invalid-version",
          origin,
          package: pkg,
        }),
      /version|v1|contract/i,
    );
    assert.deepEqual(fresh.execute("list_projects", {}), []);
  } finally {
    fresh.close();
  }
});

test("history supports bounded newest-first pages without dropping searchable older revisions", (t) => {
  const { s, p } = setup(t);
  for (let i = 0; i < 6; i++)
    s.execute("save_work_item", {
      projectId: p.id,
      operationId: `history-${i}`,
      origin,
      data: { title: i === 0 ? "Find old synthetic task" : `Recent task ${i}` },
    });
  const latest = s.execute("get_history", {
    projectId: p.id,
    direction: "desc",
    limit: 2,
  }) as any[];
  assert.deepEqual(
    latest.map((e) => e.sequence),
    [7, 6],
  );
  const older = s.execute("get_history", {
    projectId: p.id,
    direction: "desc",
    beforeSequence: 6,
    limit: 2,
  }) as any[];
  assert.deepEqual(
    older.map((e) => e.sequence),
    [5, 4],
  );
  const searched = s.execute("get_history", {
    projectId: p.id,
    direction: "desc",
    search: "Find old synthetic task",
    limit: 2,
  }) as any[];
  assert.deepEqual(
    searched.map((e) => e.sequence),
    [2],
  );
});

test("custody cannot claim a v2 source payload was an eligible v1 package", (t) => {
  const { s, p, dir } = setup(t);
  s.execute("save_work_item", {
    projectId: p.id,
    operationId: "new-field",
    origin,
    data: { title: "New planning field", priority: "high" },
  });
  const original = s.execute("export_project", { projectId: p.id }) as any;
  const b = new WorkspaceService(join(dir, "custody-b.sqlite"));
  const c = new WorkspaceService(join(dir, "custody-c.sqlite"));
  try {
    b.execute("import_project", {
      operationId: "custody-import",
      origin,
      package: original,
    });
    const forged = b.execute("export_project", { projectId: p.id }) as any;
    const event = forged.payload.importHistory[0];
    event.packageVersion = 1;
    event.requestHash = hash({
      tool: "import_project",
      args: {
        operationId: event.operationId,
        origin: event.origin,
        sourceRef: event.sourceRef,
        package: { ...original, schemaVersion: 1 },
      },
    });
    forged.checksum = hash(forged.payload);
    assert.throws(
      () =>
        c.execute("import_project", {
          operationId: "forged-custody",
          origin,
          package: forged,
        }),
      /version|v1|contract/i,
    );
    assert.deepEqual(c.execute("list_projects", {}), []);
  } finally {
    b.close();
    c.close();
  }
});
