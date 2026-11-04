import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  delimiter,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  basename,
  posix,
} from "node:path";
import { performance } from "node:perf_hooks";
import {
  isDocumentPath,
  repositoryRef,
  type RepositoryEntry,
} from "./schema.js";

const maxOutput = 32 * 1024 * 1024;
const pageBytes = 1024 * 1024;
const timeoutMs = 10000;
let executable: string | undefined;
function trustedGit(): string {
  if (executable) return executable;
  const known =
    process.platform === "win32"
      ? [
          join(
            process.env.ProgramFiles || "C:\\Program Files",
            "Git",
            "cmd",
            "git.exe",
          ),
        ]
      : ["/usr/bin/git", "/usr/local/bin/git"];
  const paths = (process.env.PATH || "")
    .split(delimiter)
    .filter(isAbsolute)
    .map((path) =>
      join(path, process.platform === "win32" ? "git.exe" : "git"),
    );
  const candidate = [...known, ...paths].find(
    (path) => existsSync(path) && statSync(path).isFile(),
  );
  if (!candidate)
    throw new Error("Git is unavailable. Install Git and restart DMK2.");
  executable = realpathSync(candidate);
  return executable;
}
function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))
  );
}
function cleanEnvironment(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.toUpperCase().startsWith("GIT_"),
    ),
  );
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_SYSTEM: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_LFS_SKIP_SMUDGE: "1",
  };
}
export function validateRepositoryRoot(input: string): string {
  if (!isAbsolute(input))
    throw new Error("Choose an absolute local repository root.");
  const root = resolve(input);
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error("Repository root symlinks are unsupported.");
  const real = realpathSync(root);
  if (
    process.platform === "win32"
      ? real.toLowerCase() !== root.toLowerCase()
      : real !== root
  )
    throw new Error("Repository roots through symlinks are unsupported.");
  const metadata = join(root, ".git");
  if (
    !lstatSync(metadata).isDirectory() ||
    lstatSync(metadata).isSymbolicLink()
  )
    throw new Error(
      "Choose a regular Git checkout; linked worktrees and Git-directory links are unsupported.",
    );
  if (inside(root, trustedGit()))
    throw new Error("Git executable must be outside the selected repository.");
  const started = performance.now();
  let visited = 0;
  const pending = [metadata];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++visited > 100000 || performance.now() - started > 3000)
        throw new Error(
          "Repository Git metadata exceeds the bounded inspection limit.",
        );
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("Git metadata symlinks are unsupported.");
      if (entry.isDirectory()) {
        if (!inside(metadata, realpathSync(path)))
          throw new Error("Git metadata escapes the selected repository.");
        pending.push(path);
      }
      if (entry.name.endsWith(".promisor"))
        throw new Error(
          "Partial clones are unsupported; use a complete local checkout.",
        );
    }
  }
  if (
    existsSync(join(metadata, "commondir")) ||
    existsSync(join(metadata, "objects", "info", "alternates")) ||
    existsSync(join(metadata, "config.worktree"))
  )
    throw new Error(
      "External Git object stores and per-worktree configuration are unsupported.",
    );
  const configPath = join(metadata, "config");
  if (statSync(configPath).size > 256 * 1024 || statSync(configPath).nlink > 1)
    throw new Error("Unsupported Git configuration.");
  const config = readFileSync(configPath, "utf8");
  if (/^\s*\[\s*include(?:if)?(?:\s|\])/im.test(config))
    throw new Error("External Git configuration includes are unsupported.");
  if (/^\s*(?:partialclone|promisor)\b/im.test(config))
    throw new Error("Partial-clone Git configuration is unsupported.");
  return root;
}
function child(root: string, command: string[]) {
  return spawn(
    trustedGit(),
    [
      "--no-pager",
      "--no-optional-locks",
      `--git-dir=${join(root, ".git")}`,
      `--work-tree=${root}`,
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.hooksPath=",
      "-c",
      "protocol.allow=never",
      ...command,
    ],
    {
      cwd: root,
      env: cleanEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}
async function output(
  root: string,
  command: string[],
  limit = maxOutput,
): Promise<Buffer> {
  return new Promise((fulfill, reject) => {
    const process = child(root, command);
    const buffers: Buffer[] = [];
    let length = 0;
    let settled = false;
    const timer = setTimeout(
      () =>
        finish(new Error("Read-only Git operation exceeded its time limit.")),
      timeoutMs,
    );
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        process.kill();
        reject(error);
      } else fulfill(Buffer.concat(buffers));
    }
    process.on("error", () =>
      finish(new Error("Read-only Git process could not start.")),
    );
    process.stderr.on("data", () => {});
    process.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > limit)
        finish(
          new Error("Repository inventory exceeds the bounded output limit."),
        );
      else if (!settled) buffers.push(chunk);
    });
    process.on("close", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(
              "Read-only Git source operation failed; the revision or object may be unavailable.",
            ),
      ),
    );
  });
}
export async function inspectRevision(input: string, requestedRef: string) {
  const root = validateRepositoryRoot(input);
  const ref = repositoryRef.parse(requestedRef);
  const commit = (
    await output(
      root,
      ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
      8192,
    )
  )
    .toString("utf8")
    .trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit))
    throw new Error("Source did not resolve to an exact Git commit.");
  const symbolic = (
    await output(
      root,
      [
        "rev-parse",
        "--symbolic-full-name",
        "--verify",
        "--end-of-options",
        ref,
      ],
      8192,
    )
  )
    .toString("utf8")
    .trim();
  const branch = symbolic.startsWith("refs/heads/") ? symbolic.slice(11) : "";
  return { root, ref, commit, branch };
}
function pathMetadata(
  path: string,
): Pick<
  RepositoryEntry,
  "title" | "folder" | "category" | "status" | "statusBasis"
