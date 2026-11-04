import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RepositoryDescription,
  RepositorySnapshot,
} from "../../repository/schema.js";
import { repositoryCall } from "../bridge.js";
import { RepositoryReader, type SourceNavigation } from "./RepositoryReader.js";

const categories = [
  "Architecture",
  "Planning",
  "Tracking",
  "Walkthroughs",
  "Guides",
  "Drafts",
  "General",
];
export function RepositoryLibraryPanel({
  projectId,
  onCount,
}: {
  projectId: string;
  onCount: (count: number) => void;
}) {
  const [description, setDescription] = useState<RepositoryDescription>();
  const [busy, setBusy] = useState("loading");
  const [error, setError] = useState("");
  const [ref, setRef] = useState("HEAD");
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [folderLimit, setFolderLimit] = useState(100);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changeLimit, setChangeLimit] = useState(100);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [issueLimit, setIssueLimit] = useState(100);
  const [selection, setSelection] = useState<SourceNavigation>({
    path: "",
    fragment: "",
    nonce: 0,
  });
  const epoch = useRef(0);
  const pending = useRef<
    | {
        action: "choose" | "refresh";
        args: {
          projectId: string;
          expectedRevision: number;
          operationId: string;
          origin: string;
          ref: string;
        };
      }
    | undefined
  >(undefined);
  const snapshot = description?.snapshot;
  const load = useCallback(async () => {
    const generation = epoch.current;
    const result = await repositoryCall<RepositoryDescription>("get", {
      projectId,
    });
    if (epoch.current === generation) {
      setDescription(result);
      onCount(result.snapshot?.counts.indexed ?? 0);
    }
  }, [projectId, onCount]);
  useEffect(() => {
    const generation = ++epoch.current;
    load()
      .catch((failure) => {
        if (epoch.current === generation) setError(failure.message);
      })
      .finally(() => {
        if (epoch.current === generation) setBusy("");
      });
    return () => {
      epoch.current++;
    };
  }, [load]);
  useEffect(() => {
    if (snapshot) setRef(snapshot.ref);
  }, [snapshot?.revision]);
  useEffect(() => {
    setPage(0);
  }, [search, category, status, folder]);
  const mutate = async (action: "choose" | "refresh", retry = false) => {
    const generation = epoch.current;
    const request =
      retry && pending.current
        ? pending.current
        : {
            action,
            args: {
              projectId,
              expectedRevision: snapshot?.revision ?? 0,
              ref,
              operationId: crypto.randomUUID(),
              origin: "local-app",
            },
          };
    pending.current = request;
    setBusy(request.action);
    setError("");
    try {
      const result = await repositoryCall<RepositorySnapshot | null>(
        request.action,
        request.args,
      );
      if (epoch.current !== generation) return;
      if (result) {
        setDescription({
          snapshot: result,
          available: true,
          unavailable: result.counts.unavailable,
          currentCommit: result.commit,
          checkedAt: result.observedAt,
        });
        onCount(result.counts.indexed);
        setSelection((previous) =>
          result.entries.some((entry) => entry.path === previous.path)
            ? previous
            : { path: "", fragment: "", nonce: 0 },
        );
      }
      await load();
      pending.current = undefined;
    } catch (failure) {
      if (epoch.current === generation) {
        setError((failure as Error).message);
        await load().catch(() => {});
      }
    } finally {
      if (epoch.current === generation) setBusy("");
    }
  };
  const check = async () => {
    setBusy("check");
    setError("");
    try {
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy("");
    }
  };
  const entries = snapshot?.entries ?? [];
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const parts = entry.path.split("/").slice(0, -1);
      for (let depth = 1; depth <= parts.length; depth++) {
        const key = parts.slice(0, depth).join("/");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);
  const matched = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (!folder || entry.path.startsWith(`${folder}/`)) &&
          (!category || entry.category === category) &&
          (!status || entry.status === status) &&
          `${entry.path} ${entry.title} ${entry.category}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [entries, folder, category, status, search],
  );
  const size = 50;
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(matched.length / size) - 1),
  );
  const navigate = useCallback((path: string, fragment: string) => {
    setSelection({ path, fragment, nonce: Date.now() });
    setSearch("");
    setFolder("");
    setCategory("");
    setStatus("");
  }, []);
  const selected = entries.find((entry) => entry.path === selection.path);
  return (
    <section className="repository-library" aria-label="Repository Library">
      <section className="repository-source panel">
        <div className="repository-source-heading">
          <div>
            <h2>
              {snapshot ? "Pinned repository source" : "No repository indexed"}
            </h2>
            <p className="caption">
              Committed Git snapshots · metadata index · full bodies read on
              demand
            </p>
          </div>
          <div className="repository-source-actions">
            <label>
              Revision / branch
              <input
                aria-label="Repository revision or branch"
                value={ref}
                onChange={(event) => setRef(event.target.value)}
                disabled={!!busy}
              />
            </label>
            <button disabled={!!busy} onClick={() => mutate("choose")}>
              {snapshot ? "Change repository" : "Choose repository"}
            </button>
            {snapshot && (
              <>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => mutate("refresh")}
                >
                  Refresh index
                </button>
                <button disabled={!!busy} onClick={check}>
                  Check source
                </button>
              </>
            )}
          </div>
        </div>
        {!snapshot && (
          <p>
            Choose an existing local Git checkout once. A repository URL alone
            is not indexed. Repository files remain owned by that checkout;
            agent-created notes stay in Managed Documents.
          </p>
        )}
        {snapshot && (
          <>
            <div className="repository-revision">
              <span>{snapshot.branch || "Pinned commit / tag"}</span>
              <code>{snapshot.commit}</code>
              <small>
                Indexed {new Date(snapshot.observedAt).toLocaleString()}
              </small>
            </div>
            <div className="repository-counts">
              <strong>{snapshot.counts.indexed} indexed</strong>
              <span>{snapshot.counts.eligible} eligible</span>
              <span>{snapshot.counts.skipped} skipped</span>
              <span>
                {description?.unavailable ?? snapshot.counts.unavailable}{" "}
                unavailable
              </span>
            </div>
            <p className="caption">
              {description?.available
                ? description.currentCommit === snapshot.commit
                  ? `Configured ref unchanged at the last check (${new Date(description.checkedAt).toLocaleString()}).`
                  : "Configured ref has a new commit. Refresh index to observe it."
                : "Source unavailable. Last successful index retained; previews may be unavailable."}{" "}
              Uncommitted working-tree edits are excluded.
            </p>
            <details
              className="repository-change-report"
              open={changesOpen}
              onToggle={(event) => setChangesOpen(event.currentTarget.open)}
            >
              <summary>
                Added {snapshot.changes.added.length} · Changed{" "}
                {snapshot.changes.changed.length} · Removed{" "}
                {snapshot.changes.removed.length}
              </summary>
              {changesOpen && (
                <>
                  {(["added", "changed", "removed"] as const).map((kind) => (
                    <div key={kind}>
                      <h3>
                        {kind} · {snapshot.changes[kind].length}
                      </h3>
                      <ul>
                        {snapshot.changes[kind]
                          .slice(0, changeLimit)
                          .map((path) => (
                            <li key={path}>
                              <code>{path}</code>
                            </li>
                          ))}
                      </ul>
                      {snapshot.changes[kind].length > changeLimit && (
                        <button onClick={() => setChangeLimit((n) => n + 100)}>
                          Show more {kind} paths
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </details>
            {snapshot.issues.length > 0 && (
              <details
                open={issuesOpen}
                onToggle={(event) => setIssuesOpen(event.currentTarget.open)}
              >
                <summary>
                  Inspect {snapshot.issues.length} skipped or unavailable
                  entries
                </summary>
                {issuesOpen && (
                  <>
                    <ul>
                      {snapshot.issues.slice(0, issueLimit).map((issue) => (
                        <li key={issue.path}>
                          <code>{issue.path}</code> · {issue.reason}
                        </li>
                      ))}
                    </ul>
                    {snapshot.issues.length > issueLimit && (
                      <button onClick={() => setIssueLimit((n) => n + 100)}>
                        Show more source issues
                      </button>
                    )}
                  </>
                )}
              </details>
            )}
            <details>
              <summary>Local source configuration</summary>
              <p className="caption">
                Local-only configuration; excluded from portable project
                packages.
              </p>
              <code className="repository-root-path">{snapshot.root}</code>
              <p>
                Observed ref: {snapshot.ref}. Titles use a source heading in the
                first 8 KiB when available, with a filename fallback; categories
                and status labels come from explicit path markers. Unknown
                status means no such marker was observed.
              </p>
            </details>
          </>
        )}
        {busy && (
          <p role="status">
            {busy === "choose" || busy === "refresh"
              ? "Indexing source metadata…"
              : "Checking local source…"}
          </p>
        )}
        {error && (
          <div className="repository-error" role="alert">
            <p>{error}</p>
            <p>The previous index and managed record history are preserved.</p>
            {pending.current && (
              <button
                disabled={!!busy}
                onClick={() => mutate(pending.current!.action, true)}
              >
                Retry last operation
              </button>
            )}
          </div>
        )}
      </section>
      {snapshot && (
        <>
          <div className="repository-filters panel">
            <input
              aria-label="Search repository documents"
              placeholder="Search path, title or category…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label>
              Category
              <select
                aria-label="Repository category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Source status
              <select
                aria-label="Repository source status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All source statuses</option>
                {["canonical", "draft", "archived", "unknown"].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <small>{matched.length} matching files</small>
          </div>
          <div className="repository-layout">
            <nav className="repository-folders" aria-label="Repository folders">
              <h3>Folders</h3>
              <button
                className={!folder ? "active" : ""}
                onClick={() => setFolder("")}
              >
                All folders
              </button>
              {folders.slice(0, folderLimit).map(([name, count]) => (
                <button
                  key={name}
                  aria-label={`Folder ${name}`}
                  className={folder === name ? "active" : ""}
                  style={{
                    paddingLeft: `${Math.min(name.split("/").length, 5) * 9}px`,
                  }}
                  onClick={() => setFolder(name)}
                  title={name}
                >
                  {name.split("/").at(-1)}
                  <small>{count}</small>
                </button>
              ))}
              {folders.length > folderLimit && (
                <button onClick={() => setFolderLimit((n) => n + 100)}>
                  Show more folders
                </button>
              )}
            </nav>
            <div className="repository-file-list">
              <h3>Repository documents</h3>
              <nav aria-label="Repository documents">
                {matched
                  .slice(current * size, (current + 1) * size)
                  .map((entry) => (
                    <button
                      key={entry.path}
                      className={entry.path === selected?.path ? "active" : ""}
                      aria-label={`Open repository document ${entry.path}`}
                      onClick={() =>
                        setSelection({
                          path: entry.path,
                          fragment: "",
                          nonce: Date.now(),
                        })
                      }
                    >
                      <strong>{entry.title}</strong>
                      <small>{entry.path}</small>
                      <span>
                        {entry.category} ·{" "}
                        {entry.status === "unknown"
                          ? "status unknown"
                          : `path-marked ${entry.status}`}
                      </span>
                    </button>
                  ))}
              </nav>
              {!matched.length && (
                <p className="muted">No matching indexed documents.</p>
              )}
              <div className="repository-file-pagination">
                <small>
                  {matched.length
                    ? `${current * size + 1}–${Math.min((current + 1) * size, matched.length)} of ${matched.length}`
                    : "0 files"}
                </small>
                <button
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                >
                  Previous files
                </button>
                <button
                  disabled={(current + 1) * size >= matched.length}
                  onClick={() => setPage(current + 1)}
                >
                  Next files
                </button>
              </div>
            </div>
            {selected ? (
              <RepositoryReader
                key={`${snapshot.revision}:${selected.path}`}
                snapshot={snapshot}
                entry={selected}
                navigation={selection}
                onNavigate={navigate}
              />
            ) : (
              <section className="repository-reader repository-empty">
                <h2>Select a repository document</h2>
                <p>
                  Preview the exact indexed Git blob. No document body has been
                  imported into managed records.
                </p>
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}
