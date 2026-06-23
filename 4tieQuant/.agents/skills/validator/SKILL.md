---
name: validator
description: Use when a task file (task_*.md, tasks/task-*.md, docs/tasks/*.md) is added or updated. Validates whether code changes satisfy the task requirements and appends a structured validation report to the task file.
---

# Skill: Task Validation Reviewer

## Purpose

Use this skill whenever a new task file is added or an existing task file is updated, such as:

* `task_1.md`
* `task_2.md`
* `task_3.md`
* `tasks/task-*.md`
* `docs/tasks/*.md`

The goal is to validate whether the latest code changes actually satisfy the task requirements, then append a clear validation report to the end of the task file.

This skill must not only summarize the work. It must verify the work by inspecting files, checking diffs, running relevant tests, and identifying missing or incomplete implementation.

---

## Core Rule

Never mark a task as complete only because files were changed.

A task is complete only if:

1. The task requirement is implemented.
2. The implementation is connected to the correct feature/module.
3. The change is covered by tests, or a clear reason is given if tests are not possible.
4. The relevant tests pass.
5. No obvious regression, missing import, broken endpoint, broken UI hook, or disconnected code path is found.

---

## Inputs

When this skill runs, identify:

* The newest task file, unless the user explicitly names a task file.
* The latest changed files.
* The task requirements.
* The implementation files connected to the task.
* The relevant tests.
* The commands needed to validate the task.

Use these commands when available:

```bash
git status --short
git diff --stat
git diff --name-only
git diff
```

If the work is already committed, compare against the previous commit:

```bash
git diff HEAD~1..HEAD --stat
git diff HEAD~1..HEAD --name-only
git diff HEAD~1..HEAD
```

---

## Step-by-Step Procedure

### Step 1: Locate the Task File

Find the task file to validate.

Priority:

1. User-provided task file path.
2. Newest modified task file under `tasks/`, `docs/tasks/`, or project root.
3. Any file matching `task*.md`, `TASK*.md`, or `Task*.md`.

If multiple task files are found, choose the newest one and mention the others as possible alternatives.

---

### Step 2: Read the Task Carefully

Extract the task into a checklist.

For each requirement, classify it as:

* `Required`
* `Optional`
* `Ambiguous`
* `Out of scope`

Create an internal checklist like this:

```md
- [ ] Requirement 1: ...
- [ ] Requirement 2: ...
- [ ] Requirement 3: ...
```

Do not rely on the task title only. Read the full task body.

---

### Step 3: Inspect Latest Changes

Use Git to identify what changed.

Check:

* Changed backend files
* Changed frontend files
* Changed tests
* Changed prompts
* Changed schemas/types
* Changed routes/endpoints
* Changed service files
* Changed config files

For each changed file, decide whether it is connected to the task.

Classify changed files as:

```md
Connected to task:
- file/path.py — reason

Possibly connected:
- file/path.tsx — reason

Unrelated:
- file/path.md — reason
```

---

### Step 4: Map Requirements to Code

For every task requirement, find the exact code that satisfies it.

Use this format internally:

```md
Requirement:
- The task says: "..."

Evidence:
- Implemented in: `path/to/file.py`
- Function/class/component: `name_here`
- How it satisfies the task: ...

Status:
- PASS / FAIL / PARTIAL / NOT FOUND
```

If no code exists for a requirement, mark it as `FAIL` or `NOT FOUND`.

If code exists but is not wired into the app, mark it as `PARTIAL`.

Examples of disconnected work:

* A helper function exists but no route calls it.
* A UI component exists but is not imported anywhere.
* A backend service exists but no test or API path uses it.
* A prompt file exists but no code loads it.
* A config option exists but is ignored.
* A test exists but only tests mocks, not the actual integration path.

---

### Step 5: Run Relevant Tests

Run the smallest useful tests first.

Examples:

```bash
pytest path/to/test_file.py -xvs
pytest tests/ -x
```

If the project has frontend changes, run relevant frontend checks when available:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

If the project has backend Python changes, prefer:

```bash
python -m pytest
```

If the task says a specific command should pass, run that exact command.

Record:

* Command run
* Pass/fail
* Error output summary
* Whether the test actually validates the task

Do not hide failing tests. If a test fails, explain the failure clearly.

---

### Step 6: Check for Gaps

Look for common gaps:

* Requirement not implemented
* Requirement implemented but not connected
* No test added
* Test added but only mocks too much
* Wrong file modified
* Old logic still active
* Naming mismatch
* API route missing
* UI not calling backend
* Backend response shape does not match frontend expectation
* WebSocket/event names mismatch
* Hardcoded values
* Missing error handling
* Missing rollback/resume behavior
* Missing export/download/copy path
* Missing validation for edge cases
* Existing tests not updated
* Documentation says done but code does not match

---

### Step 7: Append Validation Report to Task File

At the end of the task file, append a long separator line, then write the validation report.

Use this exact separator:

```md
================================================================================
```

Then append this format:

```md
================================================================================

## Validation Review — YYYY-MM-DD HH:mm

### Overall Status

Status: PASS / PARTIAL / FAIL

Short summary:
- ...

### Task Requirements Checked

| Requirement | Status | Evidence | Notes |
|---|---|---|---|
| Requirement 1 | PASS/PARTIAL/FAIL | `file/path` | ... |
| Requirement 2 | PASS/PARTIAL/FAIL | `file/path` | ... |

### Files Reviewed

Connected to task:
- `file/path` — why it matters

Possibly connected:
- `file/path` — why it might matter

Unrelated changed files:
- `file/path` — why unrelated

### Tests / Commands Run

| Command | Result | Notes |
|---|---|---|
| `command here` | PASS/FAIL/NOT RUN | ... |

### What Is Working

- ...

### What Did Not Work

- ...

### Errors Found

- ...

### Gaps / Missing Work

- ...

### Risk Notes

- ...

### Recommended Next Steps

1. ...
2. ...
3. ...

### Final Decision

Decision: ACCEPT / ACCEPT WITH FOLLOW-UP / REJECT

Reason:
- ...
```

---

## Status Rules

Use `PASS` only when all required task items are implemented, connected, and validated.

Use `PARTIAL` when:

* Some requirements are done but others are missing.
* Code exists but is not fully connected.
* Tests pass but do not cover the important behavior.
* The implementation works only through mocks or temporary paths.

Use `FAIL` when:

* The task is mostly not implemented.
* Tests fail.
* The change breaks existing behavior.
* The implementation is disconnected from the real app flow.

---

## Important Validation Standards

### Mocked Tests

Mocked tests are allowed, but they do not prove full integration.

If tests are mocked, write:

```md
The mocked tests validate helper behavior only. They do not prove the full app integration path.
```

### Temporary Paths

Temporary paths are allowed only when the task is backend-only or isolated.

If temporary paths are used, write:

```md
Temporary paths were used to avoid touching real user/project files. This validates safe behavior but does not fully prove production file integration.
```

### Backend-Only Tasks

For backend-only tasks, do not require frontend changes unless the task explicitly asks for UI.

### Frontend Tasks

For frontend tasks, verify:

* Component exists.
* Component is imported.
* Component is rendered.
* It calls the correct API/store/service.
* Loading/error/success states exist.
* Types match backend response.

### API Tasks

For API tasks, verify:

* Route exists.
* Request schema exists.
* Response schema exists.
* Service is called.
* Errors are handled.
* Tests cover success and failure cases.

### Prompt/AI Tasks

For prompt-related tasks, verify:

* Prompt file exists.
* Prompt is loaded by code.
* Variables are injected correctly.
* Output is parsed/validated.
* Failure handling exists.
* Tests cover mocked AI output.

---

## Final Response to User

After appending the report, respond with a short summary:

```md
Validation completed.

Status: PASS / PARTIAL / FAIL

Reviewed task:
- `task_file_path`

Main result:
- ...

Tests run:
- `command` — PASS/FAIL

Important gaps:
- ...

The validation report was appended to the end of the task file.
```

If the file could not be updated, say so clearly and show the report in the response instead.
