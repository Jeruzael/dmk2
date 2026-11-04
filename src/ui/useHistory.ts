import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "../core/schema.js";
import { execute } from "./bridge.js";
// Fetch only visible history pages. Search runs in SQLite over all events.
export function useHistory(
  projectId: string,
  {
    entityId,
    active = true,
    search = "",
    revision = 0,
  }: {
    entityId?: string;
    active?: boolean;
    search?: string;
    revision?: number;
  } = {},
) {
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  useEffect(() => {
    if (!active || !projectId) return;
    const generation = ++epoch.current;
    setBusy(true);
    setError("");
    setEvents([]);
    setMore(false);
    execute<ChangeEvent[]>("get_history", {
      projectId,
      ...(entityId ? { entityId } : {}),
      search,
      direction: "desc",
      limit: 50,
    })
      .then((page) => {
        if (epoch.current === generation) {
          setEvents(page);
          setMore(page.length === 50);
        }
      })
      .catch((e) => {
        if (epoch.current === generation) setError(e.message);
      })
      .finally(() => {
        if (epoch.current === generation) setBusy(false);
      });
    return () => {
      epoch.current++;
    };
  }, [projectId, entityId, active, search, revision]);
  const loadMore = async () => {
    if (busy || !more) return;
    const generation = epoch.current;
    setBusy(true);
    setError("");
    try {
      const page = await execute<ChangeEvent[]>("get_history", {
        projectId,
        ...(entityId ? { entityId } : {}),
        search,
        direction: "desc",
        beforeSequence: events.at(-1)?.sequence,
        limit: 50,
      });
      if (epoch.current === generation) {
        setEvents((old) => [...old, ...page]);
        setMore(page.length === 50);
      }
    } catch (e) {
      if (epoch.current === generation) setError((e as Error).message);
    } finally {
      if (epoch.current === generation) setBusy(false);
    }
  };
  return { events, more, busy, error, loadMore };
}
