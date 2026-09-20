# Changelog

## [0.0.1] - 2026-09-19

### Added

- First release of the local browser score workspace and MCP tools for creating, importing, inspecting, annotating, editing and exporting short scores.
- Durable SQLite documents, revisions and history, with guards that prevent older builds from modifying unsupported database schemas.
- Basic deterministic score-evidence checks and usability checks for score creation, keyboard focus and validation feedback.

### Fixed

- Built installation packages include the actual browser workspace and pinned notation dependency.
- New Score identifies invalid fields and focuses the first field needing correction. A late sample load no longer takes focus away from a newly created score.
- CLI, MCP and plugin release metadata consistently report v0.0.1.

### Known limitations

- Real-browser workflow automation and expanded live-model evaluation are scheduled for v0.0.2. Component tests do not establish audible playback or real-browser behavior.
- Legacy JSON libraries are not migrated. Use a source build or the built release archive; direct global GitHub installation is not supported in this release.
- See [RELEASE.md](./RELEASE.md) for supported environments, conversion limitations and backup/recovery instructions.
