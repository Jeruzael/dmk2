import type { Entity } from "../core/schema.js";
import { HistoryList } from "./Records.js";
import { useHistory } from "./useHistory.js";
export function RecordHistory({
  entity,
  records,
  onClose,
}: {
  entity: Entity;
  records: Entity[];
  onClose: () => void;
}) {
  const history = useHistory(entity.projectId, {
    entityId: entity.id,
    revision: entity.revision,
  });
  return (
    <div className="overlay">
      <section
        className="history-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Revision history"
      >
        <header>
          <h2>{String(entity.data.title ?? entity.data.name)} · History</h2>
          <button aria-label="Close history" onClick={onClose}>
            ×
          </button>
        </header>
        {history.error && (
          <p role="alert" className="error">
            {history.error}
          </p>
        )}
        <HistoryList events={history.events} records={records} />
        {history.busy && <p role="status">Loading revisions…</p>}
        {history.more && (
          <button onClick={history.loadMore} disabled={history.busy}>
            Load older revisions
          </button>
        )}
      </section>
    </div>
  );
}
