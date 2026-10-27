# Chorale branch integration — 2026-10-27

## Included work

- Local main: system measure numbering (`fbfc0de`), deterministic music21 core checks (`f14cc20`), and corrected BWV 269 identity and annotations (`3519ce7`).
- Background scan/import and ABC-backed staff instruments checkpoint (`6501fd0`).
- Recital/Studio appearance, pane layout, annotation editor and score framing refinements (`ccadd30`).
- DCML evaluation sources and original pilot outputs (`52bcec9`), kept as research evidence rather than runtime behavior or new accuracy claims.
- music21 context-density pilot scripts and evidence (`a30c12b`).

All uncommitted non-ignored work from the main checkout and three dirty worktrees was checkpointed on its original branch before integration. Ignored environments and generated files were not committed. Existing worktrees and branches remain available.

## Conflict resolutions

Retained the shared left Chat rail and score-selection menu, incorporated background imports and staff labels, and preserved the corrected line-start measure numbering. Staff controls retain source-backed instrument edits and add the Recital window-blur dismissal behavior. The dormant checkpoint lacked FileRail import props, so selectable pending/failed entries and search coverage were added to the current sidebar. Scan smoke assertions now accommodate bottom-positioned zoom controls and scope duplicate status text to the import stage. The context-menu smoke waits for asynchronous creation of the new conversation before checking its composer.

## Branch audit

`branches.json` records every local and fetched origin ref at integration time. Older feature tips were checked against GitHub merged PR heads; they do not represent outstanding features despite lacking merge ancestry after squash merges. The three `backup/*` snapshots remain untouched. Dependency repair branches are superseded by the recorded merged updates; the old file-rail branch is patch-equivalent to main.

## Verification

- Full `npm test`: 256 Node/service tests and 1,052 frontend tests passed (115 frontend files).
- Focused final recheck plus usability/new-score checks: 43 tests passed.
- TypeScript build, production web build, Electron main/preload builds, and lint passed; lint reports warnings, no errors.
- Fresh CLI install/persistence smoke passed.
- Full desktop smoke passed with simulated provider responses: staff instrument saves and revisions, local mute, scan entry, left Chat rail resizing and drafts, settings/panes, annotation Apply All, score preview/apply, and reload persistence. The smoke fixture now uses a named staff and checks the current source-editing contract.
- DCML experiment: frozen dependency environment, 17 pytest tests passed.
- Background-import desktop smoke passed with a controlled recognizer: seven-page input, queue, cancellation, reload, no focus theft, stable document ID, persistence before acknowledgement, preserved originals, and failure recovery. This verifies integration, not recognition quality.
- Score-context-menu browser smoke passed: selection preservation, ABC focus, annotations, current/new chat routing, real bounded playback/loop restart, small viewport and interface zoom, keyboard dismissal, and browser capability boundaries. No model prompts were sent.

The first browser rerun overlapped the install smoke's rebuild of `dist`, causing a transient service fallback page. After the install completed, the isolated browser rerun passed. The temporary worktree could not elevate to configure its own Electron sandbox helper. Playwright desktop smoke launch arguments include `--no-sandbox` (recorded in `background-results.json`), so these runs do not validate sandbox installation. The primary checkout retains its root-owned 4755 helper.
