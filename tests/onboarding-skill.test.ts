import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const skillRoot = resolve(projectRoot, ".agents/skills/dmk2-project-onboarding");
const read = (path: string) => readFileSync(resolve(skillRoot, path), "utf8");
const main = read("SKILL.md");
const contract = read("references/mcp-contract.md");
const modeling = read("references/record-modeling-and-ssdlc.md");
const reconciliation = read("references/reconciliation.md");
const questions = read("references/adaptive-questionnaire.md");
const discovery = read("references/evidence-and-discovery.md");
const report = read("assets/onboarding-report.md");
const checklist = read("assets/review-checklist.md");

test("skill metadata and progressive disclosure references are valid", () => {
  assert.match(main, /^---\nname: dmk2-project-onboarding\ndescription: [^\n]+\n---/);
  for (const file of [
    "references/mcp-contract.md",
    "references/evidence-and-discovery.md",
    "references/adaptive-questionnaire.md",
    "references/record-modeling-and-ssdlc.md",
    "references/reconciliation.md",
    "assets/onboarding-report.md",
    "assets/review-checklist.md",
  ]) {
    assert.ok(main.includes(file), `skill should reference ${file}`);
    assert.ok(read(file).length > 250);
  }
});

test("documented tools agree with supported MCP names", async () => {
  const source = readFileSync(resolve(projectRoot, "src/core/schema.ts"), "utf8");
  const schemaPart = source.slice(source.indexOf("export const toolSchemas"), source.indexOf("export type ToolName"));
  assert.ok(schemaPart.length > 150);
  const keys = [...schemaPart.matchAll(/^\s{2}([a-z_]+): z\.strictObject\(/gm)].map((m) => m[1]);
  assert.equal(keys.length, 20, "baseline documented MCP contract should expose 20 tools");
  for (const name of keys) {
    assert.ok(contract.includes(`\`${name}\``), `missing MCP tool ${name} from reference`);
  }
  assert.match(main, /get_capabilities/);
  assert.match(main, /list_projects/);
  assert.match(main, /expectedRevision/);
  assert.match(main, /operationId/);
});

test("skill is explicit about sources, permissions, status and write safety", () => {
  assert.match(main, /permission|authorized/i);
  assert.match(main, /untrusted/i);
  assert.match(main, /read back|read-back/i);
  assert.match(main, /bulk/i);
  assert.match(main, /classification: security/);
  assert.match(main, /sourceStatus/);
  assert.match(main, /executionStatus/);
  assert.match(main, /verified/);
  assert.match(reconciliation, /reuse.*create.*update.*conflict.*defer/i);
  assert.match(reconciliation, /same operation ID/i);
  assert.match(discovery, /proposals?/i);
  assert.match(questions, /unanswered/i);
  assert.match(modeling, /security/i);
  assert.match(report, /Read-back summary/i);
  assert.match(checklist, /no duplicate project/i);
});

test("five synthetic scenario specifications are internally consistent", () => {
  const fixtures = JSON.parse(read("tests/onboarding-scenarios.json"));
  const scenarios = fixtures.scenarios;
  assert.deepEqual(scenarios.map((s: {id: string}) => s.id), [
    "greenfield", "existing-repository", "partial-import", "conflicting-records", "repeat-onboarding"
  ]);
  for (const scenario of scenarios) {
    const { existingProject, explicitCreateAuthorization, sourceAccess, observedCommit, expected, candidateRecords } = scenario;
    assert.equal(expected.duplicateCreates, 0, scenario.id);
    assert.equal(expected.verifySecurity, false, scenario.id);
    assert.equal(expected.createProject, !existingProject && explicitCreateAuthorization, scenario.id);
    assert.equal(expected.sourceInspectionClaim, Boolean(sourceAccess && observedCommit), scenario.id);
    assert.ok(candidateRecords.every((c: {action: string}) => ["reuse","create","update","conflict","defer"].includes(c.action)), scenario.id);
    if (existingProject) assert.ok(candidateRecords.some((c: {kind: string,action: string}) => c.kind === "project" && c.action === "reuse"));
    if (!sourceAccess) assert.equal(observedCommit, null);
  }
});

// These are deterministic artifact checks, not AI-agent behavior tests. Real
// acceptance must separately run the skill with two model hosts and compare
// observed DMK2 MCP state after initial and repeated onboarding.
