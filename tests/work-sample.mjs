// Deliberately synthetic; no source repository or private project data.
export async function createWorkSample(call, count = 500) {
  let operation = 0;
  const write = (name, args) =>
    call(name, {
      operationId: `work-fixture-${++operation}`,
      origin: "synthetic-workspace-fixture",
      sourceRef: "fixture:structured-fitness",
      ...args,
    });
  const project = await write("create_project", {
    data: {
      name: "Sample Fitness Workspace",
      description:
        "Synthetic work-management qualification: offline workout planning, useful milestones and traceable steps.",
      lifecycle: "planning",
      goals: [
        "Keep workout planning local",
        "Distinguish planning progress from verification",
      ],
      sources: ["fixture:structured-fitness"],
    },
  });
  const projectId = project.id;
  const requirement = await write("save_requirement", {
    projectId,
    data: {
      title: "Preserve offline workout plans",
      statement: "A saved workout remains available after restarting.",
      classification: "functional",
      priority: "must",
      acceptanceCriteria: [
        "Create, save, restart and independently verify the plan",
      ],
      status: "accepted",
    },
  });
  const sprints = [];
  for (const [title, goal] of [
    ["Offline foundation", "Establish dependable local planning"],
    ["Training templates", "Prepare reusable beginner workout templates"],
  ])
    sprints.push(
      await write("save_sprint", {
        projectId,
        data: { title, goal, sources: ["fixture:structured-fitness"] },
      }),
    );
  const roots = [];
  for (const [i, title] of [
    "Workout foundation",
    "Training templates",
    "Offline reliability",
    "Safety and evidence",
    "Future integrations",
  ].entries())
    roots.push(
      await write("save_work_item", {
        projectId,
        data: {
          title,
          sourceIdentifier: `FIT-G${i + 1}`,
          sourceNamespace: "synthetic-wbs",
          sourceStatus: "PARTIAL",
          executionStatus: "partial",
        },
      }),
    );
  const statuses = [
    "partial",
    "backlog",
    "in-progress",
    "blocked",
    "completed",
    "future",
    "unknown",
  ];
  let focusTask;
  for (let i = 0; i < count - roots.length; i++) {
    const isFocus = i === 0;
    const task = await write("save_work_item", {
      projectId,
      data: {
        title: isFocus
          ? "Create workout editor"
          : `Fitness planning task ${String(i + 1).padStart(3, "0")} — accessible workout templates, local notes and clear recovery guidance`,
        description: isFocus
          ? "Build a local workout form with accessible inputs and durable storage. Source completion is independent from observed execution."
          : "A synthetic task used to qualify readable planning and interaction at realistic backlog size.",
        sourceIdentifier: `FIT-${String(i + 1).padStart(3, "0")}`,
        sourceNamespace: "synthetic-wbs",
        sourceStatus: isFocus
          ? "DONE"
          : ["UNKNOWN", "PARTIAL", "DONE", "FUTURE"][i % 4],
        executionStatus: statuses[i % statuses.length],
        ...(i % 9 !== 0 || isFocus
          ? { parentId: roots[i % roots.length].id }
          : {}),
        ...(i % 4 !== 3 ? { sprintId: sprints[i % 2].id } : {}),
        ...(i % 5 !== 4
          ? { priority: ["high", "medium", "low", "unknown"][i % 4] }
          : {}),
        ...(i % 6 !== 5
          ? { risk: ["medium", "low", "unknown", "high"][i % 4] }
          : {}),
        owner: i % 3 === 0 ? "Taylor" : i % 3 === 1 ? "Morgan" : "",
        acceptanceCriteria: [
          isFocus
            ? "  The saved plan survives an application restart  "
            : "The saved plan survives an application restart",
          "Evidence is recorded separately from checklist completion",
        ],
        evidence: isFocus ? ["  fixture:evidence-to-preserve  "] : [],
        sources: isFocus ? ["  fixture:source-to-preserve  "] : [],
        relatedIds: [requirement.id],
        checklist: [
          {
            id: `step-${i}-form`,
            text: isFocus
              ? "Implement local editor form"
              : "Prepare task implementation",
            done: false,
            kind: "implementation",
          },
          {
            id: `step-${i}-review`,
            text: isFocus
              ? "Review persistence evidence"
              : "Review task evidence",
            done: false,
            kind: "verification",
            sourceRef: "fixture:verification-plan",
          },
          {
            id: `step-${i}-notes`,
            text: "Record implementation notes",
            done: i % 5 === 1,
            kind: "implementation",
          },
        ],
      },
    });
    if (isFocus) focusTask = task;
  }
  return {
    projectId,
    focusTaskId: focusTask.id,
    rootId: roots[0].id,
    sprintId: sprints[0].id,
    requirementId: requirement.id,
  };
}
