import { useState } from "react";
import type { Entity, RecordKind } from "../core/schema.js";
export const labels: Record<string, string> = {
  name: "Name",
  title: "Title",
  description: "Description",
  goals: "Project goals",
  lifecycle: "Lifecycle",
  repository: "Repository URL or local path",
  branch: "Source branch",
  observedCommit: "Observed commit",
  sources: "Source references",
  context: "Context",
  reason: "Reason for asking",
  state: "Question state",
  answer: "Answer",
  rationale: "Rationale",
  alternatives: "Considered alternatives",
  selectedOption: "Selected option",
  consequences: "Consequences",
  status: "Status",
  classification: "Classification",
  statement: "Requirement statement",
  priority: "Priority",
  acceptanceCriteria: "Acceptance criteria",
  tests: "Test references",
  parentId: "Parent work item",
  dependencies: "Dependencies",
  sourceIdentifier: "Source identifier",
  sourceNamespace: "Source namespace",
  sourceStatus: "Source status",
  executionStatus: "Execution status",
  owner: "Owner",
  evidence: "Evidence references",
  lastSourceRevision: "Last source revision",
  category: "Category",
  markdown: "Markdown",
  repositoryPath: "Source repository path",
  recordType: "Architecture record type",
  technology: "Technology",
  fromId: "From component",
  toId: "To component",
  verification: "Verification requirements",
  threat: "Threat",
  severity: "Severity",
  mitigation: "Proposed mitigation",
  relatedIds: "Related records",
  goal: "Sprint goal",
  startDate: "Start date",
  endDate: "End date",
  risk: "Risk",
  sprintId: "Sprint",
  checklist: "Checklist",
};
const common = { title: "", description: "", sources: [], relatedIds: [] };
export const templates: Record<RecordKind | "project", Record<string, any>> = {
  project: {
    name: "",
    description: "",
    goals: [],
    lifecycle: "idea",
    repository: "",
    branch: "",
    observedCommit: "",
    sources: [],
  },
  question: {
    ...common,
    context: "",
    reason: "",
    state: "unanswered",
    answer: "",
    rationale: "",
  },
  decision: {
    ...common,
    alternatives: [],
    selectedOption: "",
    rationale: "",
    consequences: "",
    status: "proposed",
    confirmation: { claimed: false, conversationRef: "" },
  },
  requirement: {
    ...common,
    classification: "functional",
    statement: "",
    priority: "should",
    status: "proposed",
    acceptanceCriteria: [],
    tests: [],
  },
  work_item: {
    ...common,
    parentId: null,
    dependencies: [],
    sourceIdentifier: "",
    sourceNamespace: "",
    sourceStatus: "UNKNOWN",
    executionStatus: "unknown",
    acceptanceCriteria: [],
    owner: "",
    evidence: [],
    lastSourceRevision: "",
  },
  sprint: { ...common, goal: "", startDate: "", endDate: "" },
  document: {
    ...common,
    category: "general",
    markdown: "",
    repositoryPath: "",
  },
  architecture: {
    ...common,
    recordType: "component",
    technology: "",
    fromId: null,
    toId: null,
    status: "proposed",
    verification: [],
  },
  risk: {
    ...common,
    threat: "",
    severity: "unknown",
    mitigation: "",
    status: "open",
    verification: [],
  },
};
const choices: Record<string, string[]> = {
  lifecycle: [
    "idea",
    "discovery",
    "planning",
    "implementation",
    "maintenance",
    "archived",
  ],
  state: ["unanswered", "answered", "deferred", "not-applicable"],
  classification: ["functional", "nonfunctional", "security"],
  priority: ["must", "should", "could"],
  executionStatus: [
    "unknown",
    "backlog",
    "in-progress",
    "partial",
    "blocked",
    "completed",
    "future",
  ],
  recordType: ["component", "relationship", "proposal", "verification"],
  severity: ["unknown", "low", "medium", "high", "critical"],
};
const statuses: Partial<Record<RecordKind, string[]>> = {
  decision: ["proposed", "accepted", "superseded", "rejected", "deferred"],
  requirement: ["proposed", "accepted", "implemented", "verified", "deferred"],
  architecture: ["proposed", "selected", "implemented", "verified", "deferred"],
  risk: ["open", "mitigated", "accepted", "closed"],
};
const long = new Set([
  "description",
  "context",
  "reason",
  "answer",
  "rationale",
  "consequences",
  "statement",
  "markdown",
  "threat",
  "mitigation",
  "goal",
]);

