# SvelteKit Starter — AI Agent Guidelines

Instructions for autonomous AI coding agents working with `sveltekit-starter`.

**Primary objective:** Fully implement, review, verify, and test the application defined in `docs/implementation-plan.md` with minimal human intervention.

**Definition of success:** Every applicable requirement in the implementation plan is implemented, independently reviewed, functionally verified, and covered by appropriate tests. The application must pass its required quality checks and end-to-end testing before the agent declares completion.

---

## 1. Documentation & Tooling

### Quick Links

- [Architecture](docs/architecture.md)
- [Implementation Plan](docs/implementation-plan.md)
- [shadcn-svelte](docs/shadcn-svelte/SKILL.md)
- [Svelte Core Best Practices](docs/sveltekit/skills/svelte-core-bestpractices/SKILL.md)

### MCP Tools

- **Svelte MCP:** Use for Svelte 5 and SvelteKit documentation, APIs, component validation, and best practices.
- **Context7 MCP:** Use for all other frameworks, libraries, integrations, and dependencies.
- **Browser automation:** Use Playwright or an available equivalent for actual browser-based E2E testing.

Consult the relevant documentation before implementing unfamiliar functionality. Do not invent APIs or assume undocumented behavior.

### Required Documentation

**Architecture**

- `docs/architecture.md`

**shadcn-svelte**

- `docs/shadcn-svelte/SKILL.md`
- `docs/shadcn-svelte/cli.md`
- `docs/shadcn-svelte/customization.md`
- `docs/shadcn-svelte/rules/composition.md`
- `docs/shadcn-svelte/rules/forms.md`
- `docs/shadcn-svelte/rules/icons.md`
- `docs/shadcn-svelte/rules/styling.md`

**SvelteKit**

- `docs/sveltekit/agents/svelte-file-editor.md`
- `docs/sveltekit/instructions/AGENTS.md`
- `docs/sveltekit/skills/svelte-code-writer/SKILL.md`
- `docs/sveltekit/skills/svelte-core-bestpractices/SKILL.md`

**Svelte Core References**

Located in `docs/sveltekit/skills/svelte-core-bestpractices/references/`:

- `attach.md`
- `await-expressions.md`
- `bind.md`
- `each.md`
- `hydratable.md`
- `inspect.md`
- `render.md`
- `snippet.md`
- `svelte-reactivity.md`

**Database**

- `docs/drizzle-orm.md`

**Frontend Design**

- `docs/fronend-design/<theme>/DESIGN.md`
- `docs/fronend-design/<theme>/SKILL.md`

**GSAP**

- `docs/gsap/llms.txt`
- `docs/gsap/<module>/SKILL.md`

Read documents relevant to the current implementation. Do not load unrelated reference material unnecessarily.

---

# 2. Autonomous Execution Contract

## 2.1 Operating Mode: ONE-SHOT AUTONOMOUS

When instructed to implement the application, the agent must autonomously execute the entire implementation and verification lifecycle.

**The implementation plan is the source of truth for scope and acceptance criteria.**

The agent MUST:

1. Read and understand the complete implementation plan.
2. Inspect the existing application and identify what is already implemented.
3. Convert the plan into an exhaustive implementation checklist.
4. Build dependencies and architecture in the correct order.
5. Implement all planned features.
6. Independently review each implementation batch.
7. Fix defects and missing functionality.
8. Perform a complete plan-to-code coverage audit.
9. Execute comprehensive automated tests.
10. Run real browser-based end-to-end tests.
11. Fix every reproducible issue within scope.
12. Repeat reviews and testing until all completion gates pass.
13. Produce a final report with verifiable evidence.

**Do not stop after generating code. Code generation is only one stage of the task.**

## 2.2 No Intermediate Approval Gates

The initial implementation instruction authorizes normal development activities required by the plan.

The agent MUST NOT:

