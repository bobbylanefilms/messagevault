# MessageVault — Holdout Test Scenarios

## What These Are

This directory contains behavioral test scenarios for MessageVault, organized by implementation stage. They describe what the application should do from the user's perspective — not how the code should be structured internally.

These scenarios are **holdout tests**: the coding agent that builds MessageVault never sees them. After implementation, a separate evaluation agent uses these scenarios to determine whether the software actually works as designed. Discrepancies between the coding agent's self-assessment (in `BATCH-REPORT.md`) and the scenario evaluation results are the most valuable signal for identifying gaps.

## How to Evaluate

### Setup

1. Ensure the MessageVault application is running and accessible in a browser (typically `http://localhost:3000`).
2. Ensure you have browser automation available (Playwright or Chrome MCP).
3. Ensure test data has been imported — at minimum, one Apple Messages markdown export file with 1,000+ messages. Ideally, import multiple files to test cross-conversation features.
4. Have a valid user account created via Clerk authentication.

### Evaluation Process

For each scenario file (one per stage), work through every scenario sequentially:

1. **Read the prerequisites** at the top of the file. Ensure the required application state exists before beginning.
2. **Follow the verification steps** exactly as written. Take screenshots at each step where visual confirmation is needed.
3. **Record pass/fail/partial-pass** for each scenario using the criteria below.
4. **Note any observations** — unexpected behaviors, visual glitches, slow performance — even if the scenario technically passes.

### Evaluation Order

Evaluate stages in order (1 through 7). Each stage builds on prior stages, so earlier-stage failures may cascade into later-stage failures. Note cascading failures rather than re-evaluating the root cause.

## Pass/Fail Criteria

### PASS

All "Then" conditions in the scenario are met. The feature works as described in the verification steps. No functional issues observed.

### PARTIAL PASS

Most "Then" conditions are met, but one or more have minor deviations:
- A feature works but with a cosmetic issue (misaligned element, wrong color shade)
- The behavior is correct but noticeably slow (>3 seconds for an interaction that should be instant)
- The feature works in the happy path but has a rough edge in the specific test case

### FAIL

One or more core "Then" conditions are not met:
- The feature does not work as described
- An error is displayed or the page crashes
- The expected UI element does not exist or is not interactive
- Data is lost, corrupted, or not persisted

## Producing SCENARIO-REPORT.md

After evaluating all scenarios, produce `SCENARIO-REPORT.md` in the project root (`/Users/robert.sawyer/Markdown/Claude/app-dev/messagevault/SCENARIO-REPORT.md`) with this structure:

```markdown
# Scenario Evaluation Report
**Date:** [Date]
**Evaluator:** [Agent identifier]
**Application URL:** [URL tested against]
**Features Evaluated:** [Stage range, e.g., Stages 1-7]
**Pass Rate:** [X/Y scenarios passing]

## Summary

[2-3 sentence overview of the evaluation results. Call out any systemic issues.]

## Results by Stage

### Stage 1: Foundation & Auth
**Pass Rate:** [X/Y]

#### Scenario 1: [Title]
**Result:** PASS | PARTIAL PASS | FAIL
**Evidence:** [What was observed — describe screenshots, behaviors, values]
**Notes:** [Any additional context]

#### Scenario 2: [Title]
...

### Stage 2: Import Pipeline
...

## Cross-Cutting Observations

[Patterns noticed across stages — recurring UI issues, performance concerns, architectural problems]

## Highest-Priority Issues

[Top 3-5 issues that should be addressed first, ranked by impact]
```

## File Inventory

| File | Stage | Scenarios | Features Covered |
|---|---|---|---|
| `stage-1-foundation.md` | 1: Foundation & Auth | 8 | A1-A5: Setup, schema, auth, layout, utilities |
| `stage-2-import.md` | 2: Import Pipeline | 14 | B1-B5: Upload, identity, parser, pipeline, embeddings |
| `stage-3-browse.md` | 3: Browse & Conversations | 12 | C1-C4: Conversation list, thread view, reactions, navigation |
| `stage-4-calendar.md` | 4: Calendar Visualization | 10 | D1-D3: Heatmap, filters, day detail |
| `stage-5-search.md` | 5: Search | 12 | E1-E4: Keyword, semantic, hybrid, search UI |
| `stage-6-ai-chat.md` | 6: AI Chat | 15 | F1-F5: Sessions, RAG, streaming, chat UI, sources |
| `stage-7-dashboard-settings.md` | 7: Dashboard & Settings | 10 | G1-G4: Dashboard, preferences, participants, data management |

## Important Notes for Evaluators

- **Do not read the application source code.** Evaluate purely from the user's perspective via the browser.
- **Do not assume implementation details.** If a scenario says "messages are grouped by conversation," verify visually — don't check the database.
- **Screenshots are evidence.** Capture screenshots at key verification steps. Describe what each screenshot shows in your report.
- **Performance matters.** If something works but takes 10 seconds when it should take 1, that is a PARTIAL PASS at best.
- **Note but don't fix.** If you discover an issue, document it. Do not attempt to fix the code.
- **Test with real data.** These scenarios assume real Apple Messages exports have been imported. Synthetic or trivial test data may not exercise the edge cases properly.
