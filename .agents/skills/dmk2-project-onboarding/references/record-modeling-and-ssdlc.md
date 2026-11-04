# Record modeling, traceability and SSDLC

Map only requirements supported by a source, user input or an explicitly labeled proposal. A security gap is not proof of a vulnerability, and a proposed mitigation is not evidence of implementation.

## Minimal record map

| Need | Record kind | Good content | Do not assume |
| --- | --- | --- | --- |
| Objective, source identity | project | Name, goals, source/branch/observed commit | Read source, actual SHA or readiness without inspection |
| Unresolved decision | question | Context, reason, unanswered state, source | User answered |
| Accepted or proposed choice | decision | Alternatives, selected option, rationale, consequences, status | User confirmed absent a real conversation reference |
| Functional/nonfunctional/security obligation | requirement | Testable statement, exact classification, priority, acceptance criteria as strings, test references | Document claim means verified |
| System boundary or dependency | architecture | Component/relationship/proposal/verification recordType; references | Relationship endpoints exist until created |
| Threat or engineering risk | risk | Threat, severity (unknown if unsupported), mitigation, verification | Risk accepted/closed |
| Work breakdown | work_item | Work hierarchy, dependencies, acceptance, source ID/status, evidence, execution state | A source says DONE means acceptance complete |
| Optional time-box | sprint | Goal, explicitly supported dates | Invented dates/owners |
| Managed note | document | Compact original or authorized user-authored Markdown | It is automatically linked to a repository file |

Use `relatedIds` to connect requirements, decisions, risks, architecture and tasks after both records exist. Build an acyclic graph for work parent/dependencies. Do not create a circular or self reference. For existing records, use stable server IDs and preserve original user-entered fields.

## Security and SSDLC coverage

When the project actually involves software, consider these **candidate checks**, not mandatory generic requirements: user authentication and authorization; secrets; input/output validation; data handling and encryption; dependency supply chain; logging and privacy; threat modeling; test automation; security review; recovery; deployment and release controls. Inspect documented stack, threat model, data sensitivity and trust boundaries before deciding applicability.

For each proposed security requirement, make its acceptance criteria observable and repeatable. Example candidate (not project fact):

- Title: Prevent cross-project record reads
- `classification`: `security`
- `statement`: Access to project-scoped records is rejected unless requester authorization covers that project.
- `priority`: `must` **only when risk/requirements substantiate that priority**, otherwise use a justified lower priority.
- `status`: `proposed` until authorized acceptance; never auto-set to `verified`.
- `acceptanceCriteria`: ["A request outside an authorized project scope is denied", "Positive and negative authorization tests are recorded"].
- `tests`: [] until a real test or test-plan reference exists.
- `sources`: [] until a document or explicitly approved user decision exists.

Record the difference between intended controls, implemented controls, independently tested controls and accepted residual risk. Do not invent severity, breach likelihood or regulatory requirements.

## Task planning

Organize tasks around concrete deliverables and acceptance, not every paragraph of source documentation. Use `parentId` and `dependencies` only after referenced work items exist; create parents and prerequisites first. Put source status exactly in `sourceStatus` while `executionStatus` is determined separately using available execution evidence. Status `unknown` is preferable to a fabricated outcome. A completed checklist step is not an independently verified deliverable.

If documentation contains contradictory WBS IDs or statuses, record a conflict; do not silently choose a convenient reading.

## Version limitations

The initial DMK2 release does not offer automated source parsing, task imports from GitHub issues, a full adaptive questionnaire engine, security assurance attestation or an agent-driven repository library. Use available MCP records for truthful summaries, and keep future workflow suggestions out of the claimed current capability set.
