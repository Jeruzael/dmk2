import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  packageSchema,
  projectData,
  recordSchemas,
} from "../src/core/schema.js";
mkdirSync("schemas", { recursive: true });
for (const [name, schema] of Object.entries({
  // The published v1 structural schema stays unchanged.
  "dmk2-v2": packageSchema.extend({ schemaVersion: z.literal(2) }),
  project: projectData,
  ...recordSchemas,
}))
  writeFileSync(
    `schemas/${name}.schema.json`,
    JSON.stringify(
      z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }),
      null,
      2,
    ) + "\n",
  );