> {
  const parts = path.toLowerCase().split("/");
  const categories: [string[], RepositoryEntry["category"]][] = [
    [["architecture", "architectures"], "Architecture"],
    [["planning", "plans"], "Planning"],
    [["tracking", "wbs"], "Tracking"],
    [["walkthrough", "walkthroughs"], "Walkthroughs"],
    [["guide", "guides"], "Guides"],
    [["draft", "drafts"], "Drafts"],
  ];
  const category =
    categories.find(([markers]) =>
      parts.slice(0, -1).some((part) => markers.includes(part)),
    )?.[1] ?? "General";
  const markers = parts.slice(0, -1);
  const status = markers.some((part) => ["draft", "drafts"].includes(part))
    ? "draft"
    : markers.some((part) => ["archive", "archived"].includes(part))
      ? "archived"
      : markers.includes("canonical")
        ? "canonical"
        : "unknown";
  return {
    title: basename(path)
      .replace(/\.(?:md|markdown|mdown)$/i, "")
      .replace(/[_-]/g, " "),
    folder: posix.dirname(path) === "." ? "" : posix.dirname(path),
    category,
    status,
    statusBasis: status === "unknown" ? "unknown" : "path marker",
  };
}
export async function observeRepository(root: string, ref: string) {
  const revision = await inspectRevision(root, ref);
  const tree = await output(revision.root, [
    "ls-tree",
    "-r",
    "-l",
    "-z",
    "--full-tree",
    revision.commit,
  ]);
  const entries: RepositoryEntry[] = [];
  const issues: {
    path: string;
    reason: string;
    kind: "skipped" | "unavailable";
  }[] = [];
  let eligible = 0;
  for (const raw of tree.toString("utf8").split("\0").filter(Boolean)) {
    const separator = raw.indexOf("\t");
    const path = raw.slice(separator + 1);
    if (!/\.(?:md|markdown|mdown)$/i.test(path)) continue;
    if (++eligible > 50000)
      throw new Error(
        "Repository exceeds the 50000 Markdown file inspection limit.",
      );
    const [mode, type, blobId, size] = raw
      .slice(0, separator)
      .trim()
      .split(/\s+/);
    if (!isDocumentPath(path) || path.includes("\ufffd")) {
      issues.push({
        path: path.slice(0, 8192),
        reason: "Unsupported document path or UTF-8 filename",
        kind: "skipped",
      });
      continue;
    }
    if (!["100644", "100755"].includes(mode!) || type !== "blob") {
      issues.push({
        path,
        reason: "Git symlink or non-regular entry",
        kind: "skipped",
      });
      continue;
    }
    if (
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(blobId!) ||
      !/^\d+$/.test(size!) ||
      !Number.isSafeInteger(Number(size))
    ) {
      issues.push({
        path,
        reason: "Blob metadata unavailable",
        kind: "unavailable",
      });
      continue;
    }
    entries.push({
      path,
      blobId: blobId!,
      byteSize: Number(size),
      ...pathMetadata(path),
    });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  // Read only a bounded metadata header; full document bodies remain on demand.
  const deadline = performance.now() + 30000;
  let cursor = 0;
  let stopped = false;
  const workers = await Promise.allSettled(
    Array.from({ length: 4 }, async () => {
      while (
        !stopped &&
        cursor < entries.length &&
        performance.now() < deadline
      ) {
        const entry = entries[cursor++]!;
        entry.titleBasis = "filename";
        let prefix: Buffer;
        try {
          prefix = await blobRange(
            revision.root,
            entry,
            0,
            Math.min(entry.byteSize, 8192 + 4),
          );
        } catch (failure) {
          stopped = true;
          throw failure;
        }
        let length = Math.min(8192, prefix.length);
        while (
          length < prefix.length &&
          length > 0 &&
          (prefix[length]! & 0xc0) === 0x80
        )
          length--;
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(
            prefix.subarray(0, length),
          );
        } catch {
          continue;
        }
        const heading = /^[ \t]{0,3}#[ \t]+(.+?)[ \t]*\r?$/m.exec(text);
        if (
          !heading ||
          (entry.byteSize > length &&
            heading.index + heading[0].length === text.length)
        )
          continue;
        const title = heading[1]!
          .replace(/[ \t]+#+[ \t]*$/, "")
          .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
          .replace(/[*_`~]/g, "")
          .replace(/<[^>]+>/g, "")
          .trim();
        if (title && title.length <= 4096) {
          entry.title = title;
          entry.titleBasis = "heading prefix";
        }
      }
    }),
  );
  const failed = workers.find((worker) => worker.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return {
    ...revision,
    entries,
    issues,
    counts: {
      eligible,
      indexed: entries.length,
      skipped: issues.filter((issue) => issue.kind === "skipped").length,
      unavailable: issues.filter((issue) => issue.kind === "unavailable")
        .length,
    },
  };
}
async function blobRange(
  root: string,
  entry: RepositoryEntry,
  offset: number,
  target: number,
): Promise<Buffer> {
  if (target === 0) return Buffer.alloc(0);
  return new Promise<Buffer>((fulfill, reject) => {
    const process = child(root, ["cat-file", "blob", entry.blobId]);
    let position = 0;
    let collected = 0;
    const buffers: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error("Document read exceeded its time limit.")),
      timeoutMs,
    );
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        process.kill();
        reject(error);
      } else {
        process.kill();
        fulfill(Buffer.concat(buffers));
      }
    }
    process.on("error", () =>
      finish(new Error("Document Git process could not start.")),
    );
    process.stderr.on("data", () => {});
    process.stdout.on("data", (chunk: Buffer) => {
      const start = Math.max(0, offset - position);
      const end = Math.min(chunk.length, offset + target - position);
      if (end > start) {
        const part = chunk.subarray(start, end);
        buffers.push(part);
        collected += part.length;
      }
      position += chunk.length;
      if (collected >= target) finish();
    });
    process.on("close", (code) => {
      if (!settled)
        finish(
          code === 0 && collected > 0
            ? undefined
            : new Error("Indexed document blob is unavailable."),
        );
    });
  });
}
export async function readBlobPage(
  root: string,
  entry: RepositoryEntry,
  offset: number,
): Promise<{ content: string; nextOffset: number; hasMore: boolean }> {
  validateRepositoryRoot(root);
  if (offset > entry.byteSize)
    throw new Error("Document offset exceeds the indexed file size.");
  if (offset === entry.byteSize)
    return { content: "", nextOffset: offset, hasMore: false };
  const buffer = await blobRange(
    root,
    entry,
    offset,
    Math.min(entry.byteSize - offset, pageBytes + 4),
  );
  let length = Math.min(pageBytes, buffer.length);
  while (
    length < buffer.length &&
    length > 0 &&
    (buffer[length]! & 0xc0) === 0x80
  )
    length--;
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      buffer.subarray(0, length),
    );
  } catch {
    throw new Error(
      "Source is not valid UTF-8 Markdown or the page boundary is invalid.",
    );
  }
  const nextOffset = offset + length;
  if (nextOffset < entry.byteSize && length === 0)
    throw new Error("Cannot advance the document page.");
  return { content, nextOffset, hasMore: nextOffset < entry.byteSize };
}
