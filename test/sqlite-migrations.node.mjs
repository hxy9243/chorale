import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  CURRENT_SCHEMA_VERSION,
  LocalDocumentStore,
  PluginError,
} from '../server/store.mjs';

const withTempDatabase = async (run) => {
  const directory = await mkdtemp(join(tmpdir(), 'chorale-schema-'));
  const dbPath = join(directory, 'chorale.db');
  try {
    await run(dbPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const createVersionFixture = (dbPath, version) => {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE sentinel (value TEXT NOT NULL);
      INSERT INTO sentinel (value) VALUES ('preserve-me');
    `);
    if (version !== null) {
      db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(version);
    }
  } finally {
    db.close();
  }
};

test('SQLite schema: fresh initialization is durable and version metadata is managed', async () => {
  await withTempDatabase(async (dbPath) => {
    const store = new LocalDocumentStore({ baseDir: dirname(dbPath), dbPath });
    try {
      assert.equal(store.getMeta('schema_version'), String(CURRENT_SCHEMA_VERSION));
      assert.throws(
        () => store.setMeta('schema_version', String(CURRENT_SCHEMA_VERSION + 1)),
        (err) => err instanceof PluginError && err.code === 'SCHEMA_VERSION_MANAGED',
      );
      store.setMeta('installation_id', 'local-test');
      await store.create({ id: 'score-persisted', title: 'Persisted score' });
    } finally {
      store.close();
    }

    const reopened = new LocalDocumentStore({ baseDir: dirname(dbPath), dbPath });
    try {
      assert.equal(reopened.getMeta('schema_version'), String(CURRENT_SCHEMA_VERSION));
      assert.equal(reopened.getMeta('installation_id'), 'local-test');
      assert.equal((await reopened.require('score-persisted')).title, 'Persisted score');
    } finally {
      reopened.close();
    }
  });
});

test('SQLite schema: a newer version is rejected before WAL or schema writes', async () => {
  await withTempDatabase(async (dbPath) => {
    createVersionFixture(dbPath, String(CURRENT_SCHEMA_VERSION + 1));

    assert.throws(
      () => new LocalDocumentStore({ baseDir: dirname(dbPath), dbPath, seedDefault: true }),
      (err) => err instanceof PluginError && err.code === 'UNSUPPORTED_SCHEMA_VERSION',
    );
    assert.equal(existsSync(join(dirname(dbPath), 'scores')), false);

    const db = new DatabaseSync(dbPath);
    try {
      assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
      assert.equal(db.prepare('SELECT value FROM sentinel').get().value, 'preserve-me');
      assert.equal(
        db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'workspace'").get().count,
        0,
      );
    } finally {
      db.close();
    }
  });
});

test('SQLite schema: invalid and missing version markers fail closed', async (t) => {
  for (const [label, version] of [['missing', null], ['non-numeric', 'future'], ['zero', '0']]) {
    await t.test(label, async () => {
      await withTempDatabase(async (dbPath) => {
        createVersionFixture(dbPath, version);
        assert.throws(
          () => new LocalDocumentStore({ baseDir: dirname(dbPath), dbPath }),
          (err) => err instanceof PluginError && err.code === 'INVALID_SCHEMA_VERSION',
        );

        const db = new DatabaseSync(dbPath);
        try {
          assert.equal(db.prepare('SELECT value FROM sentinel').get().value, 'preserve-me');
          assert.equal(
            db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'workspace'").get().count,
            0,
          );
        } finally {
          db.close();
        }
      });
    });
  }
});

test('SQLite schema: an unversioned nonempty database is never adopted', async () => {
  await withTempDatabase(async (dbPath) => {
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE legacy_data (value TEXT); INSERT INTO legacy_data VALUES ('untouched');");
    db.close();

    assert.throws(
      () => new LocalDocumentStore({ baseDir: dirname(dbPath), dbPath }),
      (err) => err instanceof PluginError && err.code === 'UNVERSIONED_DATABASE',
    );

    const check = new DatabaseSync(dbPath);
    try {
      assert.equal(check.prepare('SELECT value FROM legacy_data').get().value, 'untouched');
      assert.equal(
        check.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'meta'").get().count,
        0,
      );
    } finally {
      check.close();
    }
  });
});

test('SQLite schema: a current marker cannot conceal a partial schema', async () => {
  await withTempDatabase(async (dbPath) => {
    createVersionFixture(dbPath, String(CURRENT_SCHEMA_VERSION));

    assert.throws(
      () => new LocalDocumentStore({ baseDir: dirname(dbPath), dbPath }),
      (err) => err instanceof PluginError && err.code === 'INVALID_DATABASE_SCHEMA',
    );

    const db = new DatabaseSync(dbPath);
    try {
      assert.equal(db.prepare('SELECT value FROM sentinel').get().value, 'preserve-me');
      assert.equal(
        db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'workspace'").get().count,
        0,
      );
    } finally {
      db.close();
    }
  });
});


test('SQLite schema: a view-only database is not mistaken for an empty database', async () => {
  await withTempDatabase(async (dbPath) => {
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE VIEW documents AS SELECT 1 AS x;');
    const before = db.prepare('SELECT type, name, sql FROM sqlite_schema ORDER BY name').all();
    db.close();

    assert.throws(
      () => new LocalDocumentStore({ baseDir: dirname(dbPath), dbPath }),
      (err) => err instanceof PluginError && err.code === 'UNVERSIONED_DATABASE',
    );

    const check = new DatabaseSync(dbPath);
    try {
      assert.deepEqual(check.prepare('SELECT type, name, sql FROM sqlite_schema ORDER BY name').all(), before);
      assert.equal(check.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
      assert.equal(existsSync(join(dirname(dbPath), 'scores')), false);
    } finally {
      check.close();
    }
  });
});
