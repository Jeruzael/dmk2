import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const script = fileURLToPath(
  new URL("../dist-node/mcp/server.js", import.meta.url),
);
const dataDir = process.env.DMK2_DATA_DIR;
const config = {
  command: process.execPath,
  args: [script],
  ...(dataDir ? { env: { DMK2_DATA_DIR: resolve(dataDir) } } : {}),
};
const quote = (value) => JSON.stringify(value);
console.log("Codex CLI — config.toml\n");
console.log(
  `[mcp_servers.dmk2]\ncommand = ${quote(config.command)}\nargs = [${quote(script)}]`,
);
if (dataDir)
  console.log(
    `[mcp_servers.dmk2.env]\nDMK2_DATA_DIR = ${quote(resolve(dataDir))}`,
  );
console.log("\nClaude Code — .mcp.json / Gemini CLI — .gemini/settings.json\n");
console.log(JSON.stringify({ mcpServers: { dmk2: config } }, null, 2));
