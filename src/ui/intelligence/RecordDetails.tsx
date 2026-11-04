import { useEffect, useRef } from "react";
import type { Entity } from "../../core/schema.js";
import { Fields, HistoryList, SafeMarkdown } from "../Records.js";
import { useHistory } from "../useHistory.js";

export function RecordDetails({
  record,
  records,
  onClose,
  onEdit,
  onOpen,
}: {
  record: Entity;
  records: Entity[];
  onClose: () => void;
  onEdit: (entity: Entity) => void;
  onOpen: (entity: Entity) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const history = useHistory(record.projectId, {
    entityId: record.id,
    revision: record.revision,
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    title.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    title.current?.focus();
  }, [record.id]);
  const linked = new Set(
    [
      ...(Array.isArray(record.data.relatedIds) ? record.data.relatedIds : []),
      ...["fromId", "toId", "parentId", "sprintId"].map(
        (key) => record.data[key],
      ),
      ...(Array.isArray(record.data.dependencies)
        ? record.data.dependencies
        : []),
    ].filter((id): id is string => typeof id === "string" && !!id),
  );
  return (
    <div className="insight-overlay">
      <section
        className="insight-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={String(record.data.title ?? record.data.name)}
        ref={panel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
          if (event.key === "Tab") {
            const elements = [
              ...(panel.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], input, select, textarea, summary, [tabindex="0"]',
              ) ?? []),
            ].filter((element) => element.getClientRects().length);
            const first = elements[0];
            const last = elements.at(-1);
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === title.current)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <span className="eyebrow">
              {record.kind.replace("_", " ")} · revision {record.revision}
            </span>
            <h2 tabIndex={-1} ref={title}>
              {String(record.data.title ?? record.data.name)}
            </h2>
          </div>
          <button aria-label="Close record details" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="insight-drawer-body">
          {record.kind === "decision" && (
            <p className="insight-qualification">
              Confirmation is an agent-recorded claim, not authenticated human
              approval. Supporting references remain below.
            </p>
          )}
          {["risk", "architecture"].includes(record.kind) && (
            <p className="insight-qualification">
              Recorded status and mitigation prose do not establish security
              assurance or independent verification.
            </p>
          )}
          <Fields data={record.data} records={records} />
          {record.kind === "document" && (
            <SafeMarkdown
              content={String(record.data.markdown)}
              documents={records.filter((r) => r.kind === "document")}
              onDocument={(id) => {
                const target = records.find((r) => r.id === id);
                if (target) onOpen(target);
              }}
            />
          )}
          {linked.size > 0 && (
            <section>
              <h3>Linked records</h3>
              {[...linked].map((id) => {
                const target = records.find((r) => r.id === id);
                return target ? (
                  <button
                    className="insight-linked-record"
                    key={id}
                    onClick={() => onOpen(target)}
                  >
                    {String(target.data.title ?? target.id)}
                  </button>
                ) : (
                  <p key={id}>Unavailable linked record: {id}</p>
                );
              })}
            </section>
          )}
          <details>
            <summary>Revision history</summary>
            {history.error && <p role="alert">{history.error}</p>}
            <HistoryList events={history.events} records={records} />
            {history.busy && <p role="status">Loading revisions…</p>}
            {history.more && (
              <button disabled={history.busy} onClick={history.loadMore}>
                Load older revisions
              </button>
            )}
          </details>
        </div>
        <footer>
          <small>Updated {new Date(record.updatedAt).toLocaleString()}</small>
          <button onClick={() => onEdit(record)}>Edit record</button>
        </footer>
      </section>
    </div>
  );
}
