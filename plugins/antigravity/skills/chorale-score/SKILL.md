---
name: chorale-score
description: Inspect scores, read measure ranges, apply score edits, and manage musical annotations via the local Chorale MCP server.
---

# Chorale Score Workflow

Use the local Chorale MCP server tools (`chorale`) as the primary interface for all musical score inspection, analysis, and modification.

## 1. Discover & Resolve Scores
- Call `list_scores` to view all available score documents, their titles, measure counts, and revisions.
- Call `get_score_summary` with `documentId` to inspect the current revision and metadata before taking any action.

## 2. Bounded Measure Reads
- To inspect specific measures, call `read_measure_range` with `documentId`, `startMeasure`, and `endMeasure` (1-indexed, inclusive).
- If the user has a score open in an interactive Chorale view, call `read_measure_selection` to inspect the user's currently highlighted passage and its voice-separated ABC notation.
- Always ground musical explanations in exact written measure numbers and voice parts.

## 3. Authoritative Edits & Annotations
- **Editing Scores:** When modifying the score (e.g. transposing, harmonizing, extending phrases, fixing voice leading), call `edit_score` with `documentId`, `expectedRevision`, `replacementAbc`, and a descriptive `summary`. The server updates the authoritative store and synchronizes with any active workspace view.
- **Adding Annotations:** Call `add_annotations` with `documentId`, `expectedRevision`, and an array of `{ startMeasure, endMeasure, label, body }` objects to record analytical observations, Roman numerals, or performance notes.
- **Modifying/Removing Annotations:** Call `edit_annotations` to update an annotation's text or measure span, or `delete_annotations` to remove annotations by ID.
- **Revision Control:** Always provide the `expectedRevision` obtained from the most recent read. If a `REVISION_CONFLICT` occurs, re-read the score to inspect concurrent changes before re-applying.

## 4. Visual Workspace (Optional)
- In hosts that support MCP Apps UI (such as Codex or compatible MCP clients), call `render_score_workspace` with `documentId` to display the interactive sheet music view.
- If the visual workspace is not supported by the host, continue using the data tools directly; all score inspection, analysis, and editing functions operate headlessly.
