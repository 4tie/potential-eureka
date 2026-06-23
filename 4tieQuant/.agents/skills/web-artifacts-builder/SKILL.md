---
name: web-artifacts-builder
description: Build elaborate, multi-component claude.ai HTML artifacts using React 18, TypeScript, Vite, Tailwind CSS 3, and shadcn/ui. Use when the user asks to create a complex web artifact, frontend demo, UI prototype, or interactive HTML component — not for single-file HTML/JSX artifacts. Triggers on phrases like "build an artifact", "create a widget", "make a dashboard", "UI prototype", "frontend demo".
---

# Web Artifacts Builder

## When to Use

- User asks to build a complex HTML/React artifact for claude.ai
- User wants a multi-component UI, dashboard, or interactive frontend demo
- Phrases like "create an artifact", "build a widget", "make a frontend", "UI prototype", "dashboard"
- Do NOT use for simple single-file HTML or JSX — those don't need the full stack

## Stack

**React 18 + TypeScript + Vite + Parcel (bundling) + Tailwind CSS 3 + shadcn/ui**

## Instructions

### Step 1: Initialize Project

```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

This creates a fully configured project with React, TypeScript, Tailwind, shadcn/ui (40+ pre-installed components), path aliases, and Parcel bundling config.

### Step 2: Develop the Artifact

Edit the generated files under `src/`. Use shadcn/ui components by importing from `@/components/ui/<component-name>`.

### Step 3: Bundle to Single HTML

```bash
bash scripts/bundle-artifact.sh
```

Output: `bundle.html` — a self-contained artifact with all JS, CSS, and dependencies inlined.

### Step 4: Present to User

Share the bundled HTML file in conversation so the user can view it as an artifact.

### Step 5: Test (Optional)

Only test if requested or if issues arise. Use Playwright/Puppeteer or open in browser.

## Design & Style Guidelines

- Avoid centered layouts, purple gradients, uniform rounded corners, and Inter font (common "AI slop" patterns)
- Follow shadcn/ui theming conventions (CSS variables in `:root` and `.dark`)
- Use Tailwind utility classes — don't write custom CSS unless necessary

## Key File Paths

| File | Purpose |
|------|---------|
| `scripts/init-artifact.sh` | Bootstrap a new project |
| `scripts/bundle-artifact.sh` | Bundle project into single HTML |
| `references/shadcn-components.md` | Full list of available shadcn/ui components |

## shadcn/ui Components

See `references/shadcn-components.md` for the complete list. Import like:
```jsx
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
```

## Notes

- Requires Node.js 18+ and pnpm
- `init-artifact.sh` expects `shadcn-components.tar.gz` in the same directory
- The bundled artifact is self-contained and can be shared directly in Claude conversations
