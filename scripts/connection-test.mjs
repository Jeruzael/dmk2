import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const client = new Client({ name: "dmk2-connection-test", version: "1" });
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        fileURLToPath(new URL("../dist-node/mcp/server.js", import.meta.url)),
      ],
      stderr: "inherit",
    }),
  );
  const tools = await client.listTools();
  const result = await client.callTool({
    name: "get_capabilities",
    arguments: {},
  });
  if (result.isError || tools.tools.length !== 19)
    throw new Error("Capability check failed");
  console.log(
    `DMK2 stdio connection OK: ${tools.tools.length} tools. No model request made.`,
  );
} finally {
  await client.close();
}
