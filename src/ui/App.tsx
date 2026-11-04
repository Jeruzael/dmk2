import { useCallback, useEffect, useRef, useState } from "react";
import type { Entity, RecordKind, ToolName } from "../core/schema.js";
import { execute, unwrap } from "./bridge.js";
import { Editor } from "./Editor.js";
import { HistoryList } from "./Records.js";
import { WorkManagement } from "./work/WorkManagement.js";
import { useHistory } from "./useHistory.js";
import { RecordHistory } from "./RecordHistory.js";
import {
  Overview,
  type IntelligenceDestination,
  type OverviewSummary,
} from "./intelligence/Overview.js";
import { RecordDetails } from "./intelligence/RecordDetails.js";
import { RecordWorkspace } from "./intelligence/RecordWorkspace.js";
import { DocumentWorkspace } from "./documents/DocumentWorkspace.js";
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
  sprint: "save_sprint",
};
const additions: Record<View, RecordKind[]> = {
  Overview: ["requirement"],
  "Plan & WBS": ["requirement"],
  Documents: ["document"],
  "Decisions & Questions": ["question", "decision"],
  "Security & Architecture": ["architecture", "risk", "requirement"],
  Activity: [],
};
type Summary = {
  repositoryObservation?: OverviewSummary["repositoryObservation"];
  latestSequence: number;
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
  const [summary, setSummary] = useState<Summary>();
  const [view, setView] = useState<View>("Overview");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{
    kind: RecordKind | "project";
    entity?: Entity;
  }>();
  const [history, setHistory] = useState<Entity>();
  const [detailId, setDetailId] = useState<string>();
  const [knowledgeRequest, setKnowledgeRequest] = useState<{
    tab: string;
    nonce: number;
  }>();
  const [workOpen, setWorkOpen] = useState<{ id: string; nonce: number }>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const historyFeed = useHistory(projectId, {
    search: view === "Activity" ? search : "",
    revision: summary?.latestSequence,
  });
  const events = historyFeed.events;
  const current = useRef(projectId);
  const workLeaveGuard = useRef<() => boolean>(() => true);
  const setWorkLeaveGuard = useCallback((guard: () => boolean) => {
    workLeaveGuard.current = guard;
  }, []);
  current.current = projectId;
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
    if (current.current === projectId) {
      setProject(p);
      setRecords(r);
      setSummary(s);
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
    setSummary(undefined);
    setSearch("");
    setDetailId(undefined);
    setWorkOpen(undefined);
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
  const openRecord = (entity: Entity) => {
    if (entity.kind === "work_item") {
      setDetailId(undefined);
      setView("Plan & WBS");
      setWorkOpen({ id: entity.id, nonce: Date.now() });
    } else setDetailId(entity.id);
  };
  const navigateIntelligence = (destination: IntelligenceDestination) => {
    setSearch("");
    if (destination === "questions" || destination === "decisions")
      setKnowledgeRequest({
        tab: destination === "questions" ? "Questions" : "Decision Register",
        nonce: Date.now(),
      });
    setView(
      (
        {
          work: "Plan & WBS",
          documents: "Documents",
          questions: "Decisions & Questions",
          decisions: "Decisions & Questions",
          security: "Security & Architecture",
        } as const
      )[destination],
    );
  };
  const detail =
    detailId === project?.id
      ? project
      : records.find((record) => record.id === detailId);
  const workChanged = async (entity?: Entity) => {
    if (entity)
      setRecords((old) =>
        old.some((r) => r.id === entity.id)
          ? old.map((r) => (r.id === entity.id ? entity : r))
          : [...old, entity],
      );
    await refresh();
  };
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
            onChange={(e) => {
              if (workLeaveGuard.current()) setProjectId(e.target.value);
            }}
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
        <div
          className={`content ${view === "Plan & WBS" ? "work-content" : ""}`}
        >
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
                      ? "Project intelligence from recorded facts, source observations and work evidence."
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
              {view !== "Overview" &&
                view !== "Plan & WBS" &&
                view !== "Documents" && (
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
                <Overview
                  key={project.id}
                  project={project}
                  records={records}
                  summary={summary}
                  events={events}
                  onOpen={openRecord}
                  onNavigate={navigateIntelligence}
                />
              )}
              <div hidden={view !== "Plan & WBS"}>
                <WorkManagement
                  key={project.id}
                  project={project}
                  records={records}
                  onChanged={workChanged}
                  onLeaveGuardChange={setWorkLeaveGuard}
                  openRequest={workOpen}
                />
              </div>
              {view === "Documents" && (
                <DocumentWorkspace
                  key={project.id}
                  projectId={project.id}
                  records={records}
                  onEdit={(record) =>
                    setEditing({ kind: "document", entity: record })
                  }
                  onHistory={setHistory}
                />
              )}
              {view === "Decisions & Questions" && (
                <RecordWorkspace
                  key={`${project.id}:decisions`}
                  projectId={project.id}
                  area="decisions"
                  records={records}
                  search={search}
                  onOpen={openRecord}
                  request={knowledgeRequest}
                />
              )}
              {view === "Security & Architecture" && (
                <RecordWorkspace
                  key={`${project.id}:security`}
                  projectId={project.id}
                  area="security"
                  records={records}
                  search={search}
                  onOpen={openRecord}
                />
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
                    <HistoryList events={events} records={records} />
                  ) : (
                    <Empty
                      title={
                        historyFeed.busy
                          ? "Loading activity…"
                          : search
                            ? "No matching changes"
                            : "The project timeline is ready"
                      }
                      text="Search covers all recorded events. Older history is loaded in pages."
                    />
                  )}
                  {historyFeed.error && (
                    <p role="alert" className="error">
                      {historyFeed.error}
                    </p>
                  )}
                  {historyFeed.more && (
                    <button
                      onClick={historyFeed.loadMore}
                      disabled={historyFeed.busy}
                    >
                      Load older activity
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
      {detail && (
        <RecordDetails
          key={detail.id}
          record={detail}
          records={records}
          onClose={() => setDetailId(undefined)}
          onOpen={openRecord}
          onEdit={(entity) =>
            setEditing({ kind: entity.kind as RecordKind | "project", entity })
          }
        />
      )}
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
        <RecordHistory
          entity={history}
          records={records}
          onClose={() => setHistory(undefined)}
        />
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
  Documents:
    "Managed notes and source-qualified repository documents, kept separate.",
  "Decisions & Questions":
    "The reasoning, answers and open questions behind your project.",
  "Security & Architecture":
    "System proposals, known risks and the work needed to verify them.",
  Activity:
    "A durable record of changes. Each revision keeps what came before.",
};
