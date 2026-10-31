import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { analyzeHarmonyWithMusic21 } from '../../music21.mjs';
import { analyzeMusic21Python } from '../../music21-python.mjs';
import { PluginError } from '../../store.mjs';
import { extractHarmonicSlices } from '../../music/score-semantics.mjs';
import {
  deleteMeasures as deleteMeasuresOps,
  insertMeasures as insertMeasuresOps,
  replaceMeasures as replaceMeasuresOps,
  sliceMeasureRange,
} from '../../utils/measure-ops.mjs';

const result = (structuredContent, text) => ({
  structuredContent,
  content: [{ type: 'text', text }],
});

const failure = (error) => ({
  isError: true,
  structuredContent: { errorCode: error?.code || 'OPERATION_FAILED' },
  content: [{ type: 'text', text: error instanceof Error ? error.message : 'Sheet operation failed.' }],
});

const MAX_HARMONY_MEASURES = 16;

const chordPositionSchema = z.object({
  measure: z.number().int().positive(),
  offset: z.object({ numerator: z.number().int().nonnegative(), denominator: z.number().int().positive() }),
}).describe('Exact chord onset: written measure and rational offset in whole-note units within that measure.');

// Match the persisted annotation contract so successful MCP writes remain visible
// after the renderer normalizes the document.
const validateNotation = (notation) => {
  const { startMeasure, endMeasure } = notation.span;
  if (!Number.isSafeInteger(startMeasure) || !Number.isSafeInteger(endMeasure) || startMeasure < 1 || endMeasure < startMeasure) {
    throw new PluginError('INVALID_NOTATION', 'Saved notation spans start at measure 1; endMeasure must be >= startMeasure.');
  }
  if (typeof notation.label !== 'string' || !notation.label.trim()) {
    throw new PluginError('INVALID_NOTATION', 'Notation label must not be empty.');
  }
  if (notation.kind === 'chord') {
    if (typeof notation.chordSymbol !== 'string' || !notation.chordSymbol.trim()) {
      throw new PluginError('INVALID_NOTATION', 'Chord notation requires a non-empty chordSymbol.');
    }
    const { measure, offset } = notation.position || {};
    if (!Number.isSafeInteger(measure) || measure < startMeasure || measure > endMeasure
      || !Number.isSafeInteger(offset?.numerator) || offset.numerator < 0
      || !Number.isSafeInteger(offset?.denominator) || offset.denominator < 1) {
      throw new PluginError('INVALID_NOTATION', 'Chord position must be inside its span with a non-negative rational offset.');
    }
  } else {
    delete notation.position;
    delete notation.chordSymbol;
    delete notation.romanNumeral;
  }
  return notation;
};