- Request approval after each feature.
- Ask whether to continue to the next phase.
- Stop after creating a checklist.
- Ask the user to review ordinary implementation decisions.
- Stop after the first successful build.
- Stop after individual tests pass.
- Treat a sub-agent's completion message as evidence that a feature works.
- Declare the application complete while any required verification remains unfinished.

Make reasonable implementation decisions autonomously, using the project's existing architecture and documented conventions.

Ask for human intervention only when essential information or permissions cannot be inferred or safely supplied, or an operation is explicitly outside the agent's authorization.

Examples include missing production credentials, payments involving real funds, destructive production changes, and irreversible external operations.

Continue all independent work while such a dependency is unresolved.

## 2.3 Persistent Execution

The agent must maintain forward progress through the entire lifecycle:

`PLAN → IMPLEMENT → REVIEW → FIX → AUDIT → TEST → FIX → RETEST → COMPLETE`

Failed checks are not terminal states.

When a check fails:

1. Identify the exact failure.
2. Determine the root cause.
3. Correct the underlying implementation.
4. Run the relevant checks again.
5. Perform regression testing.
6. Update task and coverage status.
7. Continue to the next unfinished requirement.

The agent must not repeatedly retry identical commands without changing its diagnosis or approach.

When multiple approaches fail, investigate the underlying assumptions, inspect relevant logs and source code, consult documentation, and choose a different justified solution.

**Never conceal, skip, or weaken requirements simply to obtain a passing result.**

## 2.4 Execution Limits and Recovery

Continue autonomously while execution resources and required tools are available.

If execution is interrupted by context limits, tool limits, environment failures, or unavailable permissions:

- Persist the completed work and current state.
- Record the exact next action.
- Record unresolved failures and blockers.
- Preserve all incomplete requirements.
- Resume from the recorded checkpoint when execution becomes available.
- Never claim full completion.

Do not deliberately stop because implementation is lengthy or complicated.

Do not start an infinite retry loop against an unrecoverable external blocker. Document it precisely and continue with unblocked work.

---

# 4. Task Tracking & Checkpointing

Maintain an up-to-date checklist throughout implementation.

Use the agent's native task tracker when it supports reliable persistence. Otherwise, maintain an execution checkpoint in `docs/implementation-plan.md` if authorized, or an existing project progress file.

The prohibition on creating unsolicited documentation still applies; a checkpoint is operational task state, not a new architectural document.

Each task should include:

- Task ID.
- Related requirement IDs.
- Dependencies.
- Files or components affected.
- Implementation status.
- Review status.
- Test status.
- Evidence.
- Blockers, if any.

Example:

- [x] AUTH-01 — Implement login
- [x] AUTH-02 — Validate credentials
- [x] AUTH-03 — Enforce protected-route access
- [ ] AUTH-04 — Verify session expiration
- [ ] AUTH-05 — Complete browser E2E tests

A task is completed only when its acceptance criteria pass.

Update the checklist continuously, not only at the end.

On resumption:

1. Read the implementation plan.
2. Read persisted progress.
3. Inspect the repository and current test results.
4. Reconcile stale or inaccurate statuses.
5. Resume from the earliest unfinished dependency or failed verification.

---

# 5. Sub-Agent Orchestration

Use sub-agents when supported by the coding environment.

The primary agent acts as the orchestrator and retains responsibility for final correctness.

## 5.1 Implementation Agent

Responsibilities:

- Implement assigned requirements.
- Follow project conventions.
- Write or update appropriate tests.
- Run targeted checks.
- Report changed files and completed requirement IDs.
- Identify incomplete or blocked functionality.

Assign implementation work in coherent batches with clear boundaries.

Avoid assigning overlapping file modifications to multiple agents simultaneously.

## 5.2 Review Agent

Use a separate review sub-agent where available.

Responsibilities:

- Compare implemented behavior against the implementation plan.
- Review code correctness.
- Detect missing features and incomplete business rules.
- Identify authorization and security problems.
- Review accessibility and UI behavior.
- Evaluate architecture and maintainability.
- Review relevant tests for meaningful coverage.

