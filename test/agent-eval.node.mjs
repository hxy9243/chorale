import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LocalDocumentStore } from '../server/store.mjs';
import { createFileManagementTools } from '../server/mcp/tools/file-management.mjs';
import { createSheetManagementTools } from '../server/mcp/tools/sheet-management.mjs';
import { ViewSnapshotStore } from '../server/views.mjs';

const corpusPath = fileURLToPath(new URL('./eval/corpus.json', import.meta.url));
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));

const includesFolded = (value, phrase) => value.toLocaleLowerCase().includes(phrase.toLocaleLowerCase());

export const scoreGroundedAnswer = (evalCase, evidence, answer) => {
  const failures = [];

  for (const phrase of evalCase.requiredAnswerPhrases) {
    if (!includesFolded(answer, phrase)) failures.push(`missing required answer phrase: ${phrase}`);
  }
  for (const citation of evalCase.citations) {
    if (!includesFolded(answer, citation)) failures.push(`missing passage citation: ${citation}`);
  }
  for (const phrase of evalCase.forbiddenAnswerPhrases) {
    if (includesFolded(answer, phrase)) failures.push(`contains forbidden answer phrase: ${phrase}`);
  }
  for (const claim of evalCase.groundedClaims) {
    if (includesFolded(answer, claim.answerPhrase) && !evidence.includes(claim.evidence)) {
      failures.push(`claim is absent from MCP evidence: ${claim.answerPhrase}`);
    }
  }

  return { passed: failures.length === 0, failures };
};

test('v0.0.1 corpus is a small deterministic contract suite', () => {
  assert.ok(corpus.length >= 3);
  assert.ok(corpus.length <= 10, 'the v0.0.1 gate must stay small; expand measured evaluation separately');
  assert.equal(new Set(corpus.map((evalCase) => evalCase.id)).size, corpus.length);
});

for (const evalCase of corpus) {
  test(`agent grounding contract: ${evalCase.id}`, async () => {
    const store = new LocalDocumentStore({ dbPath: ':memory:' });
    try {
      const fileTools = createFileManagementTools(store);
      const sheetTools = createSheetManagementTools(store, new ViewSnapshotStore());

      const created = await fileTools.handlers.create_new_file(evalCase.score);
      assert.equal(created.isError, undefined);

      const result = await sheetTools.handlers.read_measure({
        documentId: created.structuredContent.documentId,
        ...evalCase.read,
      });
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent.range, evalCase.expectedRange);
      assert.equal(result.structuredContent.measureCount, evalCase.expectedMeasureCount);

      const evidence = result.structuredContent.abcSource;
      for (const phrase of evalCase.requiredEvidence) assert.ok(evidence.includes(phrase), `missing MCP evidence: ${phrase}`);
      for (const phrase of evalCase.excludedEvidence) assert.ok(!evidence.includes(phrase), `unexpected MCP evidence: ${phrase}`);

      const scored = scoreGroundedAnswer(evalCase, evidence, evalCase.referenceAnswer);
      assert.deepEqual(scored, { passed: true, failures: [] });

      const withoutCitation = evalCase.referenceAnswer.replace(evalCase.citations[0], 'the passage');
      assert.equal(scoreGroundedAnswer(evalCase, evidence, withoutCitation).passed, false);

      const withoutRequiredFact = evalCase.referenceAnswer.replace(evalCase.requiredAnswerPhrases[0], '');
      assert.equal(scoreGroundedAnswer(evalCase, evidence, withoutRequiredFact).passed, false);

      const withForbiddenClaim = `${evalCase.referenceAnswer} ${evalCase.forbiddenAnswerPhrases[0]}.`;
      assert.equal(scoreGroundedAnswer(evalCase, evidence, withForbiddenClaim).passed, false);

      if (evalCase.groundedClaims.length > 0) {
        const hallucinatedEvidence = evidence.replace(evalCase.groundedClaims[0].evidence, '');
        assert.equal(scoreGroundedAnswer(evalCase, hallucinatedEvidence, evalCase.referenceAnswer).passed, false);
      }
    } finally {
      store.close();
    }
  });
}
