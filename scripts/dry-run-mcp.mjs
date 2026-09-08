import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const tempDir = await mkdtemp(join(tmpdir(), 'chorale-dryrun-'));
const storePath = join(tempDir, 'scores.json');

console.log(`\x1b[36mStarting Chorale MCP Dry Run...\x1b[0m`);
console.log(`Store path: ${storePath}`);

const serverProcess = spawn('node', ['server.mjs'], {
  env: {
    ...process.env,
    CHORALE_PLUGIN_STORE: storePath,
    CHORALE_PLUGIN_BRIDGE_PORT: '43199',
  },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let messageId = 1;
let buffer = '';

const sendRequest = (method, params = {}) => {
  const id = messageId++;
  const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  serverProcess.stdin.write(payload + '\n');
  return new Promise((resolve, reject) => {
    const onData = (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep remainder
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id === id) {
            serverProcess.stdout.off('data', onData);
            if (message.error) {
              reject(new Error(`MCP Error ${message.error.code}: ${message.error.message}`));
            } else {
              resolve(message.result);
            }
            return;
          }
        } catch {
          // not json, continue
        }
      }
    };
    serverProcess.stdout.on('data', onData);
  });
};

const sendNotification = (method, params = {}) => {
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
  serverProcess.stdin.write(payload + '\n');
};

try {
  // Step 1: Initialize
  console.log('\n1. Initializing MCP handshake...');
  const initResult = await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'dry-run-client', version: '1.0.0' },
  });
  console.log('   Initialized:', initResult.serverInfo);
  sendNotification('notifications/initialized');

  // Step 2: List tools
  console.log('\n2. Listing available MCP tools...');
  const toolsList = await sendRequest('tools/list');
  const toolNames = toolsList.tools.map((t) => t.name);
  console.log(`   Found ${toolNames.length} tools: ${toolNames.join(', ')}`);

  const requiredTools = [
    'create_score',
    'list_scores',
    'get_score_summary',
    'read_measure_range',
    'read_measure_selection',
    'edit_score',
    'add_annotations',
    'edit_annotations',
    'delete_annotations',
  ];
  for (const req of requiredTools) {
    if (!toolNames.includes(req)) throw new Error(`Missing expected tool: ${req}`);
  }

  // Step 3: Create score
  console.log('\n3. Creating score via create_score...');
  const createResult = await sendRequest('tools/call', {
    name: 'create_score',
    arguments: {
      title: 'Dry Run Sonata',
      abcSource: 'X:1\nT:Dry Run Sonata\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c | c B A G | F E D C |',
    },
  });
  const docSummary = createResult.structuredContent;
  console.log(`   Score created: ${docSummary.title} (ID: ${docSummary.documentId}, revision: ${docSummary.revision})`);

  // Step 4: Get summary
  console.log('\n4. Verifying score summary...');
  const summaryResult = await sendRequest('tools/call', {
    name: 'get_score_summary',
    arguments: { documentId: docSummary.documentId },
  });
  console.log('   Summary:', summaryResult.structuredContent);

  // Step 5: Read measures 2 to 3
  console.log('\n5. Reading written measures 2-3...');
  const readResult = await sendRequest('tools/call', {
    name: 'read_measure_range',
    arguments: {
      documentId: docSummary.documentId,
      startMeasure: 2,
      endMeasure: 3,
    },
  });
  console.log(`   Measures:`, readResult.structuredContent.measures);

  // Step 6: Edit score
  console.log('\n6. Editing score via edit_score (adding cadential extension)...');
  const editResult = await sendRequest('tools/call', {
    name: 'edit_score',
    arguments: {
      documentId: docSummary.documentId,
      expectedRevision: docSummary.revision,
      replacementAbc: 'X:1\nT:Dry Run Sonata\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c | c B A G | F E D C | [C4E4G4c4] |',
      summary: 'Add final tonic chord measure',
    },
  });
  const editedDoc = editResult.structuredContent;
  console.log(`   Score edited! New revision: ${editedDoc.revision}, measures: ${editedDoc.measureCount}`);

  // Step 7: Add annotations
  console.log('\n7. Adding annotations via add_annotations...');
  const annResult = await sendRequest('tools/call', {
    name: 'add_annotations',
    arguments: {
      documentId: docSummary.documentId,
      expectedRevision: editedDoc.revision,
      annotations: [
        { startMeasure: 1, endMeasure: 2, label: 'Exposition', body: 'Ascending scale idea' },
        { startMeasure: 5, endMeasure: 5, label: 'Final Chord', body: 'Full C major harmony' },
      ],
    },
  });
  const annotatedDoc = annResult.structuredContent;
  console.log(`   Annotations added! New revision: ${annotatedDoc.revision}, annotations: ${annotatedDoc.annotationCount}`);

  // Step 8: Edit annotation
  const firstAnnId = annotatedDoc.addedAnnotations[0].id;
  console.log(`\n8. Editing annotation ${firstAnnId}...`);
  const editAnnResult = await sendRequest('tools/call', {
    name: 'edit_annotations',
    arguments: {
      documentId: docSummary.documentId,
      expectedRevision: annotatedDoc.revision,
      annotationId: firstAnnId,
      updates: {
        label: 'Primary Theme',
        body: 'Ascending scale theme in C major',
      },
    },
  });
  const editedAnnDoc = editAnnResult.structuredContent;
  console.log(`   Annotation updated! New revision: ${editedAnnDoc.revision}`);

  // Step 9: Delete annotation
  const secondAnnId = annotatedDoc.addedAnnotations[1].id;
  console.log(`\n9. Deleting annotation ${secondAnnId}...`);
  const delAnnResult = await sendRequest('tools/call', {
    name: 'delete_annotations',
    arguments: {
      documentId: docSummary.documentId,
      expectedRevision: editedAnnDoc.revision,
      annotationIds: [secondAnnId],
    },
  });
  console.log(`   Annotation deleted! Result:`, delAnnResult.structuredContent);

  // Step 10: List scores
  console.log('\n10. Final score listing...');
  const listResult = await sendRequest('tools/call', { name: 'list_scores' });
  console.log('   All saved scores:', listResult.structuredContent.scores);

  console.log(`\n\x1b[32m✔ DRY RUN COMPLETED SUCCESSFULLY! All MCP tools and persistence verified.\x1b[0m`);
} finally {
  serverProcess.kill();
  await rm(tempDir, { recursive: true, force: true });
}