The review agent should inspect the actual changes and requirements rather than trusting the implementation agent's summary.

Every finding must identify:

- Requirement or affected behavior.
- Location of the problem.
- How to reproduce or verify the issue.
- Expected behavior.
- Required correction.

## 5.3 Testing Agent

Use an independent testing agent where available.

Responsibilities:

- Execute automated checks.
- Run the application.
- Test real browser interactions.
- Validate primary and edge-case workflows.
- Record reproducible failures.
- Retest corrections.
- Confirm previously passing workflows remain functional.

## 5.4 Delegation Fallback

If sub-agents are unavailable, the primary agent must execute all responsibilities sequentially.

Lack of sub-agent support is not permission to skip review or testing.

## 5.5 Review Feedback Loop

For each implementation batch:

1. Implementation agent completes assigned requirements.
2. Targeted checks execute.
3. Review agent inspects the result.
4. Findings become tracked corrective tasks.
5. Implementation agent resolves those findings.
6. Review agent verifies the corrections.
7. Targeted tests rerun.
8. The orchestrator advances only after the batch passes.

Parallelize independent work when safe, but never ignore dependencies, integration risks, or shared-file conflicts.

---

# 6. Mandatory Implementation Standards

## 6.1 SvelteKit & Svelte 5

- Use Svelte 5 runes: `$props`, `$state`, `$derived`, and `$effect`.
- Use modern Svelte 5 component patterns.
- Always use explicit TypeScript types where appropriate.
- Allow SvelteKit inference for `load` functions and route `$props()` data/children props.
- Avoid JSDoc unless necessary for shared utilities.
- Follow the included SvelteKit best-practice skills.
- Use Svelte MCP documentation for framework-specific decisions.

## 6.2 Server Functions

- Prefer SvelteKit Remote Functions: `form`, `query`, and `command`, over legacy form actions.
- Use documented asynchronous query patterns.
- Never call `redirect()` inside a `command`.
- Use `form` for supported mutations that need a redirect.
- Do not introduce new server interaction patterns without justification.

## 6.3 Validation

Use Valibot:

`import * as v from 'valibot'`

For applicable remote forms:

- Use `useRemoteForm`.
- Use `.preflight(schema)`.
- Use `useFormValidation`.
- Handle field-level and form-level errors.
- Use `await checkRateLimit(issue.field)` where appropriate.

Validate server-side even when client-side validation exists.

Never trust client-provided identities, permissions, amounts, or resource ownership.

## 6.4 Authentication & Authorization

- Protected route groups use `requireAuth()` in their server layout.
- Protected remote functions and standalone server routes must independently enforce `requireAuth()`.
- Authentication pages use `requireGuest()`.
- Sensitive password-backed routes and remote forms use `requireChallenge('/return-path')` where specified.
- Do not duplicate current-password fields when the challenge mechanism handles reauthentication.
- Enforce resource-level authorization on the server.

Layout protection alone does not establish authorization for independently callable server functions.

## 6.5 Database

- Use Drizzle ORM exclusively.
- Models belong in `$models`.
- Queries belong in `$queries`.
- The database connection is the default export from `$lib/server/database.ts`.
- Follow `docs/drizzle-orm.md`.
- Use transactions where atomicity is required.
- Respect foreign keys, uniqueness, constraints, and data integrity.
- Avoid N+1 queries where appropriate.

Never modify production data or run destructive production migrations without authorization.

## 6.6 State

- Prefer local Svelte component state.
- Use class-based state machines under `$lib/state/*.svelte.ts` only for genuinely cross-route or application-wide state.
- Avoid unnecessary global state.

## 6.7 UI & Design

- Use shadcn-svelte components whenever appropriate.
- Follow existing frontend theme specifications.
- Use the documented icon conventions.
- Follow the repository's Tailwind styling rules.
- Build fully functional UI interactions, not visual-only mockups.
- Implement loading, empty, success, validation, and failure states.
- Ensure keyboard accessibility and responsive layouts.

