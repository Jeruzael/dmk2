import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  renameSync,
  appendFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { WorkspaceService } from "../src/core/service.js";
import { recordSchemas, type Entity } from "../src/core/schema.js";
import { createRepositoryFixture } from "./repository-fixture.js";

async function setup(t: { after: (callback: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), "dmk2-repository-"));
  const dbPath = join(dir, "workspace.sqlite");
  const service = new WorkspaceService(dbPath);
  let cleanupLibrary: { close(): void } | undefined;
  t.after(() => {
    cleanupLibrary?.close();
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const project = service.execute("create_project", {
    operationId: randomUUID(),
    origin: "synthetic-library-test",
    data: { name: "Synthetic repository observation" },
  }) as Entity;
  const fixture = createRepositoryFixture(join(dir, "source"));
  const { RepositoryLibrary } = await import("../src/repository/library.js");
  const library = new RepositoryLibrary(dbPath);
  cleanupLibrary = library;
  const args = (revision = 0) => ({
    projectId: project.id,
    expectedRevision: revision,
    operationId: randomUUID(),
    origin: "synthetic-library-test",
    ref: "HEAD",
  });
  return { dir, dbPath, service, project, fixture, library, args };
}

test("local library migration creates its own cache and immutable observation history without modifying portable records", () => {
  const dir = mkdtempSync(join(tmpdir(), "dmk2-library-migration-"));
  const path = join(dir, "workspace.sqlite");
  const service = new WorkspaceService(path);
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    assert.equal(
      db
        .prepare(
          "SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='repository_sources'",
        )
        .get()!.n,
      1,
    );
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 3);
    db.close();
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a pinned library accounts for every eligible Markdown file without importing its body as a managed record", async (t) => {
  const { library, fixture, project, service, args, dbPath } = await setup(t);
  const before = service.execute("export_project", { projectId: project.id });
  const request = args();
  const index = await library.connect(request, fixture.root);
  assert.equal(index.commit, fixture.commit);
  assert.equal(index.branch, "develop");
  assert.deepEqual(index.counts, {
    eligible: 14,
    indexed: 13,
    skipped: 1,
    unavailable: 0,
  });
  assert.ok(
    index.entries.some((e: any) => e.path === "node_modules/vendor/README.md"),
  );
  assert.equal(
    index.entries.find((e: any) => e.path === "Docs/Drafts/idea.md")!.status,
    "draft",
  );
  assert.equal(
    index.entries.find((e: any) => e.path === "Docs/Archived/old.md")!.status,
    "archived",
  );
  assert.equal(
    index.entries.find((e: any) => e.path === "Docs/Canonical/contract.md")!
      .status,
    "canonical",
  );
  assert.equal(
    index.entries.find((e: any) => e.path === "README.md")!.status,
    "unknown",
  );
  assert.equal(
    index.entries.find((e: any) => e.path === "Docs/Architecture/overview.md")!
      .category,
    "Architecture",
  );
  assert.deepEqual(await library.connect(request, fixture.root), index);
  assert.deepEqual(
    (service.execute("get_summary", { projectId: project.id }) as any)
      .repositoryObservation,
    {
      revision: 1,
      ref: "HEAD",
      branch: "develop",
      commit: fixture.commit,
      observedAt: index.observedAt,
      indexed: 13,
    },
  );
  assert.deepEqual(
    service.execute("export_project", { projectId: project.id }),
    before,
  );
  const db = new DatabaseSync(dbPath, { readOnly: true });
  assert.equal(
    db.prepare("SELECT count(*) n FROM repository_events").get()!.n,
    1,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM operations WHERE is_import=2").get()!.n,
    1,
  );
  const stored = db.prepare("SELECT snapshot FROM repository_sources").get()!
    .snapshot as string;
  assert.equal(stored.includes("END-OF-SYNTHETIC-LONG-DOCUMENT"), false);
  db.close();
});

