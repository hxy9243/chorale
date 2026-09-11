import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { scoreSummary } from '../store.mjs';
import { musicXmlToAbc } from '../utils/music-xml.mjs';

const result = (structuredContent, text) => ({
  structuredContent,
  content: [{ type: 'text', text }],
});

const failure = (error) => ({
  isError: true,
  structuredContent: { errorCode: error?.code || 'PERSISTENCE_FAILED' },
  content: [{ type: 'text', text: error instanceof Error ? error.message : 'File operation failed.' }],
});

export const createFileManagementTools = (store) => {
  const handlers = {
    create_new_file: async (input) => {
      try {
        const doc = await store.create({
          title: input.title,
          abcSource: input.abcSource,
          composer: input.composer,
          meter: input.meter,
          key: input.key,
        });
        const summary = scoreSummary(doc);
        return result(summary, `Created new score file "${doc.title}" (ID: ${doc.id}, revision ${doc.revision}).`);
      } catch (error) {
        return failure(error);
      }
    },

    list_files: async () => {
      try {
        const documents = await store.list();
        const files = documents.map(scoreSummary);
        return result({ files, count: files.length }, `Found ${files.length} score file(s) in ~/.chorale/.`);
      } catch (error) {
        return failure(error);
      }
    },

    delete_file: async ({ documentId }) => {
      try {
        const res = await store.delete(documentId);
        return result(res, `Deleted score file "${documentId}". ${res.remainingCount} file(s) remaining.`);
      } catch (error) {
        return failure(error);
      }
    },

    import_file: async ({ filePath, content, format = 'auto', title }) => {
      try {
        let abcSource = '';
        let detectedTitle = title || 'Imported Score';

        if (filePath) {
          const lower = filePath.toLowerCase();
          if (lower.endsWith('.xml') || lower.endsWith('.musicxml') || lower.endsWith('.mxl') || format === 'musicxml') {
            abcSource = await musicXmlToAbc(filePath);
          } else {
            const { readFile } = await import('node:fs/promises');
            abcSource = await readFile(filePath, 'utf8');
          }
        } else if (content) {
          if (format === 'musicxml' || content.trim().startsWith('<') || content.includes('score-partwise')) {
            abcSource = await musicXmlToAbc(content);
          } else {
            abcSource = content;
          }
        } else {
          throw new Error('Either filePath or content must be provided to import_file.');
        }

        // Try extracting title from ABC if not provided
        if (!title) {
          const titleMatch = abcSource.match(/^T:\s*(.+)$/m);
          if (titleMatch) {
            detectedTitle = titleMatch[1].trim();
          }
        }

        const doc = await store.create({
          title: detectedTitle,
          abcSource,
        });

        const summary = scoreSummary(doc);
        return result(summary, `Imported file into score "${doc.title}" (ID: ${doc.id}, measures: ${summary.measureCount}).`);
      } catch (error) {
        return failure(error);
      }
    },

    export_file: async ({ documentId, format = 'abc', outputPath }) => {
      try {
        const doc = await store.require(documentId);
        let outputContent = '';

        if (format === 'json') {
          outputContent = JSON.stringify(doc, null, 2);
        } else if (format === 'abc') {
          outputContent = doc.abcSource;
        } else {
          throw new Error(`Export format "${format}" is not directly supported without converter.`);
        }

        if (outputPath) {
          await writeFile(outputPath, outputContent, 'utf8');
          return result({ documentId, format, outputPath, bytes: outputContent.length }, `Exported score "${doc.title}" to ${outputPath}.`);
        }

        return result({ documentId, format, content: outputContent }, `Exported score "${doc.title}" (${outputContent.length} bytes).`);
      } catch (error) {
        return failure(error);
      }
    },
  };

  const schemas = {
    create_new_file: {
      title: 'Create new score file',
      description: 'Create a new score file in ~/.chorale/ from ABC notation or default piano template.',
      inputSchema: {
        title: z.string().min(1).max(160).describe('Title of the score'),
        abcSource: z.string().optional().describe('Optional initial ABC notation source'),
        composer: z.string().optional().describe('Optional composer name'),
        meter: z.string().optional().describe('Optional meter, e.g. "4/4" or "3/4"'),
        key: z.string().optional().describe('Optional key signature, e.g. "C", "G", "Am"'),
      },
    },

    list_files: {
      title: 'List score files',
      description: 'List all locally managed score files with ID, title, revision, measure count, and annotation count.',
    },

    delete_file: {
      title: 'Delete score file',
      description: 'Delete a score file from ~/.chorale/ by its document ID.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID to delete'),
      },
    },

    import_file: {
      title: 'Import score file',
      description: 'Import a score file from disk path or text content (MusicXML .xml, .musicxml, .mxl, or ABC .abc) into ~/.chorale/.',
      inputSchema: {
        filePath: z.string().optional().describe('Absolute or relative path to the score file to import'),
        content: z.string().optional().describe('Raw MusicXML or ABC text content to import'),
        format: z.enum(['auto', 'musicxml', 'mxl', 'abc']).optional().describe('Format hint (defaults to auto)'),
        title: z.string().optional().describe('Optional title override'),
      },
    },

    export_file: {
      title: 'Export score file',
      description: 'Export a score document from ~/.chorale/ to ABC, JSON, or disk file.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID to export'),
        format: z.enum(['abc', 'json']).optional().describe('Output format ("abc" or "json", default "abc")'),
        outputPath: z.string().optional().describe('Optional file path to save the exported score'),
      },
    },
  };

  return { handlers, schemas };
};
