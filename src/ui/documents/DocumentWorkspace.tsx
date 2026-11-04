import { useCallback, useEffect, useRef, useState } from "react";
import type { Entity } from "../../core/schema.js";
import type { RepositoryDescription } from "../../repository/schema.js";
import { repositoryCall } from "../bridge.js";
import { Fields, SafeMarkdown } from "../Records.js";
import { RepositoryLibraryPanel } from "./RepositoryLibraryPanel.js";

export function DocumentWorkspace({
  projectId,
  records,
  onEdit,
  onHistory,
}: {
  projectId: string;
  records: Entity[];
  onEdit: (record: Entity) => void;
  onHistory: (record: Entity) => void;
}) {
  const [tab, setTab] = useState<"managed" | "repository">("managed");
  const [repositoryCount, setRepositoryCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const countEpoch = useRef(0);
  const onCount = useCallback((count: number) => {
    countEpoch.current++;
    setRepositoryCount(count);
  }, []);
  useEffect(() => {
    let active = true;
    const generation = countEpoch.current;
    repositoryCall<RepositoryDescription>("get", { projectId })
      .then((result) => {
        if (active && generation === countEpoch.current)
          setRepositoryCount(result.snapshot?.counts.indexed ?? 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId]);
  const documents = records.filter((record) => record.kind === "document");
  const shown = documents.filter((record) =>
    JSON.stringify(record.data).toLowerCase().includes(search.toLowerCase()),
  );
  const doc = shown.find((record) => record.id === selected) ?? shown[0];
  return (
    <section className="document-workspace">
      <div className="work-tabs" role="tablist" aria-label="Document libraries">
        <button
          role="tab"
          aria-selected={tab === "managed"}
          aria-controls="document-library-panel"
          id="managed-documents-tab"
          tabIndex={tab === "managed" ? 0 : -1}
          onClick={() => setTab("managed")}
          onKeyDown={(event) => {
            if (["ArrowRight", "ArrowLeft", "End"].includes(event.key)) {
              event.preventDefault();
              setTab("repository");
              (event.currentTarget.nextElementSibling as HTMLElement)?.focus();
            }
          }}
        >
          Managed Documents ({documents.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "repository"}
          aria-controls="document-library-panel"
          id="repository-documents-tab"
          tabIndex={tab === "repository" ? 0 : -1}
          onClick={() => setTab("repository")}
          onKeyDown={(event) => {
            if (["ArrowRight", "ArrowLeft", "Home"].includes(event.key)) {
              event.preventDefault();
              setTab("managed");
              (
                event.currentTarget.previousElementSibling as HTMLElement
              )?.focus();
            }
          }}
        >
          Repository Library ({repositoryCount ?? "…"})
        </button>
      </div>
      <div
        role="tabpanel"
        id="document-library-panel"
        aria-labelledby={
          tab === "managed"
            ? "managed-documents-tab"
            : "repository-documents-tab"
        }
      >
        {tab === "repository" ? (
          <RepositoryLibraryPanel projectId={projectId} onCount={onCount} />
        ) : (
          <>
            <div className="managed-library-heading">
              <p className="caption">
                {documents.length} managed documents · agent-created notes with
                SQLite revisions, separate from repository files
              </p>
              <input
                aria-label="Search managed documents"
                placeholder="Search managed notes…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {doc ? (
              <div className="documents-layout">
                <nav aria-label="Documents">
                  {shown.map((record) => (
                    <button
                      key={record.id}
                      className={record.id === doc.id ? "active" : ""}
                      onClick={() => setSelected(record.id)}
                    >
                      {String(record.data.title)}
                      <small>
                        {String(record.data.category)} · r{record.revision}
                      </small>
                    </button>
                  ))}
                </nav>
                <section className="document">
                  <header>
                    <span className="eyebrow">
                      r{doc.revision} ·{" "}
                      {String(doc.data.repositoryPath) || "Managed local note"}
                    </span>
                    <div>
                      <button
                        aria-label={`History ${doc.data.title}`}
                        onClick={() => onHistory(doc)}
                      >
                        History
                      </button>
                      <button
                        aria-label={`Edit ${doc.data.title}`}
                        onClick={() => onEdit(doc)}
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
                      setSelected(id);
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
              <div className="work-empty">
                <h2>
                  {search
                    ? "No matching managed documents"
                    : "Your managed library starts here"}
                </h2>
                <p>
                  Add an agent-created note, or open Repository Library to
                  observe a local checkout without importing its documents.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
