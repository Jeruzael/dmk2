// Synthetic acceptance data only. The caller is a real MCP stdio client.
export async function createSample(
  call: (name: string, args: Record<string, unknown>) => Promise<any>,
) {
  let op = 0;
  const write = (name: string, args: Record<string, unknown>) =>
    call(name, {
      operationId: `sample-${++op}`,
      origin: "synthetic-acceptance-client",
      sourceRef: "fixture:fitness-v1",
      ...args,
    });
  const p = await write("create_project", {
    data: {
      name: "Sample Fitness Project",
      description: "A synthetic local workout planner for beginner athletes.",
      goals: ["Plan accessible workouts", "Keep personal training notes local"],
      lifecycle: "planning",
      repository: "https://example.invalid/sample-fitness",
      branch: "sample",
      observedCommit: "abc1234",
      sources: ["fixture:fitness-v1"],
    },
  });
  const projectId = p.id;
  const questions = [];
  for (const title of [
    "Who will use the planner?",
    "Where should workout data live?",
    "Should wearables sync in the first version?",
  ])
    questions.push(
      await write("record_question", {
        projectId,
        data: {
          title,
          context: "Initial discovery",
          reason: "Define the smallest useful product",
          sources: ["fixture:fitness-v1"],
        },
      }),
    );
  await write("record_answer", {
    projectId,
    id: questions[0].id,
    expectedRevision: 1,
    state: "answered",
    answer: "Beginner athletes",
    rationale: "Focus the first workout templates",
    sourceRef: "chat:synthetic/answer-1",
  });
  await write("record_answer", {
    projectId,
    id: questions[1].id,
    expectedRevision: 1,
    state: "answered",
    answer: "On this device",
    rationale: "Offline use",
    sourceRef: "chat:synthetic/answer-2",
  });
  await write("record_answer", {
    projectId,
    id: questions[2].id,
    expectedRevision: 1,
    state: "deferred",
    rationale: "Revisit after local planning works",
  });
  const proposals = [];
  for (const [title, technology] of [
    ["Local SQLite store", "SQLite"],
    ["Portable JSON files", "JSON"],
  ])
    proposals.push(
      await write("save_architecture", {
        projectId,
        data: {
          title,
          recordType: "proposal",
          technology,
          description: "Candidate storage design",
          verification: ["Restart and verify saved workout plans"],
        },
      }),
    );
  const decision = await write("record_decision", {
    projectId,
    data: {
      title: "Choose local storage",
      alternatives: ["SQLite", "JSON files"],
      selectedOption: "SQLite",
      rationale: "Transactions and queryable history",
      consequences: "Use a portable export for sharing",
      status: "accepted",
      relatedIds: proposals.map((p) => p.id),
      confirmation: {
        claimed: true,
        conversationRef: "chat:synthetic/decision-1",
      },
      sources: ["fixture:fitness-v1"],
    },
  });
  const functional = await write("save_requirement", {
    projectId,
    data: {
      title: "Plan a workout",
      statement: "A person can save a workout without a connection.",
      classification: "functional",
      priority: "must",
      acceptanceCriteria: ["Saved workout remains after restart"],
      relatedIds: [decision.id],
    },
  });
  const security = await write("save_requirement", {
    projectId,
    data: {
      title: "Keep notes local",
      statement: "Workout notes never load remote content automatically.",
      classification: "security",
      priority: "must",
      acceptanceCriteria: ["Remote images in notes are blocked"],
      tests: ["desktop:untrusted-markdown"],
    },
  });
  const root = await write("save_work_item", {
    projectId,
    data: {
      title: "Workout planner MVP",
      sourceIdentifier: "1",
      sourceNamespace: "sample-wbs",
      sourceStatus: "PARTIAL",
      executionStatus: "partial",
    },
  });
  const task = await write("save_work_item", {
    projectId,
    data: {
      title: "Create workout editor",
      parentId: root.id,
      sourceIdentifier: "1.1",
      sourceNamespace: "sample-wbs",
      sourceStatus: "DONE",
      relatedIds: [functional.id],
      acceptanceCriteria: ["Create and reopen a workout"],
    },
  });
  await write("save_work_item", {
    projectId,
    id: task.id,
    expectedRevision: 1,
    data: {
      ...task.data,
      executionStatus: "partial",
      evidence: ["fixture:editor-prototype"],
      description:
        "Source says DONE; execution evidence supports a partial prototype.",
    },
  });
  await write("save_work_item", {
    projectId,
    data: {
      title: "Verify offline persistence",
      parentId: root.id,
      dependencies: [task.id],
      sourceStatus: "BLOCKED",
      executionStatus: "blocked",
      description: "Waiting for editor implementation",
    },
  });
  await write("save_work_item", {
    projectId,
    data: {
      title: "Wearable integration",
      sourceStatus: "FUTURE",
      executionStatus: "future",
    },
  });
  const doc = await write("save_document", {
    projectId,
    data: {
      title: "Project brief",
      category: "discovery",
      markdown:
        "# Project brief\n\nA local workout planner.\n\n- Beginner athletes\n- Offline first",
      relatedIds: [functional.id],
    },
  });
  await write("save_document", {
    projectId,
    id: doc.id,
    expectedRevision: 1,
    data: {
      ...doc.data,
      markdown:
        "# Project brief\n\nA local workout planner.\n\n| Area | Choice |\n| --- | --- |\n| Storage | SQLite |\n\n## Safety\n\n- Keep notes local\n\n```ts\nconst offline = true;\n```\n\n[Safety](#safety)\n\n<script>window.__untrusted = true</script>\n\n![remote](https://example.invalid/tracker.png)",
    },
  });
  await write("save_risk", {
    projectId,
    data: {
      title: "Untrusted note content",
      threat: "Remote tracking or script execution in notes",
      severity: "high",
      mitigation: "Disable raw HTML, remote media and external navigation",
      verification: ["desktop:untrusted-markdown"],
      relatedIds: [security.id],
    },
  });
  return {
    projectId,
    taskId: task.id,
    documentId: doc.id,
    questionId: questions[0].id,
    decisionId: decision.id,
  };
}
