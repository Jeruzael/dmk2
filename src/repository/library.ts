import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { WorkspaceDatabase } from "../core/database.js";
import { hash } from "../core/package.js";
import { id } from "../core/schema.js";
import { inspectRevision, observeRepository, readBlobPage } from "./git.js";
import {
  chooseRepositorySchema,
  readRepositorySchema,
  refreshRepositorySchema,
  repositoryHistorySchema,
  repositorySnapshotSchema,
  type ChooseRepositoryArgs,
  type ReadRepositoryArgs,
  type RefreshRepositoryArgs,
  type RepositoryDescription,
  type RepositoryPage,
  type RepositorySnapshot,
} from "./schema.js";

export class RepositoryLibrary {
  private store: WorkspaceDatabase;
  constructor(path: string) {
    this.store = new WorkspaceDatabase(path);
  }
  close(): void {
    this.store.close();
  }
  private project(projectId: string) {
    id.parse(projectId);
    if (
      !this.store.db
        .prepare("SELECT id FROM projects WHERE id=?")
        .get(projectId)
    )
      throw new Error("Project not found.");
  }
  getSnapshot(projectId: string): RepositorySnapshot | null {
    this.project(projectId);
    const row = this.store.db
      .prepare("SELECT snapshot FROM repository_sources WHERE project_id=?")
      .get(projectId);
    return row
      ? repositorySnapshotSchema.parse(JSON.parse(row.snapshot as string))
      : null;
  }
  private receipt(
    action: string,
    args: unknown,
    root?: string,
  ): RepositorySnapshot | null {
    const operationId = (args as { operationId: string }).operationId;
    const row = this.store.db
      .prepare("SELECT request_hash,result FROM operations WHERE id=?")
      .get(operationId);
    if (!row) return null;
    const result = JSON.parse(row.result as string);
    const request =
      action === "repository_connect"
        ? { action, args, root: root ?? result.root }
        : { action, args };
    if (row.request_hash !== hash(request))
      throw new Error(
        "Idempotency conflict: operation ID already used for different input.",
      );
    return repositorySnapshotSchema.parse(result);
  }
  replayConnection(input: ChooseRepositoryArgs): RepositorySnapshot | null {
    const args = chooseRepositorySchema.parse(input);
    this.project(args.projectId);
    return this.receipt("repository_connect", args);
  }
  private expected(projectId: string, expectedRevision: number) {
    const before = this.getSnapshot(projectId);
    if ((before?.revision ?? 0) !== expectedRevision)
      throw new Error(
        `Repository revision conflict: expected ${expectedRevision}, current ${before?.revision ?? 0}. Reload before retrying.`,
      );
    return before;
  }
  async connect(
    input: ChooseRepositoryArgs,
    selectedRoot: string,
  ): Promise<RepositorySnapshot> {
    const args = chooseRepositorySchema.parse(input);
    const root = resolve(selectedRoot);
    this.project(args.projectId);
    const previous = this.receipt("repository_connect", args, root);
    if (previous) return previous;
    this.expected(args.projectId, args.expectedRevision);
    const observed = await observeRepository(root, args.ref);
    return this.commit("repository_connect", args, observed, root);
  }
  async refresh(input: RefreshRepositoryArgs): Promise<RepositorySnapshot> {
    const args = refreshRepositorySchema.parse(input);
    this.project(args.projectId);
    const previous = this.receipt("repository_refresh", args);
    if (previous) return previous;
    const before = this.expected(args.projectId, args.expectedRevision);
    if (!before)
      throw new Error("Choose a local repository before reindexing.");
    const observed = await observeRepository(
      before.root,
      args.ref ?? before.ref,
    );
    return this.commit("repository_refresh", args, observed);
  }
  private commit(
    action: string,
    args: {
      projectId: string;
      expectedRevision: number;
      operationId: string;
      origin: string;
    },
    observed: Awaited<ReturnType<typeof observeRepository>>,
    root?: string,
  ): RepositorySnapshot {
    return this.store.transaction(() => {
      const replay = this.receipt(action, args, root);
      if (replay) return replay;
      const before = this.expected(args.projectId, args.expectedRevision);
      const old = new Map(
        before?.entries.map((entry) => [entry.path, entry.blobId]) ?? [],
      );
      const next = new Map(
        observed.entries.map((entry) => [entry.path, entry.blobId]),
      );
      const snapshot = repositorySnapshotSchema.parse({
        ...observed,
        projectId: args.projectId,
        revision: (before?.revision ?? 0) + 1,
        observedAt: new Date().toISOString(),
        changes: {
          added: observed.entries
            .filter((entry) => !old.has(entry.path))
            .map((entry) => entry.path),
          changed: observed.entries
            .filter(
              (entry) =>
                old.has(entry.path) && old.get(entry.path) !== entry.blobId,
            )
            .map((entry) => entry.path),
          removed: (before?.entries ?? [])
            .filter((entry) => !next.has(entry.path))
            .map((entry) => entry.path),
        },
      });
      const request =
        action === "repository_connect"
          ? { action, args, root }
          : { action, args };
      const requestHash = hash(request);
      this.store.db
        .prepare(
          "INSERT INTO repository_sources(project_id,snapshot) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET snapshot=excluded.snapshot",
        )
        .run(args.projectId, JSON.stringify(snapshot));
      const event = {
        id: randomUUID(),
        projectId: args.projectId,
        revision: snapshot.revision,
        action,
        operationId: args.operationId,
        origin: args.origin,
        timestamp: snapshot.observedAt,
        before,
        after: snapshot,
      };
      this.store.db
        .prepare(
          "INSERT INTO repository_events(id,project_id,revision,snapshot) VALUES(?,?,?,?)",
        )
        .run(
          event.id,
          args.projectId,
          snapshot.revision,
          JSON.stringify(event),
        );
      this.store.db
        .prepare(
          "INSERT INTO operations(id,project_id,request_hash,result,is_import) VALUES(?,?,?,?,2)",
        )
        .run(
          args.operationId,
          args.projectId,
          requestHash,
          JSON.stringify(snapshot),
        );
      return snapshot;
    });
  }
  async describe(projectId: string): Promise<RepositoryDescription> {
    const snapshot = this.getSnapshot(projectId);
    const checkedAt = new Date().toISOString();
    if (!snapshot)
      return { snapshot: null, available: false, unavailable: 0, checkedAt };
    try {
      const source = await inspectRevision(snapshot.root, snapshot.ref);
      return {
        snapshot,
        available: true,
        unavailable: snapshot.counts.unavailable,
        currentCommit: source.commit,
        checkedAt,
      };
    } catch (error) {
      return {
        snapshot,
        available: false,
        unavailable: snapshot.entries.length + snapshot.counts.unavailable,
        checkedAt,
        error:
          error instanceof Error
            ? error.message
            : "Repository source unavailable.",
      };
    }
  }
  async read(input: ReadRepositoryArgs): Promise<RepositoryPage> {
    const args = readRepositorySchema.parse(input);
    const snapshot = this.getSnapshot(args.projectId);
    if (!snapshot || snapshot.revision !== args.indexRevision)
      throw new Error(
        "Repository index changed or is unavailable. Reload the library.",
      );
    const entry = snapshot.entries.find((entry) => entry.path === args.path);
    if (!entry)
      throw new Error("Document is not an indexed regular Markdown blob.");
    const page = await readBlobPage(snapshot.root, entry, args.offset);
    return {
      projectId: args.projectId,
      indexRevision: snapshot.revision,
      path: entry.path,
      commit: snapshot.commit,
      totalBytes: entry.byteSize,
      offset: args.offset,
      ...page,
    };
  }
  history(input: unknown): unknown[] {
    const args = repositoryHistorySchema.parse(input);
    this.project(args.projectId);
    return this.store.db
      .prepare(
        "SELECT snapshot FROM repository_events WHERE project_id=? AND (? IS NULL OR revision<?) ORDER BY revision DESC LIMIT ?",
      )
      .all(
        args.projectId,
        args.beforeRevision ?? null,
        args.beforeRevision ?? null,
        args.limit,
      )
      .map((row) => JSON.parse(row.snapshot as string));
  }
}