export function Editor({
  kind,
  entity,
  records,
  onSave,
  onClose,
}: {
  kind: RecordKind | "project";
  entity?: Entity;
  records: Entity[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [data, setData] = useState<Record<string, any>>(() =>
    structuredClone(
      kind === "sprint"
        ? { ...templates.sprint, ...entity?.data }
        : (entity?.data ?? templates[kind]),
    ),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: unknown) =>
    setData((old) => ({ ...old, [key]: value }));
  return (
    <div className="overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        className="editor"
      >
        <header>
          <div>
            <span className="eyebrow">
              {entity
                ? `Revision ${entity.revision} → ${entity.revision + 1}`
                : "New record"}
            </span>
            <h2 id="editor-title">
              {entity ? "Edit" : "Create"} {kind.replace("_", " ")}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close editor">
            ×
          </button>
        </header>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              const clean =
                kind === "sprint"
                  ? Object.fromEntries(
                      Object.entries(data).filter(
                        ([key, value]) =>
                          !["startDate", "endDate"].includes(key) ||
                          value !== "",
                      ),
                    )
                  : data;
              await onSave(clean);
              onClose();
            } catch (error) {
              setError(String(error instanceof Error ? error.message : error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-fields">
            {Object.entries(data).map(([key, value]) => {
              if (key === "confirmation")
                return (
                  <fieldset key={key}>
                    <legend>User confirmation claim</legend>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={value.claimed}
                        onChange={(e) =>
                          set(key, { ...value, claimed: e.target.checked })
                        }
                      />
                      Agent records that the user confirmed this decision
                    </label>
                    <label>
                      Supporting conversation reference
                      <input
                        value={value.conversationRef}
                        onChange={(e) =>
                          set(key, {
                            ...value,
                            conversationRef: e.target.value,
                          })
                        }
                      />
                    </label>
                    <small>
                      This records a claim; it does not verify a person's
                      identity.
                    </small>
                  </fieldset>
                );
              const options =
                key === "status" ? statuses[kind as RecordKind] : choices[key];
              const multiple = ["relatedIds", "dependencies"].includes(key);
              const relation =
                multiple || ["parentId", "fromId", "toId"].includes(key);
              const candidates = records.filter(
                (r) =>
                  r.id !== entity?.id &&
                  (["parentId", "dependencies"].includes(key)
                    ? r.kind === "work_item"
                    : ["fromId", "toId"].includes(key)
                      ? r.kind === "architecture"
                      : true),
              );
              return (
                <label key={key}>
                  {labels[key] ?? key}
                  {relation ? (
                    <select
                      aria-label={labels[key] ?? key}
                      multiple={multiple}
                      value={value ?? ""}
                      onChange={(e) =>
                        set(
                          key,
                          multiple
                            ? [...e.target.selectedOptions].map((o) => o.value)
                            : e.target.value || null,
                        )
                      }
                    >
                      {!multiple && <option value="">None</option>}
                      {candidates.map((r) => (
                        <option key={r.id} value={r.id}>
                          {String(r.data.title)} · {r.kind.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  ) : options ? (
                    <select
                      aria-label={labels[key] ?? key}
                      value={value}
                      onChange={(e) => set(key, e.target.value)}
                    >
                      {options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : Array.isArray(value) ? (
                    <>
                      <textarea
                        aria-label={labels[key] ?? key}
                        rows={3}
                        value={value.join("\n")}
                        onChange={(e) => set(key, e.target.value.split("\n"))}
                        onBlur={() =>
                          set(
                            key,
                            value.filter((v: string) => v.trim()),
                          )
                        }
                      />
                      <small>One entry per line</small>
                    </>
                  ) : long.has(key) ? (
                    <textarea
                      aria-label={labels[key] ?? key}
                      rows={key === "markdown" ? 16 : 3}
                      required={key === "statement"}
                      value={value}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  ) : (
                    <input
                      aria-label={labels[key] ?? key}
                      type={
                        ["startDate", "endDate"].includes(key) ? "date" : "text"
                      }
                      required={key === "name" || key === "title"}
                      maxLength={key === "name" || key === "title" ? 300 : 2000}
                      value={value}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  )}
                </label>
              );
            })}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <span>Each save preserves the previous revision.</span>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : entity ? "Save revision" : "Create record"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
