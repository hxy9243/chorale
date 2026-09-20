# Chorale v0.0.1

The first release provides a local browser score workspace and MCP tools for external agents. Canonical ABC, annotations, revisions and history live in SQLite. Agent conversations and provider settings belong to the MCP client.

## Release scope

The maintainer approved this scope on 2026-09-19:

- Include deterministic Node/Vitest tests, a basic score-evidence evaluation, component-level usability checks, a production build, and fresh package installation/persistence verification.
- Keep SQLite schema compatibility checks and document how future migrations should work.
- Exclude legacy JSON-to-SQLite migration. Legacy files are not imported or deleted.
- Defer real-browser automation to [v0.0.2 / #39](https://github.com/hxy9243/chorale/issues/39).
- Defer expanded live-model evaluation to [v0.0.2 / #40](https://github.com/hxy9243/chorale/issues/40).

The roadmap and release gates are tracked in [#18](https://github.com/hxy9243/chorale/issues/18) and [#17](https://github.com/hxy9243/chorale/issues/17).

## Verification

Run these checks against the release commit before creating its tag:

```bash
npm test
npm run test:usability
npm run test:eval
npx tsc -b
npm run lint
npm run build
npm run test:install
npm run package
```

CI runs the complete Node/Vitest suites (including the basic evaluation), an explicit component-usability gate, lint, build and the isolated installed-package check. The installation check packs the actual browser build, installs into a temporary prefix, serves real JS/CSS, creates a score, restarts the server, and verifies reopened/exported content. It does not use the user's score library or daemon.

The evaluation includes three cases: melody location, voice-scoped sonority evidence, and absent dynamic markings. It checks real MCP evidence and reference-answer contracts, including negative probes. It does **not** measure live model-answer quality or establish a 90% success rate. See [the evaluation specification](https://github.com/hxy9243/chorale/blob/v0.0.1/spec/agent-evaluation.md).

The usability gate checks first-run import/create controls, active score context, New Score keyboard/focus behavior, validation feedback, and narrow-layout CSS rules. Rendering/audio are mocked in component tests. These checks do **not** prove real browser layout, audible playback, or an end-to-end browser journey.

The final GitHub release links the passing CI run and records the tested commit and artifact checksums. Passing local checks alone does not authorize tagging a different commit.

## Installation and supported scope

- Use the source-build instructions in [INSTALL.md](./INSTALL.md), or install the built `chorale-0.0.1.tgz` release asset with `npm install --global /path/to/chorale-0.0.1.tgz`.
- Node.js 22.13+ on the 22.x line, or 24+. Linux/Node 22 is the CI environment; local checks also run on Linux/Node 24. macOS/Windows and specific browser versions are not yet release-verified.
- Direct global installation from a GitHub URL is not a supported v0.0.1 path: npm's Git preparation failed in isolated testing. Built archives include the browser assets and pinned notation dependency. The source checkout permits its direct Git dependency through `.npmrc` on npm 12.
- The import converter `@educandu/abc-tools` declares Node 20 support and emits an engine warning on the target Node versions. Import/conversion tests must pass on the release target; upstream engine metadata is still a known compatibility limitation.
- ABC is the canonical editable representation. MusicXML/MXL conversion can lose notation details; inspect converted/exported music before relying on it. Advanced engraving, arbitrary orchestral analysis and full DAW functionality are outside this release.
- Prefer short tonal scores. No measured maximum score size is claimed. HTTP request bodies are limited to 2,000,000 bytes; this is a transport bound, not a score-quality guarantee.
- Playback requires browser audio permission/user interaction and may fetch soundfonts. Video export depends on browser codec support and is not a verified cross-browser release capability.
- Archive installs update by installing the new archive, then running `chorale upgrade --skip-pull`. The private package has no automatic npm registry upgrade and no published `@chorale/cli` package.

## SQLite compatibility and recovery

The current schema version is 1. Chorale accepts that version and rejects unsupported future versions, invalid version markers and missing required tables before application writes. This is a compatibility check, not a full database-corruption validator. New-database schema creation is atomic. [SQLite migration policy](https://github.com/hxy9243/chorale/blob/v0.0.1/spec/sqlite-migrations.md) defines sequential, transaction-safe future changes with preservation/rollback tests. This release does not need a data migration.

1. Stop Chorale with `chorale stop` and close score tabs before taking a consistent backup.
2. Copy the entire `~/.chorale/` directory to a separate location (or the configured `CHORALE_HOME`, plus any separately configured database path). Preserve `chorale.db`, SQLite sidecars and `scores/`; ABC mirrors alone do not contain annotations or revision history.
3. On save failure, preserve unsaved ABC separately before reloading. Check disk space and directory permissions. Do not clear storage or delete the database as a first response.
4. To recover, stop the daemon, preserve the failed directory, restore a known-good full backup, restart with `chorale`, and verify score content/history. Avoid mixing SQLite files from different backups.
5. If a newer schema is detected, use the newer Chorale build or restore a backup made by the older build. Never manually decrease the version marker.

## v0.0.2 follow-up

- [#39 Browser workflow CI](https://github.com/hxy9243/chorale/issues/39): real rendering, audio, imports, edits, reopening, annotations, citations, undo/export, and failure/document-switching paths.
- [#40 Measured agent evaluation](https://github.com/hxy9243/chorale/issues/40): 30+ representative prompts, versioned model/client metadata, factual/citation/constraint scoring and reviewed failure baselines.
