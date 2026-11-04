import {
  readdirSync,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
const notices = [];
function packages(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      packages(path);
      continue;
    }
    const manifest = join(path, "package.json");
    if (!existsSync(manifest)) continue;
    const p = JSON.parse(readFileSync(manifest, "utf8"));
    const licenseFiles = readdirSync(path).filter((name) =>
      /^(licen[sc]e|copying|notice)(\.|$)/i.test(name),
    );
    notices.push({
      name: p.name,
      version: p.version,
      license: p.license ?? "See package license",
      repository: p.repository ?? null,
      licenseFiles: licenseFiles.map((name) => ({
        name,
        content: readFileSync(join(path, name), "utf8"),
      })),
    });
    packages(join(path, "node_modules"));
  }
}
packages("node_modules");
notices.sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
);
mkdirSync("test-results", { recursive: true });
writeFileSync(
  "test-results/dependency-notices.json",
  JSON.stringify(notices, null, 2) + "\n",
);
console.log(
  `Wrote installed dependency notices for ${notices.length} packages to test-results/dependency-notices.json`,
);
