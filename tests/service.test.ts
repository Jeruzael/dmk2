import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceService } from "../src/core/service.js";
import { DatabaseSync } from "node:sqlite";
import { hash } from "../src/core/package.js";

const origin = "synthetic-test";
function setup(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), "dmk2-test-"));
  const service = new WorkspaceService(join(dir, "workspace.sqlite"));
  t.after(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { service, dir };
}
const projectArgs = {
  operationId: "create-test",
  origin,
  data: { name: "Sample Fitness Project" },
};
test("mutations preserve snapshots, reject stale revisions and bind idempotency keys to request contents", (t) => {
  const { service: s } = setup(t);
  const p = s.execute("create_project", projectArgs) as any;
  assert.equal(p.revision, 1);
  assert.deepEqual(s.execute("create_project", projectArgs), p);
  assert.throws(
    () =>
      s.execute("create_project", { ...projectArgs, data: { name: "Other" } }),
    /operation|idempotency/i,
  );
  const q = s.execute("record_question", {
    projectId: p.id,
    operationId: "q1",
    origin,
    data: { title: "Who uses it?", context: "Discovery", reason: "Scope" },
  }) as any;
  const a = s.execute("record_answer", {
    projectId: p.id,
    id: q.id,
    operationId: "a1",
    origin,
    expectedRevision: 1,
    state: "answered",
    answer: "Beginners",
    rationale: "Accessible workouts",
    sourceRef: "chat:synthetic/1",
  }) as any;
  assert.equal(a.revision, 2);
  assert.equal(a.data.answer, "Beginners");
  assert.throws(
    () =>
      s.execute("record_answer", {
        projectId: p.id,
        id: q.id,
        operationId: "stale",
        origin,
        expectedRevision: 1,
        state: "deferred",
      }),
    /revision|conflict/i,
  );
  const history = s.execute("get_history", { projectId: p.id }) as any[];
  assert.equal(history.length, 3);
  assert.equal(history[2].before.data.state, "unanswered");
  assert.equal(history[2].after.data.answer, "Beginners");
  assert.deepEqual(
    history.map((e) => e.sequence),
    [1, 2, 3],
  );
});

test("invalid references, WBS cycles and unproven approval claims cannot mutate records or history", (t) => {
  const { service: s } = setup(t);
  const p = s.execute("create_project", projectArgs) as any;
  const task = s.execute("save_work_item", {
    projectId: p.id,
    operationId: "t1",
    origin,
    data: { title: "Plan", sourceStatus: "DONE" },
  }) as any;
  assert.equal(task.data.executionStatus, "unknown");
  for (const [i, data] of [
    { ...task.data, parentId: task.id },
    { ...task.data, dependencies: ["missing"] },
  ].entries()) {
    assert.throws(
      () =>
        s.execute("save_work_item", {
          projectId: p.id,
          id: task.id,
          expectedRevision: 1,
          operationId: `invalid-link-${i}`,
          origin,
          data,
        }),
      /cycle|reference|parent/i,
    );
  }
  assert.throws(
    () =>
      s.execute("record_decision", {
        projectId: p.id,
        operationId: "bad-decision",
        origin,
        data: {
          title: "Storage",
          selectedOption: "SQLite",
          confirmation: { claimed: true },
        },
      }),
    /conversation|reference|validation/i,
  );
  assert.equal(
    (s.execute("get_history", { projectId: p.id }) as any[]).length,
    2,
  );
});

test("exports round trip complete history, reject corrupt imports atomically and preserve identity after reopening", (t) => {
  const { service: s, dir } = setup(t);
  const p = s.execute("create_project", projectArgs) as any;
  const d = s.execute("save_document", {
    projectId: p.id,
    operationId: "doc1",
    origin,
    data: { title: "Guide", markdown: "# First\n\nHello" },
  }) as any;
  s.execute("save_document", {
    projectId: p.id,
    id: d.id,
    expectedRevision: 1,
    operationId: "doc2",
    origin,
    data: { title: "Guide", markdown: "# Revised" },
  });
  const pkg = s.execute("export_project", { projectId: p.id }) as any;
  const fresh = new WorkspaceService(join(dir, "fresh.sqlite"));
  try {
    assert.throws(
      () =>
        fresh.execute("import_project", {
          operationId: "bad",
          origin,
          package: { ...pkg, checksum: "invalid" },
        }),
      /integrity|checksum|validation/i,
    );
    assert.equal((fresh.execute("list_projects", {}) as any[]).length, 0);
    fresh.execute("import_project", {
      operationId: "import1",
      origin,
      package: pkg,
    });
    const restored = fresh.execute("export_project", {
      projectId: p.id,
    }) as any;
    for (const key of ["project", "records", "events", "operations"])
      assert.deepEqual(restored.payload[key], pkg.payload[key]);
    assert.equal(restored.payload.importHistory.length, 1);
    assert.deepEqual(
      fresh.execute("import_project", {
        operationId: "import1",
        origin,
        package: pkg,
      }),
      { projectId: p.id, imported: true },
    );
    assert.throws(
      () =>
        fresh.execute("import_project", {
          operationId: "import2",
          origin,
          package: pkg,
        }),
      /exist/i,
    );
    const reopened = new WorkspaceService(join(dir, "fresh.sqlite"));
    try {
      assert.equal(
        (reopened.execute("get_record", { projectId: p.id, id: d.id }) as any)
          .revision,
        2,
      );
    } finally {
      reopened.close();
    }
  } finally {
    fresh.close();
  }
});

