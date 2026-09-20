---
title: "SQLite Schema Migrations"
description: "Version compatibility and atomic migration policy for Chorale's local SQLite store"
category: "architecture"
date: 2026-09-19
status: "approved"
source_files:
  - server/store.mjs
test_files:
  - test/sqlite-migrations.node.mjs
related_specs:
  - spec/mcp-server-redesign.md
  - spec/file-workspace-architecture.md
---

# SQLite Schema Migrations

## Current schema

Chorale stores the current integer schema version in the `meta` table under the
`schema_version` key. Version `1` is the only schema supported by v0.0.1.

Creating a new database is a schema transition from an empty SQLite file to the
current schema. Table creation, singleton workspace creation, and writing the
version marker must commit in one transaction. The version marker is written
last so it never advertises a partially initialized schema.

## Startup compatibility checks

The store must inspect an existing database before enabling WAL mode, creating
tables, seeding a score, or performing any other persistent application write.

- A database at the current version opens normally after its required tables
  are validated.
- A database whose version is newer than the running Chorale build is rejected.
  The older build must not attempt to repair, downgrade, or write to it.
- A missing, malformed, non-positive, or otherwise unsupported version is
  rejected when the database already contains application schema objects, including views.
- A database with no application schema objects is initialized as the current version.

No migration runner is needed while version 1 is the only supported schema. `schema_version` is reserved for internal schema management. General metadata APIs must
not change it.

## Adding a migration

When a release changes the relational schema:

1. Introduce a migration runner and increment the current schema version by one.
2. Add one migration for the previous version. Each step transforms version
   `N` into `N + 1`; do not skip versions.
3. Run all pending steps and their version-marker updates in one immediate
   transaction. If any statement fails, roll back the schema and marker
   together.
4. Add fixture-based tests that open the previous schema, verify preserved data
   after migration, and inject a failure to prove rollback behavior.
5. Keep migrations deterministic and local. Do not read or rewrite the legacy
   JSON store as part of SQLite schema migration.

Backward migrations are not supported. Users who need to run an older Chorale
build must restore a database backup made by that build.
