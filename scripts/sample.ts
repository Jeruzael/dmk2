import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createSample } from "../tests/sample.js";
import { fileURLToPath } from "node:url";
if (!process.env.DMK2_DATA_DIR)
  throw new Error(
    "Set DMK2_DATA_DIR to an isolated empty directory for the synthetic sample.",
  );
const client = new Client({ name: "dmk2-sample", version: "1" });
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
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text: string }[]).find(
      (c) => c.type === "text",
    )!.text;
    if (result.isError) throw new Error(text);
    return JSON.parse(text);
  };
  console.log(JSON.stringify(await createSample(call), null, 2));
} finally {
  await client.close();
}