Do not create nonfunctional buttons, placeholder screens, or fake success states unless explicitly required by the plan.

## 6.8 Mobility API-First Build

The Mobility Sandbox must be implemented API-first. Do not begin mobility UI
implementation until the API contract required by that UI has been implemented,
tested, and reviewed.

The implementation order is:

1. Runtime and API foundation.
2. Static artifact packaging and validation.
3. Static mobility endpoints.
4. Scenario run and comparison endpoints.
5. Unified live snapshot endpoint.
6. Recommendations and reports.
7. Map and drawer UI integration.
8. Full browser workflows and hardening.

The API phases must expose stable contracts for the frontend rather than
temporary mock payloads. If a feature is approval-gated, return an explicit
typed unavailable or approval-required response instead of inventing data.

### Server architecture

- Route handlers under `src/routes/api/v1/**/+server.ts` only parse requests,
  validate input, call the mobility facade, map domain errors, and return JSON.
- Business rules belong in server-only mobility services, never in route handlers.
- The `MobilityFacade` is the public seam between HTTP routes and mobility
  internals.
- Use composition over inheritance and dependency injection for loaders, stores,
  caches, provider adapters, scenario engines, and report services.
- Use classes for meaningful stateful domain boundaries such as
  `MobilityDataStore`, `ScenarioEngine`, and `LiveSnapshotService`.
- Keep deterministic calculations as pure functions when a class would add no
  useful state or boundary.
- Reuse shared DTOs, Valibot schemas, error types, and response helpers instead
  of defining endpoint-specific duplicates.
- Baseline mobility data is immutable. Scenario changes are append-only
  operations projected through a reusable scenario engine.

### Endpoint quality

Every mobility endpoint must have tests for:

- valid requests and response shape;
- invalid query or body input;
- missing or unknown identifiers;
- unavailable and partial data;
- approval-gated score modes;
- stable error responses;
- authorization behavior where applicable;
- deterministic repeated requests.

The minimum static API surface is:

- `GET /api/v1/health`;
- `GET /api/v1/national/summary`;
- `GET /api/v1/islands`;
- `GET /api/v1/islands/:id`;
- `GET /api/v1/islands/:id/profile`;
- `GET /api/v1/map/features`.

Scenario, live, recommendation, and report endpoints must reuse the same facade,
DTO, validation, error, and provenance conventions.

## 6.9 shadcn-Svelte Customization Policy

- Use shadcn-svelte primitives for every applicable interactive control.
- Do not edit imported shadcn primitive internals for feature-specific styling.
- Do not fork a primitive when a consuming wrapper or root feature component is
  sufficient.
- Customize the root mobility component that consumes the primitive so styling
  remains consistent across the UI.
- Keep feature-specific classes, layout, responsive behavior, and theme
  overrides on root components such as `NationalScoreCard`, `IslandDrawer`,
  `ResourceDrawer`, `MapControls`, and `WorstIslandCard`.
- MapLibre rendering may remain custom, but surrounding controls, drawers,
  dialogs, alerts, badges, tooltips, and actions must use shadcn-svelte.
- Preserve the light neutral black-and-white theme through shared tokens and
  consuming root components rather than modifying imported primitives.
- Use `@lucide/svelte` for icons and provide accessible labels for icon-only
  controls.

## 6.10 Naming

All files use `kebab-case`.

Svelte reactive files:

`*.svelte.ts`

Remote functions:

`*.remote.ts`

**Resource CRUD naming:**

| Operation | Pattern | Example |
|---|---|---|
| Create | `create<Resource>` | `createUser` |
| Read one | `get<Resource>` | `getUser` |
| Read many | `get<Resource>s` | `getUsers` |
| Update | `update<Resource>` | `updateUser` |
| Delete | `delete<Resource>` | `deleteUser` |
| Boolean check | `has<Condition>` | `hasCredentialAccount` |

**Relationships:**

- `add<Resource>`
- `remove<Resource>`
- `set<Resource>s`

