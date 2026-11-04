import { z } from "zod";
import { id } from "../core/schema.js";

export function isDocumentPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 4096 &&
    !/[\\:\x00-\x1f]/.test(path) &&
    !path.startsWith("/") &&
    path
      .split("/")
      .every(
        (part) =>
          part !== "" &&
          part !== "." &&
          part !== ".." &&
          part.toLowerCase() !== ".git",
      )
  );
}
export const documentPath = z
  .string()
  .max(4096)
  .refine(isDocumentPath, "Invalid repository document path");
export const repositoryRef = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine(
    (ref) => !ref.includes("..") && !ref.endsWith("/") && !ref.includes("//"),
    "Invalid Git revision",
  );
const mutation = {
  projectId: id,
  expectedRevision: z.number().int().nonnegative(),
  operationId: id,
  origin: z.string().min(1).max(2000),
};
export const chooseRepositorySchema = z.strictObject({
  ...mutation,
  ref: repositoryRef.default("HEAD"),
});
export const refreshRepositorySchema = z.strictObject({
  ...mutation,
  ref: repositoryRef.optional(),
});
export const repositoryQuerySchema = z.strictObject({ projectId: id });
export const readRepositorySchema = z.strictObject({
  projectId: id,
  indexRevision: z.number().int().positive(),
  path: documentPath,
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
});
export const repositoryHistorySchema = z.strictObject({
  projectId: id,
  beforeRevision: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export const repositoryRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("get"), args: repositoryQuerySchema }),
  z.strictObject({ action: z.literal("choose"), args: chooseRepositorySchema }),
  z.strictObject({
    action: z.literal("refresh"),
    args: refreshRepositorySchema,
  }),
  z.strictObject({ action: z.literal("read"), args: readRepositorySchema }),
  z.strictObject({
    action: z.literal("history"),
    args: repositoryHistorySchema,
  }),
]);
const objectId = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const repositoryEntrySchema = z.strictObject({
  path: documentPath,
  title: z.string().max(4096),
  titleBasis: z.enum(["heading prefix", "filename"]).optional(),
  folder: z.string().max(4096),
  category: z.enum([
    "Architecture",
    "Planning",
    "Tracking",
    "Walkthroughs",
    "Guides",
    "Drafts",
    "General",
  ]),
  status: z.enum(["canonical", "draft", "archived", "unknown"]),
  statusBasis: z.enum(["path marker", "unknown"]),
  blobId: objectId,
  byteSize: z.number().int().nonnegative(),
});
export type RepositoryEntry = z.infer<typeof repositoryEntrySchema>;
export const repositorySnapshotSchema = z.strictObject({
  projectId: id,
  revision: z.number().int().positive(),
  root: z.string().max(8192),
  ref: repositoryRef,
  branch: z.string().max(4096),
  commit: objectId,
  observedAt: z.iso.datetime(),
  counts: z.strictObject({
    eligible: z.number().int().nonnegative(),
    indexed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
  }),
  entries: z.array(repositoryEntrySchema).max(50000),
  issues: z
    .array(
      z.strictObject({
        path: z.string().max(8192),
        reason: z.string().max(200),
        kind: z.enum(["skipped", "unavailable"]),
      }),
    )
    .max(50000),
  changes: z.strictObject({
    added: z.array(documentPath).max(50000),
    changed: z.array(documentPath).max(50000),
    removed: z.array(documentPath).max(50000),
  }),
});
export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
export type ChooseRepositoryArgs = z.input<typeof chooseRepositorySchema>;
export type RefreshRepositoryArgs = z.input<typeof refreshRepositorySchema>;
export type ReadRepositoryArgs = z.input<typeof readRepositorySchema>;
export type RepositoryPage = {
  projectId: string;
  indexRevision: number;
  path: string;
  commit: string;
  content: string;
  offset: number;
  nextOffset: number;
  totalBytes: number;
  hasMore: boolean;
};
export type RepositoryDescription = {
  snapshot: RepositorySnapshot | null;
  available: boolean;
  unavailable: number;
  currentCommit?: string;
  checkedAt: string;
  error?: string;
};
