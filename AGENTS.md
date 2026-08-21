# AGENTS.md

Welcome to **Chorale** (`hxy9243/chorale`). This document outlines engineering conventions, workflows, and invariants for autonomous coding agents.

---

## 1. Project Overview & Vision

> **MVP Promise:**  
> Chorale lets a musician create or import a short score, ask grounded questions about it, request a musical change, hear the proposed result, and safely preserve the work.

### Roadmap Stages (from [Issue #18](https://github.com/hxy9243/chorale/issues/18))
- **Stage 1: Durable Foundation** — Multi-file session model, document store, autosave, revision history, and editing history ([#13](https://github.com/hxy9243/chorale/issues/13)).
- **Stage 2: Trustworthy Understanding** — Deterministic score parsing, normalized musical representation, read-only score tools, passage citations, and evaluation baselines ([#14](https://github.com/hxy9243/chorale/issues/14)).
- **Stage 3: Safe Creation & Editing** — Proposal-based agent composition, preview playback, atomic Apply All, revisions, and undo/redo ([#15](https://github.com/hxy9243/chorale/issues/15)).
- **Stage 4: Release Readiness & Polish** — First-run guidance, accessibility, responsive desktop layouts, and comprehensive test suite ([#16](https://github.com/hxy9243/chorale/issues/16), [#17](https://github.com/hxy9243/chorale/issues/17)).

### Explicit Non-Goals (Out of Scope for MVP)
- Cloud accounts, synchronization, and multi-user collaboration.
- Mobile-first score editing (Chorale is desktop-first Electron + Web).
- Full DAW or complex engraving suite functionality.
- Unconstrained orchestral generation.

---

## 2. Agent Workflows & Engineering Conventions

### 2.1 Spec-First Engineering (Source of Truth)
- **Rule:** Specifications in `spec/` are the authoritative source of truth for all design, feature behavior, and system architecture.
- For any new major feature or architectural change, **add or update the relevant specification in `spec/` as the first step** before implementing code changes.
- Maintain spec integrity: ensure YAML frontmatter (`source_files`, `test_files`, `related_specs`) and content are kept synchronized when code changes are made.

### 2.2 Git Worktrees
- **Standard Location:** Always create worktrees under `.agents/worktrees/<branch-name-or-slug>`.
  ```bash
  # Creating a worktree
  git worktree add .agents/worktrees/<feature-name> -b <feature-branch>

  # Removing a worktree when finished
  git worktree remove .agents/worktrees/<feature-name>
  ```
- **Rule:** Never create worktrees in the repository root (e.g. `worktrees/`). `.agents/` is gitignored.

### 2.3 Quality Gates & Verification
Before completing any task, execute the full verification suite:
```bash
# 1. Run unit and integration tests
npm test

# 2. Check TypeScript types across all workspace configs
npx tsc -b

# 3. Run linter
npm run lint
```

### 2.4 Commit Message Guidelines
Follow Conventional Commits:
- `feat(scope): ...` for new features
- `fix(scope): ...` for bug fixes
- `docs(spec): ...` for specification and documentation changes
- `perf(scope): ...` for performance optimizations
- `test(scope): ...` for test additions and updates
- `refactor(scope): ...` for structural code improvements
- `chore(scope): ...` for tooling and maintenance updates

---

## 3. Core Invariants & Safety Guardrails

### 3.1 Security Invariant
- **Rule:** AI provider credentials (API keys, ChatGPT OAuth access tokens, refresh tokens, and custom secret headers) must **never** be written to renderer `localStorage`, `sessionStorage`, cookies, or diagnostic logs.
- Credentials are encrypted and managed exclusively in the Electron main process using `safeStorage` (`app.getPath('userData')/chorale-data/ai-connections.v1.json`).

### 3.2 Architecture & Process Boundaries
- **Pure Libraries (`src/music/`, `src/utils/`):** Pure TypeScript modules must have zero React or Electron dependencies.
- **AI Agent Isolation:** Electron AI runtime score tools receive immutable prompt-time snapshots and never directly mutate `FileDocument` state.
- **DOM Invariant:** React components must never render children into the abcjs SVG DOM container. Annotation overlays and highlight layers are transparent sibling elements sharing the rendered viewBox geometry.