Use clear domain-specific action names for operations outside CRUD.

---

# 7. Implementation Quality Rules

- Do not reinvent existing functionality.
- Inspect local components and utilities before adding dependencies.
- Prefer established project patterns.
- Avoid unnecessary abstractions and boilerplate.
- Do not introduce unrelated refactors.
- Avoid unrequested architectural migrations.
- Preserve working functionality.
- Keep implementation aligned with the plan.
- Update existing documentation only when behavior, architecture, commands, or conventions materially change.
- Do not create new documentation files unless explicitly requested.

When requirements are ambiguous:

1. Check the implementation plan.
2. Check the architecture document.
3. Inspect existing application patterns.
4. Consult relevant framework documentation.
5. Make a reasonable, consistent decision.
6. Record any consequential assumption.

Do not silently remove features because implementation is difficult.

---

# 8. Continuous Quality Gates

Run relevant checks throughout development.

Do not postpone all verification until the final phase.

## Gate A — Static Quality

Verify:

- TypeScript correctness.
- Svelte compiler and accessibility diagnostics.
- ESLint.
- Formatting.
- Import resolution.
- Dependency compatibility.
- Dead or broken references.

Use documented repository commands.

Run `pnpm fix` where appropriate and supported, then recheck for remaining issues. Do not assume automatic fixes resolve everything.

## Gate B — Build Quality

Verify:

- The production build succeeds.
- Required routes compile.
- Remote functions compile.
- Server-only code is not leaked to the client.
- Required environment variables are validated.
- No unexpected build warnings remain unresolved.

## Gate C — Feature Quality

Verify every feature's:

- Primary success path.
- Invalid inputs.
- Boundary conditions.
- Permission restrictions.
- Error handling.
- Loading and empty states.
- Data persistence.
- Expected navigation.
- Integration with related features.

## Gate D — Regression Quality

After corrections:

- Rerun targeted tests.
- Rerun affected integration tests.
- Check related workflows.
- Run the complete relevant suite before final completion.

A local fix must not break previously working functionality.

---

# 9. Full Implementation Coverage Audit

After all planned tasks appear complete, perform an independent full-plan audit.

This audit is mandatory even when all implementation sub-agents report success.

## Audit Procedure

1. Read the complete implementation plan again.
2. Enumerate every requirement and acceptance criterion.
3. Locate the corresponding implementation.
4. Confirm the functionality actually behaves as required.
5. Locate or perform appropriate verification.
6. Record evidence for each requirement.
7. Identify anything missing, partial, broken, or unverified.

Do not rely solely on checklist status.

## Coverage Matrix

Maintain a requirement matrix conceptually equivalent to:

| Requirement | Implementation | Review | Test | Result |
|---|---|---|---|---|
| AUTH-01 | Route and remote function | Passed | E2E passed | Complete |
| AUTH-02 | Server validation | Passed | Integration passed | Complete |
| DASH-01 | Dashboard page | Passed | E2E passed | Complete |
| BILL-01 | Payment service | Pending | Not run | Incomplete |

Every applicable requirement must achieve a passing result.

A requirement with missing verification is not complete.

## Audit Failure Behavior

If the audit discovers gaps:

1. Create corrective tasks.
2. Prioritize by dependency and severity.
3. Implement the corrections.
4. Review the corrections independently.
5. Verify the affected requirements.
6. Repeat the coverage audit.

**Do not proceed to final acceptance while known implementation gaps remain.**

---

# 10. Mandatory End-to-End Application Testing

Once implementation coverage passes, begin complete application testing.

This stage must test the running application, not just its source code.

## 10.1 Environment Setup

- Use a dedicated test environment.
- Prepare a test database.
- Apply required migrations.
- Seed representative test data.
- Configure safe test credentials and integrations.
- Start the application.
- Verify the application is reachable.
- Confirm relevant external dependencies are available.

Never run destructive tests against production data.

