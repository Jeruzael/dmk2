import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  packageSchema,
  projectData,
  recordSchemas,
} from "../src/core/schema.js";
mkdirSync("schemas", { recursive: true });
for (const [name, schema] of Object.entries({
  "dmk2-v1": packageSchema,
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
