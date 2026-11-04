import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// A connection check must not migrate or read the user's live workspace.
const directory = mkdtempSync(join(tmpdir(), "dmk2-connection-check-"));
const client = new Client({ name: "dmk2-connection-test", version: "1" });
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        fileURLToPath(new URL("../dist-node/mcp/server.js", import.meta.url)),
      ],
      env: { DMK2_DATA_DIR: directory },
      stderr: "inherit",
    }),
  );
  const tools = await client.listTools();
  const result = await client.callTool({
    name: "get_capabilities",
    arguments: {},
  });
  if (
    result.isError ||
    tools.tools.length !== 20 ||
    !tools.tools.some((t) => t.name === "save_sprint")
  )
    throw new Error("Capability check failed");
  const projects = await client.callTool({
    name: "list_projects",
    arguments: {},
  });
  if (projects.isError || JSON.parse(projects.content[0].text).length !== 0)
    throw new Error("Connection check did not use an empty isolated workspace");
  console.log(
    `DMK2 stdio connection OK: ${tools.tools.length} tools; isolated temporary workspace. No model request made.`,
  );
} finally {
  await client.close();
  rmSync(directory, { recursive: true, force: true });
}
