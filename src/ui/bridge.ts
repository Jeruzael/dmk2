import type { ToolName } from "../core/schema.js";
type Reply<T> = { ok: true; value: T } | { ok: false; error: string };
declare global {
  interface Window {
    dmk2?: {
      execute: (tool: string, args: unknown) => Promise<Reply<unknown>>;
      exportProject: (id: string) => Promise<Reply<{ path: string } | null>>;
      importProject: () => Promise<Reply<{ projectId: string } | null>>;
      repositoryLibrary: (
        action: string,
        args: unknown,
      ) => Promise<Reply<unknown>>;
    };
  }
}
export async function repositoryCall<T>(
  action: "get" | "choose" | "refresh" | "read" | "history",
  args: unknown,
): Promise<T> {
  if (!window.dmk2?.repositoryLibrary)
    throw new Error(
      "Restart the DMK2 desktop app to enable the Repository Library.",
    );
  return unwrap<T>(window.dmk2.repositoryLibrary(action, args));
}
export async function unwrap<T>(promise: Promise<Reply<unknown>>): Promise<T> {
  const reply = await promise;
  if (!reply.ok) throw new Error(reply.error);
  return reply.value as T;
}
export async function execute<T>(
  tool: ToolName,
  args: unknown = {},
): Promise<T> {
  if (!window.dmk2)
    throw new Error(
      "Open DMK2 with npm start to connect to your local workspace.",
    );
  return unwrap<T>(window.dmk2.execute(tool, args));
}
