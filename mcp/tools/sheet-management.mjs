import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PluginError } from '../store.mjs';
import {
  deleteMeasures as deleteMeasuresOps,
  insertMeasures as insertMeasuresOps,
  replaceMeasures as replaceMeasuresOps,
  sliceMeasureRange,
} from '../utils/measure-ops.mjs';

const result = (structuredContent, text) => ({
  structuredContent,
  content: [{ type: 'text', text }],
});

const failure = (error) => ({
  isError: true,
  structuredContent: { errorCode: error?.code || 'OPERATION_FAILED' },
  content: [{ type: 'text', text: error instanceof Error ? error.message : 'Sheet operation failed.' }],
});

export const createSheetManagementTools = (store, views) => {
  const handlers = {
    read_measure: async ({ documentId, startMeasure, endMeasure, voiceId, viewId }) => {
      try {
        let doc;
        let view = null;

        if (viewId) {
          view = views.require(viewId);
          documentId = documentId || view.documentId;
        }

        if (!documentId) {
          // Attempt resolving active view or active workspace file
          try {
            view = views.resolve();
            documentId = view.documentId;
          } catch {
            const ws = await store.getWorkspace();
            documentId = ws.activeFileId || ws.documents[0]?.id;
          }
        }

        if (!documentId) {
          throw new PluginError('DOCUMENT_NOT_FOUND', 'No score document specified or currently active.');
        }

        doc = await store.require(documentId);

        // If no measure was specified and view has a selection, read the selection
        if (startMeasure === undefined && view?.selection) {
          return result({
            documentId: doc.id,
            title: doc.title,
            revision: doc.revision,
            viewId: view.viewId,
            range: view.selection,
            abcSource: view.selectedAbc || '',
            message: `Selected measures ${view.selection.startMeasure}–${view.selection.endMeasure} in view "${view.viewId}".`,
          }, `Read selected measures ${view.selection.startMeasure}–${view.selection.endMeasure} from view.`);
        }

        const start = startMeasure || 1;
        const end = endMeasure || start;
        const sliced = sliceMeasureRange(doc.abcSource, start, end, voiceId);

        const scoreTitle = doc.title || doc.scoreInfo?.title || doc.name || 'Untitled score';
        return result({
          documentId: doc.id,
          title: scoreTitle,
          revision: doc.revision,
          range: { startMeasure: start, endMeasure: end, voiceId: voiceId || null },
          abcSource: sliced.selectedAbc,
          measureCount: sliced.measureCount,
        }, `Read measures ${start}–${end} of "${scoreTitle}".`);
      } catch (error) {
        return failure(error);
      }
    },

    insert_measure: async ({ documentId, targetMeasure, position = 'after', count = 1, abcContent = '', expectedRevision }) => {
      try {
        const doc = await store.require(documentId);
        const newAbc = insertMeasuresOps(doc.abcSource, targetMeasure, position, count, abcContent);
        const updated = await store.update(documentId, {
          abcSource: newAbc,
          expectedRevision,
        });
        return result({
          documentId: updated.id,
          title: updated.title,
          revision: updated.revision,
          insertedCount: count,
          targetMeasure,
          position,
        }, `Inserted ${count} measure(s) ${position} measure ${targetMeasure} in "${doc.title}" (revision ${updated.revision}).`);
      } catch (error) {
        return failure(error);
      }
    },

    edit_measure: async ({ documentId, startMeasure, endMeasure, replacementAbc, summary = 'Edit measures', expectedRevision }) => {
      try {
        const doc = await store.require(documentId);
        const newAbc = replaceMeasuresOps(doc.abcSource, startMeasure, endMeasure, replacementAbc);
        const updated = await store.update(documentId, {
          abcSource: newAbc,
          expectedRevision,
        });
        return result({
          documentId: updated.id,
          title: updated.title,
          revision: updated.revision,
          editedRange: { startMeasure, endMeasure },
          summary,
        }, `Updated measures ${startMeasure}–${endMeasure} in "${doc.title}" (revision ${updated.revision}).`);
      } catch (error) {
        return failure(error);
      }
    },

    delete_measures: async ({ documentId, startMeasure, endMeasure, expectedRevision }) => {
      try {
        const doc = await store.require(documentId);
        const newAbc = deleteMeasuresOps(doc.abcSource, startMeasure, endMeasure);
        const updated = await store.update(documentId, {
          abcSource: newAbc,
          expectedRevision,
        });
        return result({
          documentId: updated.id,
          title: updated.title,
          revision: updated.revision,
          deletedRange: { startMeasure, endMeasure },
        }, `Deleted measures ${startMeasure}–${endMeasure} in "${doc.title}" (revision ${updated.revision}).`);
      } catch (error) {
        return failure(error);
      }
    },

    add_notation: async ({ documentId, notations, expectedRevision }) => {
      try {
        const doc = await store.require(documentId);
        const now = new Date().toISOString();
        const newAnnotations = notations.map((notation) => ({
          id: `ann-${randomUUID().slice(0, 8)}`,
          startMeasure: notation.startMeasure,
          endMeasure: notation.endMeasure || notation.startMeasure,
          span: {
            startMeasure: notation.startMeasure,
            endMeasure: notation.endMeasure || notation.startMeasure,
          },
          label: notation.label || 'Note',
          body: notation.body || '',
          kind: notation.kind || 'explanation',
          chordSymbol: notation.chordSymbol || undefined,
          romanNumeral: notation.romanNumeral || undefined,
          position: notation.position || undefined,
          createdAt: now,
          updatedAt: now,
        }));

        const existing = Array.isArray(doc.annotations) ? doc.annotations : [];
        const updated = await store.update(documentId, {
          annotations: [...existing, ...newAnnotations],
          expectedRevision,
        });

        return result({
          documentId: updated.id,
          revision: updated.revision,
          addedCount: newAnnotations.length,
          annotations: newAnnotations,
        }, `Added ${newAnnotations.length} notation(s) to "${doc.title}" (revision ${updated.revision}).`);
      } catch (error) {
        return failure(error);
      }
    },

    edit_notations: async ({ documentId, notationId, updates, expectedRevision }) => {
      try {
        const doc = await store.require(documentId);
        const existing = Array.isArray(doc.annotations) ? doc.annotations : [];
        const index = existing.findIndex((ann) => ann.id === notationId);
        if (index === -1) {
          throw new PluginError('NOTATION_NOT_FOUND', `Notation "${notationId}" was not found.`);
        }

        const now = new Date().toISOString();
        const current = existing[index];
        const nextSpan = {
          startMeasure: updates.startMeasure ?? current.startMeasure ?? current.span?.startMeasure,
          endMeasure: updates.endMeasure ?? current.endMeasure ?? current.span?.endMeasure,
        };

        const updatedAnn = {
          ...current,
          ...updates,
          startMeasure: nextSpan.startMeasure,
          endMeasure: nextSpan.endMeasure,
          span: nextSpan,
          updatedAt: now,
        };

        const annotations = [...existing];
        annotations[index] = updatedAnn;

        const updated = await store.update(documentId, {
          annotations,
          expectedRevision,
        });

        return result({
          documentId: updated.id,
          revision: updated.revision,
          notation: updatedAnn,
        }, `Updated notation "${notationId}" in "${doc.title}".`);
      } catch (error) {
        return failure(error);
      }
    },

    delete_notations: async ({ documentId, notationIds, expectedRevision }) => {
      try {
        const doc = await store.require(documentId);
        const existing = Array.isArray(doc.annotations) ? doc.annotations : [];
        const idSet = new Set(notationIds);
        const remaining = existing.filter((ann) => !idSet.has(ann.id));
        const deletedCount = existing.length - remaining.length;

        const updated = await store.update(documentId, {
          annotations: remaining,
          expectedRevision,
        });

        return result({
          documentId: updated.id,
          revision: updated.revision,
          deletedCount,
        }, `Deleted ${deletedCount} notation(s) from "${doc.title}".`);
      } catch (error) {
        return failure(error);
      }
    },

    list_notations: async ({ documentId, startMeasure, endMeasure }) => {
      try {
        const doc = await store.require(documentId);
        let annotations = Array.isArray(doc.annotations) ? doc.annotations : [];

        if (startMeasure !== undefined) {
          const end = endMeasure || startMeasure;
          annotations = annotations.filter((ann) => {
            const aStart = ann.startMeasure || ann.span?.startMeasure || 1;
            const aEnd = ann.endMeasure || ann.span?.endMeasure || aStart;
            return aStart <= end && aEnd >= startMeasure;
          });
        }

        return result({
          documentId: doc.id,
          title: doc.title,
          revision: doc.revision,
          notations: annotations,
          count: annotations.length,
        }, `Found ${annotations.length} notation(s) in "${doc.title}".`);
      } catch (error) {
        return failure(error);
      }
    },
  };

  const schemas = {
    read_measure: {
      title: 'Read measures',
      description: 'Read written ABC notation for specific measure(s) or the current user selection in the active view.',
      inputSchema: {
        documentId: z.string().optional().describe('Score document ID (optional; defaults to active document)'),
        startMeasure: z.number().int().min(1).optional().describe('1-indexed starting measure number'),
        endMeasure: z.number().int().min(1).optional().describe('1-indexed ending measure number (defaults to startMeasure)'),
        voiceId: z.string().optional().describe('Optional voice ID filter'),
        viewId: z.string().optional().describe('Optional view ID to read active selection from'),
      },
    },

    insert_measure: {
      title: 'Insert measures',
      description: 'Insert new measure(s) before or after a measure in the score.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        targetMeasure: z.number().int().min(1).describe('1-indexed target measure number'),
        position: z.enum(['before', 'after']).optional().describe('Insertion position relative to target measure (default "after")'),
        count: z.number().int().min(1).max(64).optional().describe('Number of measures to insert (default 1)'),
        abcContent: z.string().optional().describe('Optional ABC notation content for the inserted measures'),
        expectedRevision: z.number().int().positive().describe('Expected current score revision'),
      },
    },

    edit_measure: {
      title: 'Edit measures',
      description: 'Replace written measures across a specified span with new ABC notation.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        startMeasure: z.number().int().min(1).describe('1-indexed start measure number'),
        endMeasure: z.number().int().min(1).describe('1-indexed end measure number'),
        replacementAbc: z.string().min(1).describe('Replacement ABC notation for the measures'),
        summary: z.string().optional().describe('Brief description of musical edits made'),
        expectedRevision: z.number().int().positive().describe('Expected current score revision'),
      },
    },

    delete_measures: {
      title: 'Delete measures',
      description: 'Delete a range of measures from the score.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        startMeasure: z.number().int().min(1).describe('1-indexed start measure number'),
        endMeasure: z.number().int().min(1).describe('1-indexed end measure number'),
        expectedRevision: z.number().int().positive().describe('Expected current score revision'),
      },
    },

    add_notation: {
      title: 'Add notations / annotations',
      description: 'Add harmonic analyses, chord symbols, Roman numerals, or analytical notes to score measures.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        expectedRevision: z.number().int().positive().describe('Expected current score revision'),
        notations: z.array(z.object({
          startMeasure: z.number().int().min(1).describe('Start measure (1-indexed, inclusive)'),
          endMeasure: z.number().int().min(1).optional().describe('End measure (1-indexed, inclusive)'),
          label: z.string().max(100).describe('Short label or title'),
          body: z.string().max(2000).optional().describe('Analytical note or description'),
          kind: z.enum(['chord', 'modulation', 'voice-leading', 'explanation']).optional().describe('Kind of notation'),
          chordSymbol: z.string().max(40).optional().describe('Chord symbol (e.g. "Cmaj7", "G7", "Dm")'),
          romanNumeral: z.string().max(40).optional().describe('Roman numeral analysis (e.g. "I", "V7/V", "vi")'),
        })).min(1).describe('Array of notations to add'),
      },
    },

    edit_notations: {
      title: 'Edit notation',
      description: 'Update an existing notation on the score.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        expectedRevision: z.number().int().positive().describe('Expected current score revision'),
        notationId: z.string().min(1).describe('The unique notation ID to edit'),
        updates: z.object({
          startMeasure: z.number().int().min(1).optional(),
          endMeasure: z.number().int().min(1).optional(),
          label: z.string().max(100).optional(),
          body: z.string().max(2000).optional(),
          kind: z.enum(['chord', 'modulation', 'voice-leading', 'explanation']).optional(),
          chordSymbol: z.string().max(40).optional(),
          romanNumeral: z.string().max(40).optional(),
        }).describe('Fields to update'),
      },
    },

    delete_notations: {
      title: 'Delete notations',
      description: 'Delete one or more notations by their IDs.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        expectedRevision: z.number().int().positive().describe('Expected current score revision'),
        notationIds: z.array(z.string().min(1)).min(1).describe('Array of notation IDs to delete'),
      },
    },

    list_notations: {
      title: 'List notations',
      description: 'List all notations for a score document or within a measure span.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        startMeasure: z.number().int().min(1).optional().describe('Optional start measure filter'),
        endMeasure: z.number().int().min(1).optional().describe('Optional end measure filter'),
      },
    },
  };

  return { handlers, schemas };
};