For unavailable external integrations, use documented test or sandbox modes where appropriate. Mock tests alone must not be reported as proof that a live integration works.

## 10.2 Browser-Based Testing

Use Playwright or equivalent browser automation.

Test actual user journeys through the browser, including:

- Navigation.
- Authentication.
- Registration, if included.
- Protected pages.
- Form submissions.
- Validation messages.
- CRUD interactions.
- Search, filters, pagination, and sorting where applicable.
- Modal and dialog interactions.
- File uploads where applicable.
- Role-based UI visibility and server-side permissions.
- Multi-step workflows.
- Error and retry behavior.
- Session expiration.
- Responsive layouts.
- Accessibility-critical interactions.

Derive the specific scenarios from the implementation plan.

## 10.3 Role-Based Testing

For each user role in the plan:

1. Create or provision a representative test account.
2. Authenticate as that role.
3. Navigate through its available features.
4. Complete its primary workflows.
5. Verify resource access restrictions.
6. Verify unauthorized actions are rejected.
7. Confirm persistent changes are correct.

Test both allowed and denied operations.

## 10.4 Database & Server Verification

Verify:

- Data is actually persisted.
- Relationships remain valid.
- Transactions behave correctly.
- Validation rejects invalid requests.
- Authorization cannot be bypassed.
- Errors are handled appropriately.
- Client actions produce the expected server-side effects.

A successful UI notification is not proof that a database operation succeeded.

## 10.5 Negative & Edge-Case Testing

Test applicable cases such as:

- Missing required inputs.
- Invalid identifiers.
- Duplicate submissions.
- Expired sessions.
- Unauthorized users.
- Empty datasets.
- Network failures.
- Failed external requests.
- Concurrent updates.
- Large inputs.
- Unexpected server errors.

Test plan-specific security and business-rule edge cases.

## 10.6 Visual & Responsive Verification

At minimum, verify representative:

- Mobile viewport.
- Tablet viewport.
- Desktop viewport.

Check for:

- Overflows.
- Broken layouts.
- Unreadable content.
- Hidden or inaccessible actions.
- Incorrect theme behavior.
- Broken dialogs.
- Inconsistent spacing.
- Missing loading or empty states.

Capture screenshots or equivalent evidence where supported.

## 10.7 Browser Diagnostics

Inspect:

- Browser console errors.
- Failed network requests.
- Server logs.
- Hydration problems.
- Unhandled promises.
- Runtime exceptions.

Every reproducible application defect must become a tracked corrective task.

---

# 11. Autonomous E2E Repair Loop

If any E2E test fails, the agent must automatically enter the repair loop.

**Repair cycle:**

1. Capture the failure and relevant logs.
2. Reproduce the issue.
3. Identify the root cause.
4. Determine the affected requirements.
5. Implement the correction.
6. Run static checks.
7. Run targeted tests.
8. Re-run the failed E2E scenario.
9. Run related regression scenarios.
10. Update the coverage matrix.
11. Continue with remaining tests.

Repeat until the complete required suite passes.

## Important Rules

- Never delete a failing test simply to pass the suite.
- Never replace real assertions with trivial assertions.
- Never skip a failing feature.
- Never suppress errors without fixing their cause.
- Never mark a requirement passing based only on mocked behavior when actual integration verification is required.
- Never stop after fixing only the first failure.
- Never claim a test passed if it was not executed.

If repeated fixes fail, revise the diagnosis and investigate deeper rather than repeating the same attempt indefinitely.

If an external blocker cannot be resolved autonomously, record it with exact reproduction steps and continue other tests. Final success remains unavailable until its required verification passes.

---

# 12. Final Completion Gates

The agent may declare the application **COMPLETE** only when every condition below is satisfied.

## Implementation

- [ ] All applicable implementation-plan requirements are implemented.
- [ ] No required feature is missing.
- [ ] No required feature remains partially implemented.
- [ ] All documented acceptance criteria are satisfied.
- [ ] No unauthorized shortcuts or placeholders remain.

