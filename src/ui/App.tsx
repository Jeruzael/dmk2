import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  Entity,
  RecordKind,
  ToolName,
} from "../core/schema.js";
import { execute, unwrap } from "./bridge.js";
import { Editor } from "./Editor.js";
import { Fields, HistoryList, RecordCard, SafeMarkdown } from "./Records.js";
const views = [
  "Overview",
  "Plan & WBS",
  "Documents",
  "Decisions & Questions",
  "Security & Architecture",
  "Activity",
] as const;
type View = (typeof views)[number];
const icons = ["◈", "▤", "▧", "◇", "⬡", "◷"];
const saveTools: Record<RecordKind, ToolName> = {
  question: "record_question",
  decision: "record_decision",
  requirement: "save_requirement",
  work_item: "save_work_item",
  document: "save_document",
  architecture: "save_architecture",
  risk: "save_risk",
};
const additions: Record<View, RecordKind[]> = {
  Overview: ["requirement"],
  "Plan & WBS": ["work_item", "requirement"],
  Documents: ["document"],
  "Decisions & Questions": ["question", "decision"],
  "Security & Architecture": ["architecture", "risk", "requirement"],
  Activity: [],
};
type Summary = {
  counts: Record<string, number>;
  executionStatus: Record<string, number>;
  unresolvedQuestions: Entity[];
  blockers: Entity[];
  imports: {
    id: string;
    origin: string;
    timestamp: string;
    checksum: string;
  }[];
};

