---
name: related-file-planning
description: Reads the files related to a coding, debugging, architecture, refactor, or implementation request before planning. Use when the user asks to build, fix, validate, explain, review, or modify code in a repository, especially when the answer depends on existing project structure, APIs, tests, services, routes, UI components, or configuration.
---

# Related File Planning Skill

## Purpose

Before answering, planning, or editing code, the assistant must understand the relevant files in the repository. The assistant must not guess from the prompt alone.

This skill forces a disciplined workflow:

1. Understand the user request.
2. Discover the related files.
3. Read the most important files.
4. Build a dependency/context map.
5. Identify gaps, risks, and existing logic.
6. Produce an evidence-based plan.
7. Only then implement or give instructions.

## Core Rule

Never create a plan for a codebase task until you have inspected the files that define:

* the entry point
* the related UI/API/service/component
* the data model or schema
* the tests
* the configuration
* the existing helper utilities
* the current error or behavior path

If files cannot be read, say exactly what is missing and continue with the best partial plan.

## When To Use This Skill

Use this skill when the user asks for:

* implementing a feature
* fixing a bug
* validating a workflow
* explaining how a system works
* planning frontend/backend changes
* reviewing architecture
* generating prompts for coding agents
* modifying an existing app
* adding tests
* refactoring
* integrating AI/Ollama/MCP/API tools
* AutoQuant, Strategy Lab, Freqtrade, backtesting, or trading-system work

## Required Workflow

### Step 1 — Restate the Task

Start by rewriting the user request into a precise engineering objective.

Include:

* what the user wants
* what part of the app is likely affected
* what success looks like
* what should not be changed

### Step 2 — Discover Candidate Files

Search the repository before reading.

Use fast search commands when available:

```bash
find . -maxdepth 4 -type f | sed 's#^\./##' | sort
rg -n "keyword|route|component|service|class|function|endpoint|test" .
rg -n "AutoQuant|Strategy|Backtest|Ollama|AI Assistant|agent|pipeline|export|websocket|hyperopt|freqtrade" .
```

Prefer targeted searches from the user's words.

For frontend tasks, search for:

* page files
* route files
* components
* stores
* hooks
* API clients
* types
* tests
* styles

For backend tasks, search for:

* routers/controllers
* services
* repositories
* models/schemas
* workers/orchestrators
* config
* tests
* migrations
* logs/errors

For full workflow tasks, search both frontend and backend.

### Step 3 — Classify Files

Group discovered files into this map:

```text
ENTRYPOINTS:
- file path: why it matters

CORE LOGIC:
- file path: why it matters

DATA / TYPES / SCHEMAS:
- file path: why it matters

UI / PRESENTATION:
- file path: why it matters

API / INTEGRATION:
- file path: why it matters

TESTS:
- file path: why it matters

CONFIG / ENV:
- file path: why it matters

UNKNOWN / NEEDS CONFIRMATION:
- file path or missing file: why it may matter
```

### Step 4 — Read Files In Priority Order

Read only the files that matter first.

Priority:

1. User-mentioned files
2. Entrypoints
3. Files that call or import the entrypoint
4. Files imported by the entrypoint
5. Tests covering the behavior
6. Configuration
7. Related old implementations

Do not read the whole repository unless needed.

### Step 5 — Build an Evidence Summary

Before planning, produce:

```text
What I found:
- Existing behavior:
- Existing architecture:
- Important functions/classes:
- Data flow:
- Tests currently available:
- Gaps or risks:
```

Every claim about the codebase must be tied to a file path, function name, class name, route, or test.

### Step 6 — Decide the Change Type

Classify the task as one of:

* Explanation only
* Bug fix
* Feature addition
* Refactor
* Test addition
* UI polish
* API integration
* End-to-end workflow validation
* Prompt/agent instruction design

Then choose the safest action mode.

### Step 7 — Planning Contract

The plan must include:

```text
Goal:
Files to change:
Files to read but not change:
Step-by-step implementation:
Tests to run:
Rollback plan:
Risks:
Acceptance criteria:
```

No vague plans. Every step must point to files or commands.

### Step 8 — Implementation Rules

When editing code:

* Make the smallest safe change.
* Reuse existing services, components, types, and helpers.
* Do not duplicate logic.
* Do not rename public functions/classes unless required.
* Do not rewrite large files unnecessarily.
* Preserve existing behavior unless the user asked to change it.
* Add tests when behavior changes.
* Update types/interfaces when API shape changes.
* Keep frontend and backend contracts aligned.
* Add logging only where useful.
* Never hardcode secrets or credentials.
* Never delete user work without explicit permission.

### Step 9 — Validation Rules

After changes, run the most relevant checks.

Examples:

```bash
pytest
pytest path/to/test_file.py
npm test
npm run lint
npm run typecheck
npm run build
python -m compileall .
```

If full tests are too expensive, run targeted tests first and state what remains unverified.

### Step 10 — Final Response Format

Final answer must include:

```text
Summary:
- What was done or planned

Files inspected:
- path: purpose

Plan or changes:
- step-by-step

Validation:
- tests/checks run
- pass/fail
- known remaining gaps

Next best action:
- one concrete next step
```

## Special Rule For AutoQuant / Strategy Lab

For AutoQuant, always inspect or search for files related to:

* auto-quant start endpoint
* pipeline/orchestrator
* strategy generation or mutation
* pair selection
* timeframe discovery
* backtest runner
* hyperopt runner
* OOS validation
* WFO/robustness validation
* scoring/confidence calculation
* export `.py` and `.json`
* WebSocket progress
* frontend run page
* frontend dashboard/components
* tests for pipeline, API, data quality, and scoring

Never assume the pipeline works from UI text alone. Validate backend logic and frontend display separately.

## Special Rule For AI Planning Prompts

When the user asks for a prompt for another AI coding assistant, generate a prompt that forces that assistant to:

1. read related files first
2. list files inspected
3. explain current behavior
4. identify gaps
5. produce a file-by-file plan
6. wait before destructive changes
7. run tests
8. report exact results

## Anti-Patterns

Do not:

* plan from memory only
* invent file names
* assume architecture
* skip tests silently
* say "looks good" without reading code
* modify frontend without checking backend contract
* modify backend without checking frontend usage
* create a new service when an existing one can be reused
* create broad context rules unrelated to the task
* over-read unrelated files
* hide uncertainty

## Best Activation Prompt

Use this prompt when starting a coding task:

"Use the related-file-planning skill. Before planning or coding, inspect the repository and read the files related to this request. Show me the file map, current behavior, gaps, and a file-by-file implementation plan. Do not guess from the prompt alone."
