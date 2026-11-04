import { useState } from "react";
import type { ChangeEvent, Entity } from "../../core/schema.js";
import { executionStatuses } from "../../core/work-values.js";
import { Fields } from "../Records.js";
import { stateLabels } from "../work/model.js";

export type OverviewSummary = {
  counts: Record<string, number>;
  executionStatus: Record<string, number>;
  unresolvedQuestions: Entity[];
  blockers: Entity[];
  repositoryObservation?: {
    revision: number;
    ref: string;
    branch: string;
    commit: string;
    observedAt: string;
    indexed: number;
  } | null;
};
export type IntelligenceDestination =
  "work" | "documents" | "questions" | "decisions" | "security";
export function Overview({
  project,
  records,
  summary,
  events,
  onOpen,
  onNavigate,
}: {
  project: Entity;
  records: Entity[];
  summary: OverviewSummary;
  events: ChangeEvent[];
  onOpen: (entity: Entity) => void;
  onNavigate: (destination: IntelligenceDestination) => void;
}) {
  const [allBlockers, setAllBlockers] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [requirementLimit, setRequirementLimit] = useState(5);
  const requirements = records.filter((r) => r.kind === "requirement");
  const blockers = [...summary.blockers].sort(
    (a, b) =>
      String(a.data.sourceIdentifier || a.data.title).localeCompare(
        String(b.data.sourceIdentifier || b.data.title),
      ) || a.id.localeCompare(b.id),
  );
  const total = Object.values(summary.executionStatus).reduce(
    (sum, n) => sum + n,
    0,
  );
  const source = String(project.data.repository || "No repository recorded");
  const row = (record: Entity, blocker = false) => (
    <button
      key={record.id}
      className="insight-record-row"
      data-overview-blocker={blocker ? record.id : undefined}
      onClick={() => onOpen(record)}
    >
      <span>
        <strong>{String(record.data.title)}</strong>
        <small>
          {String(
            record.data.sourceIdentifier || record.kind.replace("_", " "),
          )}
        </small>
      </span>
      <span className="badge">
        {String(
          record.data.executionStatus ??
            record.data.state ??
            record.data.status ??
            "Recorded",
        )}
      </span>
    </button>
  );
  return (
    <div className="intelligence-overview">
      <section
        className="insight-source panel"
        aria-label="Recorded repository source"
      >
        <div>
          <span className="eyebrow">Recorded source</span>
          <strong title={source}>{source}</strong>
          <small>{String(project.data.branch || "Branch not recorded")}</small>
        </div>
        <div>
          <span className="eyebrow">Pinned observation</span>
          <code>
            {String(project.data.observedCommit || "Commit not recorded")}
          </code>
          <small>
            {summary.repositoryObservation ? (
              <>
                Library indexed{" "}
                {new Date(
                  summary.repositoryObservation.observedAt,
                ).toLocaleString()}{" "}
                ·{" "}
                {summary.repositoryObservation.branch ||
                  summary.repositoryObservation.ref}
                {summary.repositoryObservation.commit ===
                project.data.observedCommit ? (
                  " · matches this pin"
                ) : (
                  <>
                    <br />
                    Library pin:{" "}
                    <code>{summary.repositoryObservation.commit}</code>
                  </>
                )}
              </>
            ) : (
              "Observation time not recorded for this project pin"
            )}
          </small>
        </div>
        <div>
          <span className="badge">{String(project.data.lifecycle)}</span>
          <small>
            Project record updated{" "}
            {new Date(project.updatedAt).toLocaleString()}
          </small>
        </div>
      </section>
      <div className="stats insight-stats">
        <button onClick={() => setRequirementsOpen((open) => !open)}>
          <span>Requirements</span>
          <strong>{summary.counts.requirement ?? 0}</strong>
        </button>
        <button onClick={() => onNavigate("decisions")}>
          <span>Decisions</span>
          <strong>{summary.counts.decision ?? 0}</strong>
        </button>
        <button onClick={() => onNavigate("questions")}>
          <span>Open questions</span>
          <strong>{summary.unresolvedQuestions.length}</strong>
        </button>
        <button onClick={() => setAllBlockers((open) => !open)}>
          <span>Blockers</span>
          <strong>{blockers.length}</strong>
        </button>
      </div>
      <div className="insight-dashboard-grid">
        <section
          className="panel insight-blockers"
          aria-label="Actionable blockers"
        >
          <header className="insight-section-heading">
            <div>
              <h2>Actionable blockers</h2>
              <small>{blockers.length} work items marked blocked</small>
            </div>
            <button onClick={() => onNavigate("work")}>Open work</button>
          </header>
          {(allBlockers ? blockers : blockers.slice(0, 5)).map((record) =>
            row(record, true),
          )}
          {!blockers.length && (
            <p className="muted">No work items are marked blocked.</p>
          )}
          {blockers.length > 5 && (
            <button
              className="insight-more"
              onClick={() => setAllBlockers((open) => !open)}
            >
              {allBlockers
                ? "Show fewer blockers"
                : `View all ${blockers.length} blockers`}
            </button>
          )}
        </section>
        <section className="panel" aria-label="Work status distribution">
          <h2>Work status distribution</h2>
          <p className="caption">
            {total} recorded work items · execution states, without an overall
            completion score
          </p>
          {executionStatuses.map((status) => (
            <div className="insight-distribution" key={status}>
              <span>{stateLabels[status]}</span>
              <div aria-hidden="true">
                <i
                  className={status}
                  style={{
                    width: `${total ? ((summary.executionStatus[status] ?? 0) / total) * 100 : 0}%`,
                  }}
                />
              </div>
              <strong>{summary.executionStatus[status] ?? 0}</strong>
            </div>
          ))}
        </section>
        <section className="panel" aria-label="Recent project changes">
          <header className="insight-section-heading">
            <h2>Recent changes</h2>
            <span className="caption">Latest five</span>
          </header>
          {events.slice(0, 5).map((event) => (
            <button
              className="insight-record-row"
              key={event.id}
              onClick={() =>
                onOpen(records.find((r) => r.id === event.entityId) ?? project)
              }
            >
              <span>
                <strong>
                  {String(event.after.data.title ?? event.after.data.name)}
                </strong>
                <small>
                  {event.operation.replaceAll("_", " ")} · r{event.newRevision}{" "}
                  · {event.origin}
                </small>
              </span>
              <time dateTime={event.timestamp}>
                {new Date(event.timestamp).toLocaleDateString()}
              </time>
            </button>
          ))}
          {!events.length && <p className="muted">No changes loaded.</p>}
        </section>
        <section className="panel insight-shortcuts">
          <h2>Explore project knowledge</h2>
          <p className="caption">Open the records behind the plan.</p>
          {(["documents", "questions", "decisions", "security"] as const).map(
            (destination) => (
              <button key={destination} onClick={() => onNavigate(destination)}>
                {
                  {
                    documents: "Document libraries",
                    questions: "Questions to resolve",
                    decisions: "Decision Register",
                    security: "Explore security & architecture",
                  }[destination]
                }{" "}
                <span aria-hidden="true">↗</span>
              </button>
            ),
          )}
          <button onClick={() => setRequirementsOpen((open) => !open)}>
            Browse requirements <span aria-hidden="true">↗</span>
          </button>
        </section>
      </div>
      {requirementsOpen && (
        <section className="panel" aria-label="Project requirements">
          <h2>Project requirements · {requirements.length}</h2>
          {requirements.slice(0, requirementLimit).map((record) => row(record))}
          {requirements.length > requirementLimit && (
            <button onClick={() => setRequirementLimit((n) => n + 20)}>
              Show more requirements
            </button>
          )}
          {!requirements.length && <p>No requirements recorded.</p>}
        </section>
      )}
      <details className="panel insight-context">
        <summary>Project context & provenance</summary>
        <p>{String(project.data.description)}</p>
        <Fields data={project.data} records={records} />
        <p className="caption">
          Project timestamps describe recorded revisions. Source labels and
          approval claims are submitted facts, not independent verification.
        </p>
      </details>
    </div>
  );
}