test("event insertion failure rolls back the state and operation receipt together", (t) => {
  const { service: s, dir } = setup(t);
  const db = new DatabaseSync(join(dir, "workspace.sqlite"));
  try {
    db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'Synthetic event failure'); END;",
    );
    assert.throws(
      () => s.execute("create_project", projectArgs),
      /Synthetic event failure/,
    );
    assert.deepEqual(s.execute("list_projects", {}), []);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM operations").get()!.n,
      0,
    );
    db.exec("DROP TRIGGER fail_event");
    assert.equal((s.execute("create_project", projectArgs) as any).revision, 1);
  } finally {
    db.close();
  }
});

test("recomputed checksums cannot conceal forged history or missing references", (t) => {
  const { service: s, dir } = setup(t);
  const p = s.execute("create_project", projectArgs) as any;
  s.execute("save_document", {
    projectId: p.id,
    operationId: "doc",
    origin,
    data: { title: "Guide", markdown: "Original" },
  });
  const pkg = s.execute("export_project", { projectId: p.id }) as any;
  const fresh = new WorkspaceService(join(dir, "destination.sqlite"));
  try {
    for (const corrupt of [
      (v: any) => {
        v.records[0].data.relatedIds = ["missing"];
      },
      (v: any) => {
        v.events[1].previousRevision = 10;
      },
      (v: any) => {
        v.events.pop();
      },
      (v: any) => {
        v.records[0].data.markdown = "Forged";
      },
      (v: any) => {
        v.operations[0].result.data.name = "Forged receipt";
      },
      (v: any) => {
        v.events[0].operation = "save_risk";
      },
    ]) {
      const candidate = structuredClone(pkg);
      corrupt(candidate.payload);
      candidate.checksum = hash(candidate.payload);
      assert.throws(() =>
        fresh.execute("import_project", {
          operationId: "invalid",
          origin,
          package: candidate,
        }),
      );
      assert.deepEqual(fresh.execute("list_projects", {}), []);
    }
  } finally {
    fresh.close();
  }
});

test("import custody events survive subsequent exports and retain their idempotency receipts", (t) => {
  const { service: a, dir } = setup(t);
  const p = a.execute("create_project", projectArgs) as any;
  const pkg = a.execute("export_project", { projectId: p.id }) as any;
  const b = new WorkspaceService(join(dir, "b.sqlite"));
  const c = new WorkspaceService(join(dir, "c.sqlite"));
  try {
    const args = { operationId: "import-a-b", origin, package: pkg };
    b.execute("import_project", args);
    b.execute("update_project", {
      projectId: p.id,
      expectedRevision: 1,
      operationId: "post-import-update",
      origin,
      data: { ...p.data, description: "A new revision after the first import" },
    });
    const exported = b.execute("export_project", { projectId: p.id }) as any;
    c.execute("import_project", {
      operationId: "import-b-c",
      origin,
      package: exported,
    });
    const result = c.execute("export_project", { projectId: p.id }) as any;
    assert.equal(result.payload.importHistory.length, 2);
    assert.equal(result.payload.importHistory[0].operationId, "import-a-b");
    assert.deepEqual(c.execute("import_project", args), {
      projectId: p.id,
      imported: true,
    });
    assert.equal(
      (c.execute("get_summary", { projectId: p.id }) as any).imports.length,
      2,
    );
  } finally {
    b.close();
    c.close();
  }
});

test("unknown input fields and foreign project references fail without writing", (t) => {
  const { service: s } = setup(t);
  const a = s.execute("create_project", projectArgs) as any;
  const b = s.execute("create_project", {
    ...projectArgs,
    operationId: "b",
    data: { name: "Other project" },
  }) as any;
  const r = s.execute("save_requirement", {
    projectId: b.id,
    origin,
    operationId: "req",
    data: { title: "Private notes", statement: "Local" },
  }) as any;
  assert.throws(
    () =>
      s.execute("save_document", {
        projectId: a.id,
        origin,
        operationId: "bad-link",
        data: { title: "Link", markdown: "Text", relatedIds: [r.id] },
      }),
    /reference/i,
  );
  assert.throws(
    () =>
      s.execute("create_project", {
        ...projectArgs,
        operationId: "bad-field",
        data: { name: "Bad", releaseDate: "invented" },
      }),
    /validation|unrecognized/i,
  );
});

