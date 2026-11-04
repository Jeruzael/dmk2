import { useEffect, useMemo, useRef, useState } from "react";
import type { Entity } from "../../core/schema.js";
import type {
  RepositoryEntry,
  RepositoryPage,
  RepositorySnapshot,
} from "../../repository/schema.js";
import { repositoryCall } from "../bridge.js";
import { SafeMarkdown } from "../Records.js";

const noDocuments: Entity[] = [];
const ignoreDocument = () => {};
export type SourceNavigation = {
  path: string;
  fragment: string;
  nonce: number;
};
export function RepositoryReader({
  snapshot,
  entry,
  navigation,
  onNavigate,
}: {
  snapshot: RepositorySnapshot;
  entry: RepositoryEntry;
  navigation: SourceNavigation;
  onNavigate: (path: string, fragment: string) => void;
}) {
  const [content, setContent] = useState("");
  const [page, setPage] = useState<RepositoryPage>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [fragment, setFragment] = useState(navigation.fragment);
  const [headings, setHeadings] = useState<{ id: string; text: string }[]>([]);
  const [headingNotice, setHeadingNotice] = useState("");
  const preview = useRef<HTMLDivElement>(null);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const autoPages = useRef(0);
  useEffect(() => {
    const generation = ++epoch.current;
    inFlight.current = true;
    repositoryCall<RepositoryPage>("read", {
      projectId: snapshot.projectId,
      indexRevision: snapshot.revision,
      path: entry.path,
      offset: 0,
    })
      .then((result) => {
        if (epoch.current === generation) {
          setContent(result.content);
          setPage(result);
        }
      })
      .catch((failure) => {
        if (epoch.current === generation) setError(failure.message);
      })
      .finally(() => {
        if (epoch.current === generation) {
          setBusy(false);
          inFlight.current = false;
        }
      });
    return () => {
      epoch.current++;
    };
  }, [snapshot.projectId, snapshot.revision, entry.path]);
  useEffect(() => {
    autoPages.current = 0;
    setFragment(navigation.fragment);
    setHeadingNotice("");
  }, [navigation]);
  const loadMore = async () => {
    if (!page?.hasMore || inFlight.current) return;
    const generation = epoch.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await repositoryCall<RepositoryPage>("read", {
        projectId: snapshot.projectId,
        indexRevision: snapshot.revision,
        path: entry.path,
        offset: page.nextOffset,
      });
      if (epoch.current === generation) {
        setContent((previous) => previous + result.content);
        setPage(result);
      }
    } catch (failure) {
      if (epoch.current === generation) setError((failure as Error).message);
    } finally {
      if (epoch.current === generation) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  };
  useEffect(() => {
    setHeadings(
      [
        ...(preview.current?.querySelectorAll<HTMLElement>(
          "h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]",
        ) ?? []),
      ].map((heading) => ({
        id: heading.id,
        text: heading.textContent || heading.id,
      })),
    );
  }, [content]);
  useEffect(() => {
    if (!fragment || busy || error) return;
    const target = [
      ...(preview.current?.querySelectorAll<HTMLElement>("[id]") ?? []),
    ].find((element) => element.id === fragment);
    if (target) {
      target.scrollIntoView({ block: "start" });
      window.history.replaceState(null, "", `#${encodeURIComponent(fragment)}`);
      setFragment("");
      setHeadingNotice("");
    } else if (page?.hasMore && autoPages.current < 4) {
      autoPages.current++;
      void loadMore();
    } else
      setHeadingNotice(
        page?.hasMore
          ? "Heading is beyond the loaded pages. Load more content to continue."
          : "The requested heading is not present in this document.",
      );
  }, [fragment, busy, content, error, page, navigation.nonce]);
  const repository = useMemo(
    () => ({
      currentPath: entry.path,
      paths: snapshot.entries.map((file) => file.path),
      onNavigate,
    }),
    [entry.path, snapshot.entries, onNavigate],
  );
  const markdown = useMemo(
    () => (
      <SafeMarkdown
        content={content}
        documents={noDocuments}
        onDocument={ignoreDocument}
        repository={repository}
        optimizeLongProse
      />
    ),
    [content, repository],
  );
  return (
    <section
      className="repository-reader"
      aria-label="Read-only repository preview"
    >
      <header>
        <span className="eyebrow">Repository-owned · read only</span>
        <h2>{entry.title}</h2>
        <code>{entry.path}</code>
        <div className="repository-file-facts">
          <span className="badge">
            {entry.status === "unknown"
              ? "Status unknown"
              : `Path-marked ${entry.status}`}
          </span>
          <small>
            {entry.category} · {entry.byteSize.toLocaleString()} bytes
          </small>
        </div>
      </header>
      <div className="repository-reader-tools">
        <label>
          On this page
          <select
            aria-label="Jump to repository heading"
            value=""
            onChange={(event) => onNavigate(entry.path, event.target.value)}
          >
            <option value="">Choose a loaded heading</option>
            {headings.map((heading) => (
              <option key={heading.id} value={heading.id}>
                {heading.text}
              </option>
            ))}
          </select>
        </label>
        <small>
          {page
            ? page.hasMore
              ? `${page.nextOffset} of ${page.totalBytes} bytes loaded`
              : `Complete · ${page.totalBytes} bytes`
            : "Opening pinned source…"}
        </small>
      </div>
      {headingNotice && (
        <p role="status" className="repository-notice">
          {headingNotice}
        </p>
      )}
      {error && (
        <p role="alert" className="error repository-notice">
          {error} The index and managed records have not been changed.
        </p>
      )}
      <div className="repository-preview" ref={preview} tabIndex={0}>
        {markdown}
        {!busy && !error && !content && (
          <p className="muted">This Markdown file is empty.</p>
        )}
      </div>
      <footer>
        <small>
          {busy
            ? "Reading source…"
            : "Pinned content; edits belong in your coding agent’s repository checkout."}
        </small>
        {page?.hasMore && (
          <button disabled={busy} onClick={loadMore}>
            Load more content
          </button>
        )}
      </footer>
    </section>
  );
}
