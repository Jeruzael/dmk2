import { useCallback, useEffect, useRef, useState } from "react";
import type { ChecklistItem, Entity } from "../../core/schema.js";
import {
  executionStatuses,
  workPriorities,
  workRisks,
} from "../../core/work-values.js";
import { execute } from "../bridge.js";
import { labels, templates } from "../Editor.js";
import { HistoryList } from "../Records.js";
import { useHistory } from "../useHistory.js";
import { reconcileDraft, stateLabels, type WorkData } from "./model.js";
import { StatusBadge, TaskIdentity } from "./shared.js";

export const drawerSections = [
  "Details",
  "Acceptance",
  "Checklist",
  "Links & History",
] as const;
export type DrawerSection = (typeof drawerSections)[number];
export function TaskDrawer({
  project,
  task,
  records,
  initialSection,
  onChanged,
  onClose,
  onDirtyChange,
}: {
  project: Entity;
  task?: Entity;
  records: Entity[];
  initialSection: DrawerSection;
  onChanged: (entity: Entity) => Promise<void>;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [base, setBase] = useState<Entity | undefined>(task);
  const [draft, setDraft] = useState<Entity["data"]>(() =>
    structuredClone(task?.data ?? templates.work_item),
  );
  const [section, setSection] = useState<DrawerSection>(initialSection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepText, setStepText] = useState("");
  const [stepKind, setStepKind] = useState("");
  const history = useHistory(project.id, {
    entityId: base?.id,
    active: section === "Links & History" && !!base,
    revision: base?.revision,
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const pending = useRef<
    { key: string; args: Record<string, unknown> } | undefined
  >(undefined);
  const dataDirty =
    JSON.stringify(draft) !== JSON.stringify(base?.data ?? templates.work_item);
  const dirty = dataDirty || !!stepText.trim();
  const data = draft as WorkData;
  const steps = data.checklist ?? [];
  const newer = !!task && !!base && task.revision > base.revision;
  const conflict = newer || /Revision conflict/.test(error);
  const set = (key: string, value: unknown) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const close = useCallback(() => {
    if (busy) return;
    if (!dirty || window.confirm("Discard unsaved work-item changes?"))
      onClose();
  }, [busy, dirty, onClose]);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (task && !dirty && !busy) {
      setBase(task);
      setDraft(structuredClone(task.data));
    }
  }, [task?.revision, dirty, busy]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab" && dialog.current) {
        const nodes = [
          ...dialog.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        ].filter((n) => n.getClientRects().length > 0);
        const first = nodes[0];
        const last = nodes.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === heading.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [close]);
  const persist = async (raw: Entity["data"]) => {
    const next = { ...raw };
    for (const key of ["acceptanceCriteria", "evidence", "sources"]) {
      if (JSON.stringify(raw[key]) !== JSON.stringify(base?.data[key]))
        next[key] = (next[key] as string[]).filter((s) => s.length > 0);
    }
    setBusy(true);
    setError("");
    setNotice("");
    const key = JSON.stringify({
      id: base?.id,
      revision: base?.revision,
      data: next,
    });
    if (pending.current?.key !== key)
      pending.current = {
        key,
        args: {
          projectId: project.id,
          ...(base ? { id: base.id, expectedRevision: base.revision } : {}),
          operationId: crypto.randomUUID(),
          origin: "local-app",
          data: next,
        },
      };
    try {
      const committed = await execute<Entity>(
        "save_work_item",
        pending.current.args,
      );
      setBase(committed);
      setDraft(structuredClone(committed.data));
      await onChanged(committed);
      pending.current = undefined;
      setNotice("Saved with revision history.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const reconcile = async (keepDraft: boolean) => {
    if (!base) return;
    setBusy(true);
    setError("");
    try {
      const latest = await execute<Entity>("get_record", {
        projectId: project.id,
        id: base.id,
      });
      const merged = keepDraft
        ? reconcileDraft(base.data, draft, latest.data)
        : { data: latest.data, conflicts: [] };
      setBase(latest);
      setDraft(structuredClone(merged.data));
      pending.current = undefined;
      await onChanged(latest);
      setNotice(
        keepDraft
          ? `Latest revision loaded. Review your pending changes before saving.${merged.conflicts.length ? " Both edits changed: " + merged.conflicts.map((k) => labels[k] ?? k).join(", ") + "." : ""}`
          : "Loaded the latest saved revision.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selectOptions = (kind?: string) =>
    records.filter((r) => r.id !== base?.id && (!kind || r.kind === kind));
  const relations = (key: "dependencies" | "relatedIds", kind?: string) => (
    <label>
      {labels[key]}
      <select
        multiple
        aria-label={labels[key]}
        value={(data[key] ?? []) as string[]}
        onChange={(e) =>
          set(
            key,
            [...e.target.selectedOptions].map((o) => o.value),
          )
        }
      >
        {selectOptions(kind).map((r) => (
          <option key={r.id} value={r.id}>
            {String(r.data.title)} · {r.kind.replace("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div
      className="work-drawer-layer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="work-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-task-heading"
        ref={dialog}
      >
        <header className="work-drawer-header">
          <div className="work-drawer-top">
            <span className="work-eyebrow">
              {base ? (
                <>
                  <TaskIdentity task={base} /> · Revision {base.revision}
                </>
              ) : (
                "NEW WORK ITEM"
              )}
            </span>
            <button aria-label="Close task drawer" onClick={close}>
              ×
            </button>
          </div>
          <h2 id="work-task-heading" ref={heading} tabIndex={-1}>
            {data.title || "New work item"}
          </h2>
          <div className="work-drawer-badges">
            <StatusBadge status={data.executionStatus} />
            <span className="work-source-chip">
              Source: {data.sourceStatus || "Not set"}
            </span>
            {dirty && <span className="work-unsaved">Unsaved changes</span>}
          </div>
        </header>
        <div
          className="work-drawer-tabs"
          role="tablist"
          aria-label="Task sections"
        >
          {drawerSections.map((s, i) => (
            <button
              key={s}
              role="tab"
              aria-selected={section === s}
              aria-controls={`task-panel-${i}`}
              id={`task-section-${i}`}
              tabIndex={section === s ? 0 : -1}
              onClick={() => setSection(s)}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? drawerSections.length - 1
                        : (i +
                            (e.key === "ArrowRight" ? 1 : -1) +
                            drawerSections.length) %
                          drawerSections.length;
                  setSection(drawerSections[next]!);
                  document.getElementById(`task-section-${next}`)?.focus();
                }
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="work-drawer-scroll" inert={busy}>
          {error && (
            <div className="work-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="work-notice" role="status">
              {notice}
            </div>
          )}
          {conflict && (
            <div className="work-conflict" role="alert">
              <strong>A newer revision needs review.</strong>
              <p>
                Your draft is preserved. Reload discards the draft; reconcile
                keeps fields you changed for your review.
              </p>
              <div>
                <button onClick={() => reconcile(false)} disabled={busy}>
                  Reload latest
                </button>
                <button onClick={() => reconcile(true)} disabled={busy}>
                  Reconcile draft
                </button>
              </div>
            </div>
          )}
          <div
            role="tabpanel"
            id={`task-panel-${drawerSections.indexOf(section)}`}
            aria-labelledby={`task-section-${drawerSections.indexOf(section)}`}
          >
            {section === "Details" && (
              <div className="work-drawer-fields">
                <label>
                  Task title
                  <input
                    aria-label="Task title"
                    value={data.title}
                    maxLength={300}
                    onChange={(e) => set("title", e.target.value)}
                  />
                </label>
                <label>
                  Execution status
                  <select
                    aria-label="Execution status"
                    value={data.executionStatus}
                    onChange={(e) => set("executionStatus", e.target.value)}
                  >
                    {executionStatuses.map((s) => (
                      <option key={s} value={s}>
                        {stateLabels[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Description
                  <textarea
                    aria-label="Description"
                    rows={5}
                    value={data.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </label>
                <div className="work-field-pair">
                  <label>
                    Priority
                    <select
                      aria-label="Priority"
                      value={data.priority ?? "unknown"}
                      onChange={(e) => set("priority", e.target.value)}
                    >
                      {workPriorities.map((v) => (
                        <option key={v} value={v}>
                          {v === "unknown" ? "Not set" : v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Risk
                    <select
                      aria-label="Risk"
                      value={data.risk ?? "unknown"}
                      onChange={(e) => set("risk", e.target.value)}
                    >
                      {workRisks.map((v) => (
                        <option key={v} value={v}>
                          {v === "unknown" ? "Unknown" : v}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Owner
                  <input
                    aria-label="Owner"
                    value={data.owner}
                    placeholder="Not assigned"
                    onChange={(e) => set("owner", e.target.value)}
                  />
                </label>
                <label>
                  Sprint
                  <select
                    aria-label="Sprint"
                    value={data.sprintId ?? ""}
                    onChange={(e) => set("sprintId", e.target.value || null)}
                  >
                    <option value="">Unassigned</option>
                    {selectOptions("sprint").map((s) => (
                      <option key={s.id} value={s.id}>
                        {String(s.data.title)}
                      </option>
                    ))}
                  </select>
                </label>
                <section className="work-source-info">
                  <h3>Source information</h3>
                  <dl>
                    <dt>Source status</dt>
                    <dd>{data.sourceStatus || "Not recorded"}</dd>
                    <dt>Source identifier</dt>
                    <dd>{data.sourceIdentifier || "Not recorded"}</dd>
                    <dt>Namespace</dt>
                    <dd>{data.sourceNamespace || "Not recorded"}</dd>
                    <dt>Last source revision</dt>
                    <dd>{data.lastSourceRevision || "Not observed"}</dd>
                    {project.data.branch ? (
                      <>
                        <dt>Project source branch</dt>
                        <dd>{String(project.data.branch)}</dd>
                      </>
                    ) : null}
                    {project.data.observedCommit ? (
                      <>
                        <dt>Observed project commit</dt>
                        <dd>{String(project.data.observedCommit)}</dd>
                      </>
                    ) : null}
                  </dl>
                  <p>
                    Source labels are recorded claims, separate from execution
                    and verification evidence.
                  </p>
                </section>
              </div>
            )}
            {section === "Acceptance" && (
              <div className="work-drawer-fields">
                <h3>Acceptance criteria</h3>
                <p className="work-caption">
                  Statements to meet. Checklist completion does not verify these
                  criteria.
                </p>
                <label>
                  Acceptance criteria
                  <textarea
                    aria-label="Acceptance criteria"
                    rows={7}
                    value={data.acceptanceCriteria.join("\n")}
                    onChange={(e) =>
                      set("acceptanceCriteria", e.target.value.split("\n"))
                    }
                  />
                </label>
                <h3>Linked requirements</h3>
                {records
                  .filter(
                    (r) =>
                      r.kind === "requirement" &&
                      data.relatedIds.includes(r.id),
                  )
                  .map((r) => (
                    <section className="work-linked-record" key={r.id}>
                      <strong>{String(r.data.title)}</strong>
                      <p>{String(r.data.statement)}</p>
                      <span>
                        Recorded requirement status: {String(r.data.status)}
                      </span>
                    </section>
                  ))}
                {!records.some(
                  (r) =>
                    r.kind === "requirement" && data.relatedIds.includes(r.id),
                ) && (
                  <p className="work-caption">
                    No requirements linked. Use Links & History to link existing
                    records.
                  </p>
                )}
              </div>
            )}
            {section === "Checklist" && (
              <div className="work-drawer-fields">
                <h3>Task checklist</h3>
                <p className="work-caption">
                  {steps.filter((i) => i.done).length}/{steps.length} steps
                  complete. This does not change execution status or verify
                  acceptance/tests.
                </p>
                {dataDirty && (
                  <p className="work-warning">
                    Save or discard your draft before updating checklist steps.
                  </p>
                )}
                {steps.map((item) => (
                  <label className="work-checklist-item" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={busy || dataDirty || !base}
                      onChange={() =>
                        persist({
                          ...base!.data,
                          checklist: steps.map((i) =>
                            i.id === item.id ? { ...i, done: !i.done } : i,
                          ),
                        })
                      }
                    />
                    <div>
                      <span>{item.text}</span>
                      {item.kind && <small>{item.kind} step</small>}
                      {item.evidence?.length ? (
                        <small>
                          Evidence references: {item.evidence.join(", ")}
                        </small>
                      ) : null}
                      {item.sourceRef && (
                        <small>Source: {item.sourceRef}</small>
                      )}
                    </div>
                  </label>
                ))}
                {!steps.length && (
                  <p className="work-caption">
                    No checklist steps recorded. Acceptance criteria are not
                    converted automatically.
                  </p>
                )}
                <div className="work-step-form">
                  <label>
                    New checklist step
                    <input
                      aria-label="New checklist step"
                      value={stepText}
                      disabled={!base || dataDirty || busy}
                      maxLength={2000}
                      onChange={(e) => setStepText(e.target.value)}
                    />
                  </label>
                  <label>
                    Step category
                    <select
                      aria-label="Step category"
                      value={stepKind}
                      onChange={(e) => setStepKind(e.target.value)}
                    >
                      <option value="">Not set</option>
                      <option value="implementation">Implementation</option>
                      <option value="verification">Verification</option>
                    </select>
                  </label>
                  <button
                    disabled={!base || dataDirty || busy || !stepText.trim()}
                    onClick={async () => {
                      const item: ChecklistItem = {
                        id: crypto.randomUUID(),
                        text: stepText.trim(),
                        done: false,
                        ...(stepKind
                          ? { kind: stepKind as ChecklistItem["kind"] }
                          : {}),
                      };
                      const saved = await persist({
                        ...base!.data,
                        checklist: [...steps, item],
                      });
                      if (saved) setStepText("");
                    }}
                  >
                    Add step
                  </button>
                  {!base && (
                    <small>
                      Save the work item before adding checklist steps.
                    </small>
                  )}
                </div>
              </div>
            )}
            {section === "Links & History" && (
              <div className="work-drawer-fields">
                <label>
                  Parent work item
                  <select
                    aria-label="Parent work item"
                    value={data.parentId ?? ""}
                    onChange={(e) => set("parentId", e.target.value || null)}
                  >
                    <option value="">Without parent</option>
                    {selectOptions("work_item").map((r) => (
                      <option key={r.id} value={r.id}>
                        {String(r.data.title)}
                      </option>
                    ))}
                  </select>
                </label>
                {relations("dependencies", "work_item")}
                {relations("relatedIds")}
                <label>
                  Evidence references
                  <textarea
                    aria-label="Evidence references"
                    rows={4}
                    value={data.evidence.join("\n")}
                    onChange={(e) =>
                      set("evidence", e.target.value.split("\n"))
                    }
                  />
                </label>
                <label>
                  Source references
                  <textarea
                    aria-label="Source references"
                    rows={3}
                    value={data.sources.join("\n")}
                    onChange={(e) => set("sources", e.target.value.split("\n"))}
                  />
                </label>
                <h3>Revision history</h3>
                {history.busy && <p role="status">Loading revisions…</p>}
                {history.error && (
                  <p role="alert" className="work-error">
                    {history.error}
                  </p>
                )}
                {base ? (
                  <>
                    <HistoryList events={history.events} records={records} />
                    {history.more && (
                      <button
                        onClick={history.loadMore}
                        disabled={history.busy}
                      >
                        Load more revisions
                      </button>
                    )}
                  </>
                ) : (
                  <p>No saved revisions yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
        <footer className="work-drawer-footer">
          <span>
            {busy
              ? "Saving…"
              : dirty
                ? "Draft changes are not saved"
                : base
                  ? "Saved locally"
                  : "Not saved yet"}
          </span>
          <button onClick={close} disabled={busy}>
            Close
          </button>
          <button
            className="primary"
            disabled={busy || !dataDirty || !data.title.trim()}
            onClick={() => persist(draft)}
          >
            {base ? "Save changes" : "Create work item"}
          </button>
        </footer>
      </section>
    </div>
  );
}