test("long source Markdown pages preserve every UTF-8 byte and do not change the managed document limit", async (t) => {
  const { library, fixture, project, args } = await setup(t);
  const index = await library.connect(args(), fixture.root);
  const pieces: string[] = [];
  let offset = 0;
  let more = true;
  while (more) {
    const page = await library.read({
      projectId: project.id,
      indexRevision: index.revision,
      path: "Docs/Guides/long-guide.md",
      offset,
    });
    assert.equal(page.commit, fixture.commit);
    assert.ok(page.nextOffset > offset);
    assert.ok(!page.content.includes("\ufffd"));
    pieces.push(page.content);
    offset = page.nextOffset;
    more = page.hasMore;
  }
  assert.ok(pieces.length > 1);
  assert.equal(pieces.join(""), fixture.largeText);
  assert.equal(offset, Buffer.byteLength(fixture.largeText));
  assert.throws(() =>
    recordSchemas.document.parse({
      title: "Too large managed body",
      markdown: fixture.largeText,
    }),
  );
});

test("reindex reports added changed removed blobs and preserves exact pinned reads until refresh", async (t) => {
  const { library, fixture, project, args } = await setup(t);
  const first = await library.connect(args(), fixture.root);
  fixture.write(
    "Docs/Planning/milestone.md",
    "# Changed milestone\n\nUpdated synthetic plan.\n",
  );
  fixture.write("Docs/Guides/new.md", "# New guide\n");
  unlinkSync(join(fixture.root, "Docs/Tracking/WBS.md"));
  fixture.git("add", "-A");
  fixture.git("commit", "-m", "Changed fixture");
  const old = await library.read({
    projectId: project.id,
    indexRevision: first.revision,
    path: "Docs/Planning/milestone.md",
    offset: 0,
  });
  assert.ok(old.content.includes("A goal without an invented schedule."));
  const next = await library.refresh(args(first.revision));
  assert.deepEqual(next.changes.added, ["Docs/Guides/new.md"]);
  assert.deepEqual(next.changes.changed, ["Docs/Planning/milestone.md"]);
  assert.deepEqual(next.changes.removed, ["Docs/Tracking/WBS.md"]);
  await assert.rejects(
    library.read({
      projectId: project.id,
      indexRevision: first.revision,
      path: "README.md",
      offset: 0,
    }),
    /revision|index changed/i,
  );
});

test("unsafe paths refs symlinks and external Git configuration are rejected without corrupting the last index", async (t) => {
  const { library, fixture, project, service, args } = await setup(t);
  const index = await library.connect(args(), fixture.root);
  const baseline = service.execute("export_project", { projectId: project.id });
  for (const path of [
    "../private-secret.txt",
    "/README.md",
    "C:/private.md",
    "Docs\\Guides\\long-guide.md",
    "Docs/../README.md",
    "Docs/Guides/unsafe-link.md",
    ".git/config",
    "private-secret.txt",
  ])
    await assert.rejects(
      library.read({
        projectId: project.id,
        indexRevision: index.revision,
        path,
        offset: 0,
      }),
    );
  await assert.rejects(
    library.refresh({ ...args(index.revision), ref: "--output=outside" }),
  );
  appendFileSync(
    join(fixture.root, ".git/config"),
    "\n[include]\n\tpath = ../outside-config\n",
  );
  await assert.rejects(
    library.refresh(args(index.revision)),
    /include|unsupported|configuration/i,
  );
  assert.deepEqual(library.getSnapshot(project.id), index);
  assert.deepEqual(
    service.execute("export_project", { projectId: project.id }),
    baseline,
  );
});

test("local writes are revision checked globally idempotent and atomically roll back with their observation event", async (t) => {
  const { library, fixture, project, service, args, dbPath } = await setup(t);
  const firstRequest = args();
  const index = await library.connect(firstRequest, fixture.root);
  await assert.rejects(library.refresh(args(0)), /revision/i);
  await assert.rejects(
    library.connect({ ...firstRequest, ref: "develop" }, fixture.root),
    /idempotency/i,
  );
  assert.throws(
    () =>
      service.execute("save_document", {
        projectId: project.id,
        operationId: firstRequest.operationId,
        origin: "synthetic-library-test",
        data: { title: "Conflicting namespace" },
      }),
    /idempotency/i,
  );
  const db = new DatabaseSync(dbPath);
  db.exec(
    "CREATE TRIGGER fail_repository_event BEFORE INSERT ON repository_events BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END;",
  );
  const failed = args(index.revision);
  await assert.rejects(library.refresh(failed), /synthetic event failure/);
  assert.deepEqual(library.getSnapshot(project.id), index);
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM operations WHERE id=?")
      .get(failed.operationId)!.n,
    0,
  );
  db.exec("DROP TRIGGER fail_repository_event");
  db.close();
});

