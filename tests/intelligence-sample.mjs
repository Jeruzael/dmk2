// Synthetic fixture only. No external repository text or private records.
export async function createIntelligenceSample(call) {
  let op = 0;
  const write = (name, args) =>
    call(name, {
      operationId: `intelligence-fixture-${++op}`,
      origin: "synthetic-intelligence-test",
      ...args,
    });
  const project = await write("create_project", {
    data: {
      name: "Trailhead Fitness",
      description:
        "A deliberately long project description kept inside expandable context. ".repeat(
          24,
        ),
      repository: "https://example.invalid/synthetic/fitness.git",
      branch: "develop",
      observedCommit: "a".repeat(40),
      goals: [
        "Make planning readable",
        "Keep evidence and source claims distinct",
      ],
      sources: ["fixture:project-observation"],
    },
  });
  const projectId = project.id;
  const sprint = await write("save_sprint", {
    projectId,
    data: {
      title: "Offline planning milestone",
      goal: "Reliable local training plans",
    },
  });
  const fullSourceStatus =
    "DONE — source author reports implementation, but independent verification, release readiness, stakeholder review and security acceptance are still pending. ".repeat(
      5,
    );
  let task;
  for (let i = 0; i < 42; i++) {
    const current = await write("save_work_item", {
      projectId,
      data: {
        title:
          i === 0
            ? "Resolve workout persistence blocker"
            : `Resolve training blocker ${String(i + 1).padStart(2, "0")}`,
        sourceIdentifier: `TRAIL-${String(i + 1).padStart(3, "0")}`,
        description:
          "Investigate the actual blocker and record independent evidence. ".repeat(
            16,
          ),
        sourceStatus: i === 0 ? fullSourceStatus : "PARTIAL",
        executionStatus: "blocked",
        sprintId: sprint.id,
        evidence: ["fixture:verification-pending"],
        acceptanceCriteria: ["The plan survives restart"],
        checklist: [
          { id: `step-${i}`, text: "Review persistence evidence", done: false },
        ],
      },
    });
    if (i === 0) task = current;
  }
  const question = await write("record_question", {
    projectId,
    data: {
      title: "Who reviews offline reliability?",
      context: "Assign an independent reviewer",
      reason: "Evidence needs an owner",
      sources: ["fixture:discovery"],
    },
  });
  const decision = await write("record_decision", {
    projectId,
    data: {
      title: "Choose local-first storage",
      status: "accepted",
      selectedOption: "SQLite",
      alternatives: ["Flat JSON files", "Remote database"],
      rationale: "Local durability with transactional revisions",
      consequences: "Maintain compatible migrations",
      confirmation: {
        claimed: true,
        conversationRef: "fixture:synthetic-confirmation-claim",
      },
      relatedIds: [question.id],
      sources: ["fixture:decision"],
    },
  });
  const component = await write("save_architecture", {
    projectId,
    data: {
      title: "Workout repository",
      recordType: "component",
      technology: "SQLite",
      status: "implemented",
      sources: ["fixture:architecture"],
    },
  });
  const relationship = await write("save_architecture", {
    projectId,
    data: {
      title: "Editor saves through repository",
      recordType: "relationship",
      fromId: component.id,
      toId: component.id,
      relatedIds: [component.id],
    },
  });
  const architectureDecision = await write("save_architecture", {
    projectId,
    data: {
      title: "Keep the renderer isolated",
      recordType: "proposal",
      status: "selected",
      description: "Use the allowlisted preload boundary",
      relatedIds: [decision.id],
    },
  });
  const risk = await write("save_risk", {
    projectId,
    data: {
      title: "Untrusted imported notes",
      threat: "Imported prose may contain unsafe markup",
      severity: "high",
      mitigation: "Render safe Markdown",
      verification: ["Exercise the renderer boundary independently"],
      relatedIds: [component.id],
    },
  });
  const security = await write("save_requirement", {
    projectId,
    data: {
      title: "Block external content",
      classification: "security",
      statement: "The reader cannot load arbitrary remote resources",
      acceptanceCriteria: ["HTML and images remain disabled"],
      tests: ["fixture:renderer-acceptance"],
      sources: ["fixture:security-source"],
      relatedIds: [risk.id],
    },
  });
  const document = await write("save_document", {
    projectId,
    data: {
      title: "Managed project brief",
      category: "planning",
      repositoryPath: "notes/brief.md",
      markdown:
        "# Managed project brief\n\nAgent-authored notes retain SQLite revisions.\n\n## Evidence\n\nNo repository bodies are imported automatically.",
      relatedIds: [security.id],
    },
  });
  return {
    projectId,
    taskId: task.id,
    fullSourceStatus,
    questionId: question.id,
    decisionId: decision.id,
    componentId: component.id,
    relationshipId: relationship.id,
    architectureDecisionId: architectureDecision.id,
    riskId: risk.id,
    securityId: security.id,
    documentId: document.id,
  };
}
