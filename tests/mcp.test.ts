import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createSample } from "./sample.js";

async function connect(dir: string) {
  const client = new Client({ name: "dmk2-acceptance", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("dist-node/mcp/server.js")],
    env: { ...(process.env as Record<string, string>), DMK2_DATA_DIR: dir },
    stderr: "pipe",
  });
  await client.connect(transport);
  const raw = (name: string, args: Record<string, unknown>) =>
    client.callTool({ name, arguments: args });
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await raw(name, args);
    const content = result.content as { type: string; text: string }[];
    const text = content.find((c) => c.type === "text")!.text;
    if (result.isError) throw new Error(text);
    return JSON.parse(text);
  };
  return { client, raw, call };
}
test("real stdio Fitness workflow preserves all records, events and operation receipts across export/import", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dmk2-mcp-"));
  const freshDir = mkdtempSync(join(tmpdir(), "dmk2-import-"));
  let a: Awaited<ReturnType<typeof connect>> | undefined;
  let b: typeof a;
  try {
    a = await connect(dir);
    b = await connect(freshDir);
    const tools = await a.client.listTools();
    assert.equal(tools.tools.length, 19);
    const ids = await createSample(a.call);
    const { projectId } = ids;
    const records = await a.call("list_records", { projectId });
    assert.equal(records.length, 14);
    const history = await a.call("get_history", { projectId });
    assert.equal(history.length, 20);
    const summary = await a.call("get_summary", { projectId });
    assert.equal(summary.unresolvedQuestions.length, 1);
    assert.equal(summary.blockers.length, 1);
    const pkg = await a.call("export_project", { projectId });
    const args = {
      projectId,
      id: ids.taskId,
      expectedRevision: 1,
      operationId: "stale-mcp",
      origin: "test",
      data: { title: "Bad overwrite" },
    };
    assert.equal((await a.raw("save_work_item", args)).isError, true);
    const original = {
      operationId: "sample-1",
      origin: "synthetic-acceptance-client",
      sourceRef: "fixture:fitness-v1",
      data: pkg.payload.project.data,
    };
    assert.equal((await a.call("create_project", original)).id, projectId);
    assert.equal((await a.call("get_history", { projectId })).length, 20);
    assert.equal(
      (
        await b.raw("import_project", {
          operationId: "bad",
          origin: "test",
          package: { ...pkg, schemaVersion: 99 },
        })
      ).isError,
      true,
    );
    assert.deepEqual(await b.call("list_projects", {}), []);
    await b.call("import_project", {
      operationId: "import-fitness",
      origin: "test",
      package: pkg,
    });
    const restored = await b.call("export_project", { projectId });
    for (const key of ["project", "records", "events", "operations"])
      assert.deepEqual(restored.payload[key], pkg.payload[key]);
    assert.equal(restored.payload.importHistory.length, 1);
    await a.client.close();
    a = await connect(dir);
    assert.equal(
      (await a.call("get_project", { projectId })).data.name,
      "Sample Fitness Project",
    );
    assert.equal(
      (await a.call("get_record", { projectId, id: ids.documentId })).revision,
      2,
    );
  } finally {
    await a?.client.close();
    await b?.client.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(freshDir, { recursive: true, force: true });
  }
});

test("two independent stdio processes read during writes and serialize competing revisions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dmk2-concurrent-"));
  let a: Awaited<ReturnType<typeof connect>> | undefined;
  let b: typeof a;
  try {
    [a, b] = await Promise.all([connect(dir), connect(dir)]);
    const p = await a.call("create_project", {
      operationId: "concurrent-project",
      origin: "test",
      data: { name: "Concurrent synthetic project" },
    });
    const writes = Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? a! : b!).call("save_work_item", {
        projectId: p.id,
        origin: "test",
        operationId: `task-${i}`,
        data: { title: `Task ${i}` },
      }),
    );
    const reads = Array.from({ length: 10 }, () =>
      b!.call("list_records", { projectId: p.id }),
    );
    await Promise.all([...writes, ...reads]);
    assert.equal(
      (await a.call("list_records", { projectId: p.id })).length,
      20,
    );
    const updates = await Promise.all([
      a.raw("update_project", {
        projectId: p.id,
        expectedRevision: 1,
        operationId: "writer-a",
        origin: "a",
        data: { name: "Writer A" },
      }),
      b.raw("update_project", {
        projectId: p.id,
        expectedRevision: 1,
        operationId: "writer-b",
        origin: "b",
        data: { name: "Writer B" },
      }),
    ]);
    assert.equal(updates.filter((r) => r.isError).length, 1);
    assert.equal((await a.call("get_history", { projectId: p.id })).length, 22);
  } finally {
    await a?.client.close();
    await b?.client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