## Code Quality

- [ ] TypeScript and Svelte checks pass.
- [ ] Lint and formatting checks pass.
- [ ] Production build passes.
- [ ] Relevant automated tests pass.
- [ ] No unresolved critical code-review findings remain.

## Security & Data

- [ ] Authentication works as specified.
- [ ] Authorization is enforced server-side.
- [ ] Relevant input validation works.
- [ ] Database operations behave correctly.
- [ ] Required integrations are verified appropriately.
- [ ] No known unresolved critical security defects remain.

## End-to-End Testing

- [ ] Application runs successfully.
- [ ] All required primary user journeys pass.
- [ ] Applicable user roles are tested.
- [ ] Required negative scenarios are tested.
- [ ] Relevant mobile and desktop experiences are verified.
- [ ] Browser diagnostics show no unresolved application errors.
- [ ] Full regression testing passes.

## Independent Review

- [ ] Final plan-to-code audit passes.
- [ ] Final independent code review passes.
- [ ] Final test evidence is collected.
- [ ] Every applicable requirement has passing verification evidence.
- [ ] No known required tests remain unexecuted.

**All completion gates must pass.**

A feature is not complete merely because it compiles.

An application is not complete merely because its tests pass if required features are missing.

An application is not complete merely because every page renders.

---

# 13. Final Reporting

Only after the completion gates pass, provide a concise report containing:

1. **Implementation Summary** — Features delivered.
2. **Plan Coverage** — Requirements implemented and verified.
3. **Quality Checks** — Commands executed and actual results.
4. **E2E Results** — User journeys and scenarios tested.
5. **Defects Resolved** — Significant issues found and corrected.
6. **Remaining Limitations** — Any explicitly non-blocking limitations or out-of-scope concerns.
7. **Final Status** — Complete only when supported by evidence.

Include meaningful evidence such as:

- Test results.
- Build output.
- E2E execution results.
- Screenshots or traces when available.
- Requirement-to-test references.

Do not fabricate test execution results, coverage percentages, screenshots, or review outcomes.

## Incomplete or Blocked Status

If a hard blocker prevents full completion, report:

- What is complete.
- What remains unfinished.
- Why it is blocked.
- What was attempted.
- The exact action needed to unblock it.
- How to resume.

Use **BLOCKED** or **INCOMPLETE**, never **COMPLETE**, in this situation.

---

# 14. Non-Negotiable Rules

1. **The implementation plan is the acceptance contract.**
2. **The agent owns the entire implementation lifecycle.**
3. **No intermediate approval is needed for ordinary authorized development.**
4. **All applicable plan requirements must be implemented.**
5. **Every implementation batch must be reviewed and verified.**
6. **Use independent sub-agents when available.**
7. **Failed reviews automatically create corrective work.**
8. **Final plan coverage must be independently audited.**
9. **Real end-to-end testing is mandatory.**
10. **Failed tests must be corrected and rerun.**
11. **No premature completion declarations.**
12. **No fake tests, false results, or hidden failures.**
13. **No destructive production operations without authorization.**
14. **Persist progress so interrupted work can resume.**
15. **Continue autonomous execution until all gates pass or a genuine external blocker prevents further progress.**

**The agent's responsibility ends at verified application completion, not at implementation completion.**

**Do not create new documentation files unless explicitly requested, except for an explicitly authorized operational checkpoint required to preserve execution state.**

## Implementation Acceptance Policy

Every requirement in this document is mandatory unless explicitly marked optional.

The implementation is considered complete only when:

- 100% of applicable functional requirements are implemented.
- 100% of applicable acceptance criteria are verified.
- All required automated checks and E2E scenarios pass.
- All critical and high-severity defects are resolved.
- Final independent review confirms alignment with this plan.

The agent must maintain requirement traceability and automatically iterate over missing functionality, review findings, and test failures.

No requirement may be silently omitted, downgraded, or replaced with a placeholder.

The agent must not declare completion without execution evidence for all required verification activities.
