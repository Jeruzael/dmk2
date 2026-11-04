import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export const migrations = [
  {
    version: 1,
    sql: `
  CREATE TABLE projects (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)));
  CREATE TABLE records (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), kind TEXT NOT NULL, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)));
  CREATE INDEX records_project_kind ON records(project_id, kind);
  CREATE TABLE events (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), sequence INTEGER NOT NULL, entity_id TEXT NOT NULL, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), UNIQUE(project_id, sequence));
  CREATE INDEX events_entity ON events(project_id, entity_id, sequence);
  CREATE TABLE operations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), request_hash TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), is_import INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE imports (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), snapshot TEXT NOT NULL CHECK(json_valid(snapshot)));
  CREATE TRIGGER events_immutable_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'Events are immutable'); END;
  CREATE TRIGGER events_immutable_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'Events are immutable'); END;
  CREATE TRIGGER imports_immutable_update BEFORE UPDATE ON imports BEGIN SELECT RAISE(ABORT, 'Import events are immutable'); END;
  CREATE TRIGGER imports_immutable_delete BEFORE DELETE ON imports BEGIN SELECT RAISE(ABORT, 'Import events are immutable'); END;
`,
  },
];
export class WorkspaceDatabase {
  readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(
        "PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;",
      );
      this.retry(() => this.db.exec("PRAGMA journal_mode=WAL;"));
      this.transaction(() => {
        const version = Number(
          this.db.prepare("PRAGMA user_version").get()?.user_version,
        );
        if (version > migrations.length)
          throw new Error("Database schema is newer than this application");
        for (const m of migrations)
          if (m.version > version)
            this.db.exec(`${m.sql}\nPRAGMA user_version=${m.version};`);
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  retry<T>(fn: () => T): T {
    for (let attempt = 0; ; attempt++) {
      try {
        return fn();
      } catch (error) {
        if (attempt >= 3 || !/database is (locked|busy)/i.test(String(error)))
          throw error;
        Atomics.wait(
          new Int32Array(new SharedArrayBuffer(4)),
          0,
          0,
          30 * (attempt + 1),
        );
      }
    }
  }
  transaction<T>(fn: () => T, write = true): T {
    this.retry(() => this.db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN"));
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
}