test("history pages preserve more than 4096 events without truncating earlier revisions", () => {
  const s = new WorkspaceService(":memory:");
  try {
    let p = s.execute("create_project", projectArgs) as any;
    for (let i = 0; i < 4100; i++)
      p = s.execute("update_project", {
        projectId: p.id,
        expectedRevision: p.revision,
        operationId: `revision-${i}`,
        origin,
        data: { ...p.data, description: `Observed update ${i}` },
      }) as any;
    const all: any[] = [];
    for (;;) {
      const page = s.execute("get_history", {
        projectId: p.id,
        afterSequence: all.at(-1)?.sequence ?? 0,
        limit: 1000,
      }) as any[];
      all.push(...page);
      if (page.length < 1000) break;
    }
    assert.equal(all.length, 4101);
    assert.equal(all[0].after.revision, 1);
    assert.equal(all.at(-1).after.revision, 4101);
    assert.equal(
      (s.execute("export_project", { projectId: p.id }) as any).payload.events
        .length,
      4101,
    );
  } finally {
    s.close();
  }
});

test("unsupported future migrations are rejected without modifying the database", (t) => {
  const { dir } = setup(t);
  const path = join(dir, "future.sqlite");
  const db = new DatabaseSync(path);
  db.exec("PRAGMA user_version=999");
  db.close();
  assert.throws(() => new WorkspaceService(path), /newer/);
  const reopened = new DatabaseSync(path);
  try {
    assert.equal(
      reopened.prepare("PRAGMA user_version").get()!.user_version,
      999,
    );
  } finally {
    reopened.close();
  }
});

test("imported operation hashes must describe the recorded mutation, never an unrelated retry", (t) => {
  const { service: s, dir } = setup(t);
  const p = s.execute("create_project", projectArgs) as any;
  const pkg = s.execute("export_project", { projectId: p.id }) as any;
  pkg.payload.operations[0].requestHash = "0".repeat(64);
  pkg.checksum = hash(pkg.payload);
  const fresh = new WorkspaceService(join(dir, "bad-receipt.sqlite"));
  try {
    assert.throws(
      () =>
        fresh.execute("import_project", {
          operationId: "invalid-receipt",
          origin,
          package: pkg,
        }),
      /receipt|hash/i,
    );
    assert.deepEqual(fresh.execute("list_projects", {}), []);
  } finally {
    fresh.close();
  }
});

test("import custody retry hashes are verified against their reconstructed source packages", (t) => {
  const { service: a, dir } = setup(t);
  const p = a.execute("create_project", projectArgs) as any;
  const b = new WorkspaceService(join(dir, "custody-source.sqlite"));
  const c = new WorkspaceService(join(dir, "custody-target.sqlite"));
  try {
    b.execute("import_project", {
      operationId: "first-import",
      origin,
      package: a.execute("export_project", { projectId: p.id }),
    });
    const pkg = b.execute("export_project", { projectId: p.id }) as any;
    pkg.payload.importHistory[0].requestHash = "0".repeat(64);
    pkg.checksum = hash(pkg.payload);
    assert.throws(
      () =>
        c.execute("import_project", {
          operationId: "second-import",
          origin,
          package: pkg,
        }),
      /receipt|hash|custody/i,
    );
    assert.deepEqual(c.execute("list_projects", {}), []);
  } finally {
    b.close();
    c.close();
  }
});

test("noncanonical package ordering is rejected before it can break a later custody round trip", (t) => {
  const { service: s, dir } = setup(t);
  const p = s.execute("create_project", projectArgs) as any;
  for (const i of [1, 2])
    s.execute("save_document", {
      projectId: p.id,
      operationId: `doc-${i}`,
      origin,
      data: { title: `Document ${i}` },
    });
  const pkg = s.execute("export_project", { projectId: p.id }) as any;
  pkg.payload.records.reverse();
  pkg.payload.operations.reverse();
  pkg.checksum = hash(pkg.payload);
  const fresh = new WorkspaceService(join(dir, "unordered.sqlite"));
  try {
    assert.throws(
      () =>
        fresh.execute("import_project", {
          operationId: "unordered",
          origin,
          package: pkg,
        }),
      /order|canonical/i,
    );
    assert.deepEqual(fresh.execute("list_projects", {}), []);
  } finally {
    fresh.close();
  }
});