export function App() {
  const [projects, setProjects] = useState<Entity[]>([]);
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Entity>();
  const [records, setRecords] = useState<Entity[]>([]);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [summary, setSummary] = useState<Summary>();
  const [view, setView] = useState<View>("Overview");
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState("");
  const [editing, setEditing] = useState<{
    kind: RecordKind | "project";
    entity?: Entity;
  }>();
  const [history, setHistory] = useState<Entity>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const current = useRef(projectId);
  current.current = projectId;
  const historyCache = useRef<{ projectId: string; events: ChangeEvent[] }>({
    projectId: "",
    events: [],
  });
  const loadProjects = useCallback(async () => {
    const list = await execute<Entity[]>("list_projects");
    setProjects(list);
    setProjectId((id) => id || list[0]?.id || "");
  }, []);
  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [p, r, s] = await Promise.all([
      execute<Entity>("get_project", { projectId }),
      execute<Entity[]>("list_records", { projectId }),
      execute<Summary>("get_summary", { projectId }),
    ]);
    // Page through every recorded event; no 4,096-entry cap or silent truncation.
    const all: ChangeEvent[] =
      historyCache.current.projectId === projectId
        ? [...historyCache.current.events]
        : [];
    let afterSequence = all.at(-1)?.sequence ?? 0;
    for (;;) {
      const page = await execute<ChangeEvent[]>("get_history", {
        projectId,
        afterSequence,
        limit: 1000,
      });
      all.push(...page);
      if (page.length < 1000) break;
      afterSequence = page.at(-1)!.sequence;
    }
    if (current.current === projectId) {
      historyCache.current = { projectId, events: all };
      setProject(p);
      setRecords(r);
      setSummary(s);
      setEvents(all);
    }
  }, [projectId]);
  useEffect(() => {
    loadProjects()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadProjects]);
  useEffect(() => {
    setProject(undefined);
    setRecords([]);
    setEvents([]);
    setSummary(undefined);
    setSearch("");
    setSelectedDoc("");
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      refresh().catch((e) => setError(e.message));
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  const mutate = async (data: Record<string, unknown>) => {
    if (!editing) return;
    const { kind, entity } = editing;
    const base = {
      operationId: crypto.randomUUID(),
      origin: "local-app",
      data,
    };
    if (kind === "project") {
      const p = await execute<Entity>(
        entity ? "update_project" : "create_project",
        entity
          ? { ...base, projectId: entity.id, expectedRevision: entity.revision }
          : base,
      );
      setProjectId(p.id);
      await loadProjects();
      if (entity) await refresh();
    } else
      await execute(saveTools[kind], {
        ...base,
        projectId,
        ...(entity ? { id: entity.id, expectedRevision: entity.revision } : {}),
      });
    if (kind !== "project") await refresh();
    setNotice("Saved with revision history.");
  };
  const exportProject = async () => {
    try {
      const result = await unwrap<{ path: string } | null>(
        window.dmk2!.exportProject(projectId),
      );
      if (result) setNotice(`Exported to ${result.path}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importProject = async () => {
    try {
      const result = await unwrap<{ projectId: string } | null>(
        window.dmk2!.importProject(),
      );
      if (result) {
        await loadProjects();
        setProjectId(result.projectId);
        setNotice("Project imported with its complete recorded history.");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const filtered = records.filter((r) =>
    JSON.stringify(r.data).toLowerCase().includes(search.toLowerCase()),
  );
  const documents = records.filter((r) => r.kind === "document");
  const shownDocs = filtered.filter((r) => r.kind === "document");
  const doc = shownDocs.find((r) => r.id === selectedDoc) ?? shownDocs[0];
  const cards = (items: Entity[]) =>
    items.length ? (
      <div className="card-grid">
        {items.map((r) => (
          <RecordCard
            key={r.id}
            record={r}
            records={records}
            edit={(entity) =>
              setEditing({ kind: entity.kind as RecordKind, entity })
            }
            history={setHistory}
          />
        ))}
      </div>
    ) : (
      <Empty
        title="Nothing recorded yet"
        text="Your agent can organize this area through MCP, or you can add a record above."
      />
    );
  const wbs = (parent: string | null, depth = 0): React.ReactNode =>
    filtered
      .filter((r) => r.kind === "work_item" && r.data.parentId === parent)
      .map((r) => (
        <div
          key={r.id}
          className="wbs-node"
          style={{ marginLeft: depth ? 16 : 0 }}
        >
          <RecordCard
            record={r}
            records={records}
            edit={(entity) => setEditing({ kind: "work_item", entity })}
            history={setHistory}
          />
          {wbs(r.id, depth + 1)}
        </div>
      ));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">D</span>
          <div>
            <strong>DMK2</strong>
            <small>Docmonstakrakin v2</small>
          </div>
        </div>
        <p className="tagline">
          Your project canvas.
          <br />
          AI does the organizing.
        </p>
        <label className="project-select">
          Workspace
          <select
            aria-label="Select project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {!projects.length && <option value="">No projects yet</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {String(p.data.name)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="new-project"
          onClick={() => setEditing({ kind: "project" })}
        >
          + New project
        </button>
        <nav aria-label="Workspace views">
          {views.map((v, i) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => {
                setView(v);
                setSearch("");
              }}
            >
              <span aria-hidden="true">{icons[i]}</span>
              {v}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="local-dot" />
          Local workspace<small>Records stay on this device</small>
          <button onClick={importProject} disabled={!window.dmk2}>
            Import .dmk2
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <span className="muted">/ {view}</span>
          </span>
          <div>
            <button
              onClick={() => {
                loadProjects()
                  .then(refresh)
                  .catch((e) => setError(e.message));
              }}
            >
              Refresh
            </button>
            <button onClick={exportProject} disabled={!project}>
              Export project ↗
            </button>
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="notice banner" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {!project ? (
            <Empty
              title={
                loading
                  ? "Opening your workspace…"
                  : projectId
                    ? "Loading project…"
                    : "A clear space for your next project"
              }
              text="Create a project, import a .dmk2 package, or connect your local AI client through MCP."
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {view === "Overview"
                      ? "PROJECT OVERVIEW"
                      : String(project.data.name)}
                  </span>
                  <h1>
                    {view === "Overview" ? String(project.data.name) : view}
                  </h1>
                  <p>
                    {view === "Overview"
                      ? String(project.data.description) ||
                        "Add your vision. Build the plan as you learn."
                      : descriptions[view]}
                  </p>
                </div>
                <div className="heading-actions">
                  {view === "Overview" && (
                    <button
                      onClick={() =>
                        setEditing({ kind: "project", entity: project })
                      }
                    >
                      Edit project
                    </button>
                  )}
                  {additions[view].map((kind) => (
                    <button
                      key={kind}
                      className="primary"
                      onClick={() => setEditing({ kind })}
                    >
                      +{" "}
                      {kind === "work_item"
                        ? "Work item"
                        : kind[0]!.toUpperCase() + kind.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {view !== "Overview" && (
                <input
                  className="search"
                  aria-label={
                    view === "Activity" ? "Search activity" : "Search records"
                  }
                  placeholder={
                    view === "Activity"
                      ? "Search changes, origins and sources…"
                      : "Search this view…"
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
              {view === "Overview" && summary && (
                <>
                  <div className="stats">
                    {[
                      ["Requirements", summary.counts.requirement],
                      ["Decisions", summary.counts.decision],
                      ["Open questions", summary.unresolvedQuestions.length],
                      ["Blockers", summary.blockers.length],
                    ].map(([label, value]) => (
                      <section key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </section>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <h2>Project context</h2>
                      <span className="badge">
                        {String(project.data.lifecycle)}
                      </span>
                      <Fields
                        data={{
                          goals: project.data.goals,
                          repository:
                            project.data.repository || "Not connected",
                          branch: project.data.branch || "Not recorded",
                          observedCommit:
                            project.data.observedCommit || "Not observed",
                          sources: project.data.sources,
                        }}
                        records={records}
                      />
                      <small>
                        Source facts are explicitly recorded by agents or the
                        local app.
                      </small>
                    </section>
                    <section className="panel">
                      <h2>Work in view</h2>
                      {Object.keys(summary.executionStatus).length ? (
                        Object.entries(summary.executionStatus).map(
                          ([status, n]) => (
                            <div className="status-row" key={status}>
                              <span className={`badge ${status}`}>
                                {status}
                              </span>
                              <strong>{n}</strong>
                            </div>
                          ),
                        )
                      ) : (
                        <p className="muted">No work items recorded yet.</p>
                      )}
                      <p className="caption">
                        Source labels are shown separately in Plan &amp; WBS.
                      </p>
                    </section>
                    <section className="panel">
                      <h2>Unresolved questions</h2>
                      {summary.unresolvedQuestions.length ? (
                        summary.unresolvedQuestions.map((q) => (
                          <div className="compact-row" key={q.id}>
                            <strong>{String(q.data.title)}</strong>
                            <span className="badge">
                              {String(q.data.state)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          No unresolved questions recorded.
                        </p>
                      )}
                    </section>
                    <section className="panel">
                      <h2>Current blockers</h2>
                      {summary.blockers.length ? (
                        summary.blockers.map((r) => (
                          <div key={r.id}>
                            <h3>{String(r.data.title)}</h3>
                            <p>{String(r.data.description)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="muted">No blockers recorded.</p>
                      )}
                    </section>
                  </div>
                  <section className="section">
                    <h2>Requirements</h2>
                    {cards(records.filter((r) => r.kind === "requirement"))}
                  </section>
                  <section className="section">
                    <h2>Recent activity</h2>
                    <HistoryList
                      events={events.slice(-5).reverse()}
                      records={records}
                    />
                  </section>
                </>
              )}
              {view === "Plan & WBS" && (
                <>
                  {search ? (
                    cards(filtered.filter((r) => r.kind === "work_item"))
                  ) : records.some((r) => r.kind === "work_item") ? (
                    <div className="wbs">{wbs(null)}</div>
                  ) : (
                    <Empty
                      title="Start with one work item"
                      text="A WBS is optional. Add standalone tasks now and organize a hierarchy when it helps."
                    />
                  )}
                  <h2 className="section">Requirements</h2>
                  {cards(filtered.filter((r) => r.kind === "requirement"))}
                </>
              )}
              {view === "Documents" &&
                (doc ? (
                  <div className="documents-layout">
                    <nav aria-label="Documents">
                      {shownDocs.map((d) => (
                        <button
                          className={d.id === doc.id ? "active" : ""}
                          key={d.id}
                          onClick={() => setSelectedDoc(d.id)}
                        >
                          {String(d.data.title)}
                          <small>
                            {String(d.data.category)} · r{d.revision}
                          </small>
                        </button>
                      ))}
                    </nav>
                    <section className="document">
                      <header>
                        <span className="eyebrow">
                          r{doc.revision} ·{" "}
                          {String(doc.data.repositoryPath) || "Local document"}
                        </span>
                        <div>
                          <button
                            aria-label={`History ${doc.data.title}`}
                            onClick={() => setHistory(doc)}
                          >
                            History
                          </button>
                          <button
                            aria-label={`Edit ${doc.data.title}`}
                            onClick={() =>
                              setEditing({ kind: "document", entity: doc })
                            }
                          >
                            Edit
                          </button>
                        </div>
                      </header>
                      <SafeMarkdown
                        content={String(doc.data.markdown)}
                        documents={documents}
                        onDocument={(id) => {
                          setSearch("");
                          setSelectedDoc(id);
                        }}
                      />
                      <Fields
                        data={{
                          sources: doc.data.sources,
                          relatedIds: doc.data.relatedIds,
                        }}
                        records={records}
                      />
                    </section>
                  </div>
                ) : (
                  <Empty
                    title="Your project library starts here"
                    text="Add a Markdown document or ask your agent to record a brief, plan or architecture note."
                  />
                ))}
              {view === "Decisions & Questions" &&
                cards(
                  filtered.filter((r) =>
                    ["question", "decision"].includes(r.kind),
                  ),
                )}
              {view === "Security & Architecture" &&
                cards(
                  filtered.filter(
                    (r) =>
                      ["architecture", "risk"].includes(r.kind) ||
                      (r.kind === "requirement" &&
                        r.data.classification === "security"),
                  ),
                )}
              {view === "Activity" && (
                <>
                  {summary?.imports.map((i) => (
                    <section className="panel" key={i.id}>
                      <h3>Project imported</h3>
                      <p>
                        {i.origin} · {new Date(i.timestamp).toLocaleString()}
                      </p>
                      <small>
                        Preserved source history · checksum {i.checksum}
                      </small>
                    </section>
                  ))}
                  {events.length ? (
                    <HistoryList
                      events={events
                        .filter((e) =>
                          JSON.stringify(e)
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .reverse()}
                      records={records}
                    />
                  ) : (
                    <Empty
                      title="The project timeline is ready"
                      text="Every successful record change will appear here with its origin and revision."
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
      {editing && (
        <Editor
          key={`${editing.kind}-${editing.entity?.id ?? "new"}`}
          {...editing}
          records={records}
          onSave={mutate}
          onClose={() => setEditing(undefined)}
        />
      )}
      {history && (
        <div className="overlay">
          <section
            className="history-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Revision history"
          >
            <header>
              <h2>
                {String(history.data.title ?? history.data.name)} · History
              </h2>
              <button
                aria-label="Close history"
                onClick={() => setHistory(undefined)}
              >
                ×
              </button>
            </header>
            <HistoryList
              events={events.filter((e) => e.entityId === history.id).reverse()}
              records={records}
            />
          </section>
        </div>
      )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <section className="empty">
      <span className="empty-mark">◇</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}
const descriptions: Record<Exclude<View, "Overview">, string> = {
  "Plan & WBS":
    "A practical plan, with source labels and execution evidence kept distinct.",
  Documents: "The project knowledge your team and agents have recorded.",
  "Decisions & Questions":
    "The reasoning, answers and open questions behind your project.",
  "Security & Architecture":
    "System proposals, known risks and the work needed to verify them.",
  Activity:
    "A durable record of changes. Each revision keeps what came before.",
};
