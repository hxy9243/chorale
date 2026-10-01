import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSheetManagementTools } from '../server/mcp/tools/sheet-management.mjs';
import { resolveMusic21Python } from '../server/music21.mjs';
import { LocalDocumentStore } from '../server/store.mjs';
import { ViewSnapshotStore } from '../server/views.mjs';
import { HARMONY_REGRESSION_FIXTURES } from './fixtures/harmony-regression.mjs';

test('harmony regression: verifies all 14 frozen failure cases against real endpoint', async (t) => {
  let runtime;
  try {
    runtime = await resolveMusic21Python();
  } catch {
    t.skip('music21 is not installed in the test environment');
    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'chorale-test-regression-'));
  try {
    const store = new LocalDocumentStore({ baseDir: tempDir });
    const views = new ViewSnapshotStore();
    const { handlers } = createSheetManagementTools(store, views);

    for (const fixture of HARMONY_REGRESSION_FIXTURES) {
      await t.test(fixture.title, async () => {
        const doc = await store.create({
          title: fixture.title,
          abcSource: fixture.abcSource,
        });

        const initialDoc = await store.require(doc.id);
        assert.equal(initialDoc.revision, 1);

        const result = await handlers.analyze_harmony({
          documentId: doc.id,
          startMeasure: fixture.range.startMeasure,
          endMeasure: fixture.range.endMeasure,
        });

        assert.equal(result.isError, undefined, `Failed for fixture ${fixture.id}: ${JSON.stringify(result)}`);
        const content = result.structuredContent;

        // Invariant: analyze_harmony is strictly read-only
        const currentDoc = await store.require(doc.id);
        assert.equal(currentDoc.revision, 1, 'Document revision must not increment');
        assert.equal(currentDoc.abcSource, initialDoc.abcSource, 'Source ABC must not be mutated');
        assert.deepEqual(currentDoc.annotations || [], [], 'Annotations must not be silently added');

        // Bounded range verification
        assert.equal(content.range.startMeasure, fixture.range.startMeasure);
        assert.equal(content.range.endMeasure, fixture.range.endMeasure);

        if (fixture.expectedPassageKey) {
          assert.equal(content.estimatedPassageKey, fixture.expectedPassageKey);
        }

        // Expected slices assertions
        if (fixture.expectedSlices.length === 0) {
          assert.equal(content.slices.length, 0, `Expected 0 slices for ${fixture.id}`);
        } else {
          assert.ok(content.slices.length >= fixture.expectedSlices.length, `Expected at least ${fixture.expectedSlices.length} slices, got ${content.slices.length}`);
          for (let i = 0; i < fixture.expectedSlices.length; i++) {
            const expected = fixture.expectedSlices[i];
            const actual = content.slices[i];
            assert.ok(actual, `Missing slice ${i} for ${fixture.id}`);

            if (expected.position) {
              assert.equal(actual.position.measure, expected.position.measure, `Measure mismatch at slice ${i}`);
              assert.equal(actual.position.offsetQuarterLength, expected.position.offsetQuarterLength, `Offset mismatch at slice ${i}`);
            }

            if (expected.durationQuarterLength) {
              assert.equal(actual.durationQuarterLength, expected.durationQuarterLength, `Duration mismatch at slice ${i}`);
            }

            if (expected.soundingPitches) {
              assert.deepEqual(actual.soundingPitches, expected.soundingPitches, `Pitches mismatch at slice ${i} for ${fixture.id}`);
            }

            if (expected.literalBass) {
              assert.equal(actual.literalBass, expected.literalBass, `Bass mismatch at slice ${i} for ${fixture.id}`);
            }

            if (expected.candidate) {
              if (expected.candidate.localKey) {
                assert.equal(actual.candidate.localKey, expected.candidate.localKey, `Local key mismatch at slice ${i}`);
              }
              if (expected.candidate.root) {
                assert.equal(actual.candidate.root, expected.candidate.root, `Root mismatch at slice ${i}`);
              }
              if (expected.candidate.quality) {
                assert.equal(actual.candidate.quality, expected.candidate.quality, `Quality mismatch at slice ${i}`);
              }
              if (expected.candidate.inversion) {
                assert.equal(actual.candidate.inversion, expected.candidate.inversion, `Inversion mismatch at slice ${i}`);
              }
              if (expected.candidate.romanNumeral) {
                assert.equal(actual.candidate.romanNumeral, expected.candidate.romanNumeral, `Roman numeral mismatch at slice ${i}`);
              }
            }
          }
        }
      });
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
