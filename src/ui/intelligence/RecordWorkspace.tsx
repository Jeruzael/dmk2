import { useEffect, useState } from "react";
import type { Entity } from "../../core/schema.js";

const decisionTabs = ["Questions", "Decision Register"];
const securityTabs = [
  "Components & Relationships",
  "Architecture Decisions",
  "Risks & Threats",
  "Security Requirements",
];
const sessions = new Map<string, string>();
export function recordsForKnowledgeTab(
  records: Entity[],
  tab: string,
): Entity[] {
  const architecture = records.filter((r) => r.kind === "architecture");
  const architectureIds = new Set(architecture.map((r) => r.id));
  const decisionIds = new Set(
    architecture.flatMap((r) => r.data.relatedIds as string[]),
  );
  return records.filter((record) => {
    if (tab === "Questions") return record.kind === "question";
    if (tab === "Decision Register") return record.kind === "decision";
    if (tab === "Components & Relationships")
      return (
        record.kind === "architecture" &&
        ["component", "relationship"].includes(String(record.data.recordType))
      );
    if (tab === "Architecture Decisions")
      return (
        (record.kind === "architecture" &&
          ["proposal", "verification"].includes(
            String(record.data.recordType),
          )) ||
        (record.kind === "decision" &&
          (decisionIds.has(record.id) ||
            (record.data.relatedIds as string[]).some((id) =>
              architectureIds.has(id),
            )))
      );
    if (tab === "Risks & Threats") return record.kind === "risk";
    return (
      record.kind === "requirement" && record.data.classification === "security"
    );
  });
}
export function RecordWorkspace({
  projectId,
  area,
  records,
  search,
  onOpen,
  request,
}: {
  projectId: string;
  area: "decisions" | "security";
  records: Entity[];
  search: string;
  onOpen: (entity: Entity) => void;
  request?: { tab: string; nonce: number };
}) {
  const tabs = area === "decisions" ? decisionTabs : securityTabs;
  const sessionKey = `${projectId}:${area}`;
  const [tab, setTab] = useState(() => sessions.get(sessionKey) ?? tabs[0]!);
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    sessions.set(sessionKey, tab);
  }, [sessionKey, tab]);
  useEffect(() => {
    if (request && tabs.includes(request.tab)) setTab(request.tab);
  }, [request, tabs]);
  useEffect(() => {
    setPage(0);
    setStatus("");
    setSeverity("");
  }, [tab]);
  useEffect(() => {
    setPage(0);
  }, [search, status, severity]);
  const statusOf = (record: Entity) =>
    String(record.data.state ?? record.data.status ?? "unknown");
  const all = recordsForKnowledgeTab(records, tab);
  const statuses = [...new Set(all.map(statusOf))].sort();
  const matched = all
    .filter(
      (record) =>
        (!status || statusOf(record) === status) &&
        (!severity || record.data.severity === severity) &&
        JSON.stringify(record.data)
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        String(a.data.title).localeCompare(String(b.data.title)) ||
        a.id.localeCompare(b.id),
    );
  const size = 50;
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(matched.length / size) - 1),
  );
  const source = (record: Entity) =>
    (record.data.sources as string[])[0] || "No source reference";
  const name = (id: unknown) =>
    records.find((record) => record.id === id)?.data.title ?? id ?? "Not set";
  const brief = (text: unknown) => (
    <span className="insight-cell-preview" title={String(text)}>
      {String(text || "Not recorded")}
    </span>
  );
  const headings =
    tab === "Questions"
      ? ["Question", "Answer state", "Source"]
      : tab === "Decision Register"
        ? ["Decision", "Recorded status", "Selected option", "Rationale"]
        : tab === "Risks & Threats"
          ? [
              "Risk / threat",
              "Severity",
              "Proposed mitigation",
              "Verification requirements",
            ]
          : tab === "Security Requirements"
            ? [
                "Requirement",
                "Priority",
                "Recorded status",
                "Acceptance criteria",
              ]
            : [
                "Architecture record",
                "Type",
                "Relationships / selected option",
                "Recorded status",
              ];
  return (
    <section
      className="insight-workspace"
      aria-label={`${area === "decisions" ? "Decisions and Questions" : "Security and Architecture"} workspace`}
    >
      <div
        className="work-tabs insight-tabs"
        role="tablist"
        aria-label={`${area} views`}
      >
        {tabs.map((name, index) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            id={`knowledge-tab-${index}`}
            aria-controls="knowledge-panel"
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next >= 0) {
                event.preventDefault();
                setTab(tabs[next]!);
                (
                  event.currentTarget.parentElement?.children[
                    next
                  ] as HTMLElement
                )?.focus();
              }
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id="knowledge-panel"
        aria-labelledby={`knowledge-tab-${tabs.indexOf(tab)}`}
      >
        <div className="insight-filters panel">
          <strong>
            {matched.length} of {all.length} records
          </strong>
          <label>
            Recorded status
            <select
              aria-label="Filter recorded status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          {tab === "Risks & Threats" && (
            <label>
              Severity
              <select
                aria-label="Filter severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="">All severities</option>
                {["unknown", "low", "medium", "high", "critical"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
          )}
          {(status || severity) && (
            <button
              onClick={() => {
                setStatus("");
                setSeverity("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="caption insight-register-qualification">
          {tab === "Architecture Decisions"
            ? "Architecture proposals, verification notes and explicitly linked decision records. "
            : ""}
          Recorded statuses, source references and confirmation claims are not
          independent verification.
        </p>
        <div
          className="insight-table-scroll"
          tabIndex={0}
          aria-label={`Scrollable ${tab}`}
        >
          <table className="insight-table">
            <thead>
              <tr>
                {headings.map((heading) => (
                  <th key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matched
                .slice(current * size, (current + 1) * size)
                .map((record) => (
                  <tr key={record.id}>
                    <td>
                      <button
                        className="insight-title-button"
                        onClick={() => onOpen(record)}
                      >
                        {String(record.data.title)}
                      </button>
                      <small>
                        {record.kind.replace("_", " ")} · r{record.revision}
                      </small>
                      {tab !== "Questions" && (
                        <small
                          className="insight-row-source"
                          title={source(record)}
                        >
                          {source(record)}
                        </small>
                      )}
                    </td>
                    {tab === "Questions" ? (
                      <>
                        <td>
                          <span
                            className={`badge ${String(record.data.state)}`}
                          >
                            {String(record.data.state)}
                          </span>
                          {["unanswered", "deferred"].includes(
                            String(record.data.state),
                          ) && (
                            <small className="insight-unresolved">
                              Unresolved
                            </small>
                          )}
                        </td>
                        <td>{brief(source(record))}</td>
                      </>
                    ) : tab === "Decision Register" ? (
                      <>
                        <td>
                          <span className="badge">{statusOf(record)}</span>
                        </td>
                        <td>{brief(record.data.selectedOption)}</td>
                        <td>{brief(record.data.rationale)}</td>
                      </>
                    ) : tab === "Risks & Threats" ? (
                      <>
                        <td>
                          <span
                            className={`badge ${String(record.data.severity)}`}
                          >
                            {String(record.data.severity)}
                          </span>
                        </td>
                        <td>{brief(record.data.mitigation)}</td>
                        <td>
                          {brief(
                            (record.data.verification as string[]).join("\n"),
                          )}
                        </td>
                      </>
                    ) : tab === "Security Requirements" ? (
                      <>
                        <td>{String(record.data.priority)}</td>
                        <td>
                          <span className="badge">{statusOf(record)}</span>
                        </td>
                        <td>
                          {(record.data.acceptanceCriteria as string[]).length}{" "}
                          recorded criteria
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{String(record.data.recordType ?? record.kind)}</td>
                        <td>
                          {record.data.recordType === "relationship"
                            ? brief(
                                `${name(record.data.fromId)} → ${name(record.data.toId)}`,
                              )
                            : brief(
                                record.data.selectedOption ??
                                  record.data.technology ??
                                  (record.data.relatedIds as string[])
                                    .map(name)
                                    .join(", "),
                              )}
                        </td>
                        <td>
                          <span className="badge">{statusOf(record)}</span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
          {!matched.length && (
            <div className="work-empty">
              <h3>No matching records</h3>
              <p>
                Adjust search or filters, or create a record with the controls
                above.
              </p>
            </div>
          )}
        </div>
        <div className="work-pagination">
          <span>
            {matched.length
              ? `${current * size + 1}–${Math.min((current + 1) * size, matched.length)} of ${matched.length}`
              : "0 records"}
          </span>
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </button>
          <button
            disabled={(current + 1) * size >= matched.length}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </section>
  );
}
