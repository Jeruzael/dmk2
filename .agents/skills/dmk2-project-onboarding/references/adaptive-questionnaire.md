# Adaptive discovery questionnaire

The purpose is to reduce uncertainty, not maximize questions. Start with facts already present in the user's message, repository and DMK2 history; never ask the same answered question again.

## Question ordering

1. **Blockers:** Determine the project identity, authorized source, primary goal and scope needed for a correct setup.
2. **High-impact choices:** Ask about intended users, data sensitivity, required controls, regulatory constraints, success measures and release expectations only when applicable.
3. **Architecture options:** Ask questions when alternatives materially change design, risk, effort or cost.
4. **Execution details:** Clarify concrete acceptance criteria, owners and dependencies only when needed to plan real work.
5. **Defer optional matters:** Distinguish unanswered, explicitly deferred and not-applicable decisions. Do not fill answers with invented defaults.

Prefer one targeted question at a time when interacting conversationally. Group related questions only when the user expressly wants a questionnaire and the answers are independently required.

## DMK2 mapping

- When recording an unanswered question: use `record_question` with `title`, `context`, `reason`, `state: "unanswered"` and source references. Avoid duplicates based on same scope and decision.
- Once the user answers: use `record_answer` with the current `id`/`expectedRevision`, `state: "answered"`, the user's substantive answer and honest `rationale`; cite the conversation reference if available.
- Use `deferred` only for a real deferral, and `not-applicable` only after establishing irrelevance.
- A proposed architecture choice is not a user-confirmed decision. Only record a claimed confirmation with a real user conversation reference.
- If no DMK2 write authority exists, keep a proposed list of questions in the report, not a fabricated MCP event.

## Example synthetic question

**Title:** Is offline operation a mandatory requirement?

**Context:** The repository mentions intermittent connectivity but does not specify whether users must keep working while disconnected.

**Reason:** The answer affects local storage, synchronization, test strategy and threat modeling.

**Status:** unanswered until the user actually responds.

Stop discovery once remaining unknowns can be safely deferred and a useful, source-qualified initial setup can be created.