test("unavailable source reads retain local metadata and every managed document revision", async (t) => {
  const { library, fixture, project, service, args, dir } = await setup(t);
  const note = service.execute("save_document", {
    projectId: project.id,
    operationId: randomUUID(),
    origin: "synthetic-library-test",
    data: { title: "Managed note", markdown: "# Original managed note" },
  }) as Entity;
  service.execute("save_document", {
    projectId: project.id,
    id: note.id,
    expectedRevision: note.revision,
    operationId: randomUUID(),
    origin: "synthetic-library-test",
    data: { ...note.data, markdown: "# Revised managed note" },
  });
  const index = await library.connect(args(), fixture.root);
  const before = service.execute("export_project", { projectId: project.id });
  renameSync(fixture.root, join(dir, "unavailable-source"));
  await assert.rejects(library.refresh(args(index.revision)));
  await assert.rejects(
    library.read({
      projectId: project.id,
      indexRevision: index.revision,
      path: "README.md",
      offset: 0,
    }),
  );
  assert.deepEqual(library.getSnapshot(project.id), index);
  const state = await library.describe(project.id);
  assert.equal(state.available, false);
  assert.equal(state.unavailable, 13);
  assert.deepEqual(
    service.execute("export_project", { projectId: project.id }),
    before,
  );
});

test("UTF-8 document pages preserve BOM codepoints instead of silently dropping source bytes", async (t) => {
  const { library, fixture, project, args } = await setup(t);
  const original = "\uFEFF# Exact source text\n\n" + fixture.largeText;
  fixture.write("Docs/Guides/long-guide.md", original);
  fixture.git("add", "-A");
  fixture.git("commit", "-m", "Synthetic UTF-8 source");
  const index = await library.connect(args(), fixture.root);
  let offset = 0;
  let text = "";
  while (true) {
    const page = await library.read({
      projectId: project.id,
      indexRevision: index.revision,
      path: "Docs/Guides/long-guide.md",
      offset,
    });
    text += page.content;
    offset = page.nextOffset;
    if (!page.hasMore) break;
  }
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  assert.equal(digest(text), digest(original));
});

test("per-worktree Git configuration cannot introduce external configuration reads", async (t) => {
  const { library, fixture, args, dir } = await setup(t);
  const index = await library.connect(args(), fixture.root);
  writeFileSync(join(dir, "outside-config"), "[alias]\n  external = unused\n");
  appendFileSync(
    join(fixture.root, ".git/config"),
    "\n[extensions]\n  worktreeConfig = true\n",
  );
  writeFileSync(
    join(fixture.root, ".git/config.worktree"),
    "[include]\n  path = ../../outside-config\n",
  );
  await assert.rejects(
    library.refresh(args(index.revision)),
    /configuration|unsupported/i,
  );
});

test("repository title search metadata uses a source heading when it is available in the bounded header", async (t) => {
  const { library, fixture, args } = await setup(t);
  const index = await library.connect(args(), fixture.root);
  assert.equal(
    index.entries.find(
      (entry: any) => entry.path === "Docs/Architecture/overview.md",
    )!.title,
    "System map",
  );
  assert.equal(
    index.entries.find(
      (entry: any) => entry.path === "Docs/Guides/long-guide.md",
    )!.title,
    "Long field guide",
  );
  assert.equal(
    index.entries.find(
      (entry: any) => entry.path === "Docs/Guides/long-guide.md",
    )!.titleBasis,
    "heading prefix",
  );
});