export const createSheetManagementTools = (store, views, options = {}) => {
  const analyzeHarmony = options.analyzeHarmony || analyzeHarmonyWithMusic21;
  const resolvePassage = async ({ documentId, viewId, startMeasure, endMeasure, voiceId, expectedRevision }) => {
    let view;
    if (viewId) view = views.require(viewId);
    else if (!documentId || startMeasure === undefined) {
      try { view = views.resolve(); } catch { /* Headless calls use explicit inputs or the first score. */ }
    }
    documentId ||= view?.documentId || (await store.getWorkspace()).documents[0]?.id;
    if (!documentId) throw new PluginError('DOCUMENT_NOT_FOUND', 'No score document specified or currently active.');
    const doc = await store.require(documentId);
    if (expectedRevision !== undefined && doc.revision !== expectedRevision) {
      throw new PluginError('REVISION_CONFLICT', 'The score changed. Read the passage again before analysis.');
    }
    const selection = startMeasure === undefined && view?.documentId === documentId ? view.selection : null;
    if (selection && view.revision !== doc.revision) {
      throw new PluginError('REVISION_CONFLICT', 'The selected view is stale. Refresh the score selection or specify an explicit measure range.');
    }
    const start = startMeasure ?? selection?.startMeasure ?? 1;
    const end = endMeasure ?? selection?.endMeasure ?? start;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
      throw new PluginError('INVALID_RANGE', 'Choose an ordered range of non-negative written measures.');
    }
    return { doc, start, end, voiceId: voiceId ?? selection?.voiceId, viewId: selection ? view.viewId : undefined };
  };
  const handlers = {
    analyze_music21: async ({ documentId, startMeasure, endMeasure, code, expectedRevision, viewId }) => {
      try {
        const { doc, start, end } = await resolvePassage({ documentId, viewId, startMeasure, endMeasure, expectedRevision });
        const analysis = await (options.analyzeMusic21 || analyzeMusic21Python)({
          documentId: doc.id, revision: doc.revision, abcSource: doc.abcSource, startMeasure: start, endMeasure: end, code,
        });
        return result(analysis, `Computed sandboxed music21 evidence for written measures ${start}–${end}.`);
      } catch (error) { return failure(error); }
    },
    read_measure: async ({ documentId, startMeasure, endMeasure, voiceId, viewId }) => {
      try {
        const resolved = await resolvePassage({ documentId, startMeasure, endMeasure, voiceId, viewId });
        const { doc, start, end } = resolved;
        const sliced = sliceMeasureRange(doc.abcSource, start, end, resolved.voiceId);

        const scoreTitle = doc.title || doc.scoreInfo?.title || doc.name || 'Untitled score';
        return result({
          documentId: doc.id,
          title: scoreTitle,
          revision: doc.revision,
          range: { startMeasure: start, endMeasure: end, voiceId: resolved.voiceId || null },
          ...(resolved.viewId ? { viewId: resolved.viewId } : {}),
          abcSource: sliced.selectedAbc,
          measureCount: sliced.measureCount,
        }, `Read measures ${start}–${end} of "${scoreTitle}".`);
      } catch (error) {
        return failure(error);
      }
    },

    analyze_harmony: async ({ documentId, startMeasure, endMeasure, viewId }) => {
      try {
        const { doc, start, end } = await resolvePassage({ documentId, startMeasure, endMeasure, viewId });
        if (end - start + 1 > MAX_HARMONY_MEASURES) {
          throw new PluginError('ANALYSIS_RANGE_TOO_LARGE', `analyze_harmony accepts at most ${MAX_HARMONY_MEASURES} written measures per call.`);
        }

        const extracted = extractHarmonicSlices(doc.abcSource, start, end);
        const analysis = await analyzeHarmony({
          passageKey: extracted.passageKey,
          slices: extracted.slices,
        });
        const scoreTitle = doc.title || doc.scoreInfo?.title || doc.name || 'Untitled score';
        return result({
          documentId: doc.id,
          title: scoreTitle,
          revision: doc.revision,
          range: { startMeasure: start, endMeasure: end },
          measureCount: extracted.measureCount,
          ...analysis,
        }, `Generated fallible music21 harmony evidence for measures ${start}–${end} of "${scoreTitle}". Verify every candidate against the written score.`);
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

    edit_measures: async ({ documentId, startMeasure, endMeasure, replacementAbc, summary = 'Edit measures', expectedRevision }) => {
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

    edit_measure: async (args) => handlers.edit_measures(args),

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
        if (!Array.isArray(notations) || notations.length === 0) {
          throw new PluginError('INVALID_PARAMS', 'notations must be a non-empty array.');
        }

        const newAnnotations = notations.map((notation) => {
          const startMeasure = Number.isInteger(notation.startMeasure) ? notation.startMeasure : undefined;
          const endMeasure = Number.isInteger(notation.endMeasure) ? notation.endMeasure : startMeasure;

          const kind = notation.kind || (notation.chordSymbol ? 'chord' : 'explanation');
          if (!['chord', 'modulation', 'voice-leading', 'explanation'].includes(kind)) {
            throw new PluginError('INVALID_NOTATION', `Invalid notation kind "${kind}".`);
          }

          if (kind === 'chord' && (!notation.chordSymbol || typeof notation.chordSymbol !== 'string' || !notation.chordSymbol.trim())) {
            throw new PluginError('INVALID_NOTATION', 'Chord notation requires a non-empty chordSymbol.');
          }

          const position = notation.position || (kind === 'chord' ? {
            measure: startMeasure,
            offset: { numerator: 0, denominator: 1 },
          } : undefined);

          const label = notation.label === undefined ? (notation.chordSymbol?.trim() || 'Note') : notation.label.trim();
          const body = typeof notation.body === 'string' && notation.body.trim().length > 0
            ? notation.body.trim()
            : (notation.chordSymbol ? `${notation.chordSymbol}${notation.romanNumeral ? ` (${notation.romanNumeral})` : ''}` : label);

          return validateNotation({
            id: `ann-${randomUUID().slice(0, 8)}`,
            startMeasure,
            endMeasure,
            span: {
              startMeasure,
              endMeasure,
            },
            label,
            body,
            source: notation.source === 'user' ? 'user' : 'assistant',
            kind,
            chordSymbol: notation.chordSymbol?.trim() || undefined,
            romanNumeral: notation.romanNumeral?.trim() || undefined,
            position,
            createdAt: now,
            updatedAt: now,
          });
        });

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

        const position = updates.position ?? (current.position ? {
          ...current.position,
          measure: current.position.measure + nextSpan.startMeasure - (current.span?.startMeasure ?? current.startMeasure),
        } : { measure: nextSpan.startMeasure, offset: { numerator: 0, denominator: 1 } });
        const updatedAnn = validateNotation({
          ...current,
          ...updates,
          startMeasure: nextSpan.startMeasure,
          endMeasure: nextSpan.endMeasure,
          span: nextSpan,
          position,
          updatedAt: now,
        });

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
          const end = Number.isInteger(endMeasure) ? endMeasure : startMeasure;
          annotations = annotations.filter((ann) => {
            const aStart = Number.isInteger(ann.startMeasure) ? ann.startMeasure : (ann.span?.startMeasure ?? 1);
            const aEnd = Number.isInteger(ann.endMeasure) ? ann.endMeasure : (ann.span?.endMeasure ?? aStart);
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
        startMeasure: z.number().int().min(0).optional().describe('Starting measure number (0 for pickup, 1-indexed otherwise)'),
        endMeasure: z.number().int().min(0).optional().describe('Ending measure number (defaults to startMeasure)'),
        voiceId: z.string().optional().describe('Optional voice ID filter'),
        viewId: z.string().optional().describe('Optional view ID to read active selection from'),
      },
    },

    analyze_harmony: {
      title: 'Analyze harmony with music21',
      description: 'Return bounded, read-only music21 key and chord evidence for a written-measure range. Candidates are fallible and must be verified against the score before annotation.',
      inputSchema: {
        documentId: z.string().optional().describe('Score document ID (optional; defaults to active document)'),
        startMeasure: z.number().int().min(0).optional().describe('Starting written measure (0 for pickup, 1-indexed otherwise)'),
        endMeasure: z.number().int().min(0).optional().describe('Ending written measure, inclusive; maximum range is 16 measures'),
        viewId: z.string().optional().describe('Optional connected view whose active selection should be analyzed'),
      },
    },

    analyze_music21: {
      title: 'Run sandboxed music21 Python analysis',
      description: 'Read-only Python on already-read measures (max 16). Core helper: result=analyze(checks=[...], voice_order=[high-to-low IDs], profile="chorale" or "free"). Custom code has music21, score, events and measures; assign JSON to result. OS sandbox without host home/network; missing isolation fails closed. Options and coverage: music21 skill reference.',
      inputSchema: {
        documentId: z.string().optional(),
        startMeasure: z.number().int().min(0).optional(),
        endMeasure: z.number().int().min(0).optional(),
        code: z.string().min(1).max(16000).describe('Python code using music21/score/events/measures; assign a JSON-serializable value to result.'),
        expectedRevision: z.number().int().positive().optional(),
        viewId: z.string().optional(),
      },
    },

    insert_measure: {
      title: 'Insert measures',
      description: 'Insert new measure(s) before or after a measure in the score.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        targetMeasure: z.number().int().min(0).describe('Target measure number (0 for pickup, 1-indexed otherwise)'),
        position: z.enum(['before', 'after']).optional().describe('Insertion position relative to target measure (default "after")'),
        count: z.number().int().min(1).max(64).optional().describe('Number of measures to insert (default 1)'),
        abcContent: z.string().optional().describe('Optional ABC notation content for the inserted measures'),
        expectedRevision: z.number().int().positive().describe('Expected current score revision'),
      },
    },

    edit_measures: {
      title: 'Edit measures',
      description: 'Replace written measures across a specified span with new ABC notation (supports variable measure lengths).',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        startMeasure: z.number().int().min(0).describe('Start measure number (0 for pickup, 1-indexed otherwise)'),
        endMeasure: z.number().int().min(0).describe('End measure number'),
        replacementAbc: z.string().min(1).describe('Replacement ABC notation for the measures'),
        summary: z.string().optional().describe('Brief description of musical edits made'),
        expectedRevision: z.number().int().positive().describe('Expected current score revision'),
      },
    },

    edit_measure: {
      title: 'Edit measures (legacy alias)',
      description: 'Replace written measures across a specified span with new ABC notation (alias of edit_measures).',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID'),
        startMeasure: z.number().int().min(0).describe('Start measure number (0 for pickup, 1-indexed otherwise)'),
        endMeasure: z.number().int().min(0).describe('End measure number'),
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
        startMeasure: z.number().int().min(0).describe('Start measure number (0 for pickup, 1-indexed otherwise)'),
        endMeasure: z.number().int().min(0).describe('End measure number'),
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
          startMeasure: z.number().int().min(1).describe('Start measure (inclusive); saved annotations begin at measure 1'),
          endMeasure: z.number().int().min(1).optional().describe('End measure (inclusive)'),
          label: z.string().max(100).describe('Short label or title'),
          body: z.string().max(2000).optional().describe('Analytical note or description'),
          kind: z.enum(['chord', 'modulation', 'voice-leading', 'explanation']).optional().describe('Kind of notation'),
          chordSymbol: z.string().max(40).optional().describe('Chord symbol (e.g. "Cmaj7", "G7", "Dm")'),
          romanNumeral: z.string().max(40).optional().describe('Roman numeral analysis (e.g. "I", "V7/V", "vi")'),
          position: chordPositionSchema.optional(),
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
          position: chordPositionSchema.optional(),
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
        startMeasure: z.number().int().min(0).optional().describe('Optional start measure filter'),
        endMeasure: z.number().int().min(0).optional().describe('Optional end measure filter'),
      },
    },
  };

  return { handlers, schemas };
};
