import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type {
  Api,
  AssistantMessage,
  Message,
  Model,
  Usage,
} from '@earendil-works/pi-ai';
import type { ChatMessage, MusicContextSnapshot } from './types';
import type { Annotation } from '../types/document';

import {
  describeKeySignature,
  extractScore,
  type ExtractedScore,
} from '../music/scoreSnapshot';

const CONTEXT_START = '[CHORALE_MUSIC_CONTEXT]';
const CONTEXT_END = '[/CHORALE_MUSIC_CONTEXT]';

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

export const formatPrompt = (
  question: string,
  snapshot: MusicContextSnapshot,
  extracted?: ExtractedScore,
  automaticAnnotations: readonly Annotation[] = [],
): string => {
  const parts: string[] = [
    CONTEXT_START,
    `file=${JSON.stringify(snapshot.fileName)}`,
    `revision=${snapshot.revision}`,
    `capturedAt=${snapshot.capturedAt}`,
  ];

  const relevantAnnotations = snapshot.annotations.filter(a => !snapshot.selection
    || (a.span.startMeasure <= snapshot.selection.endMeasure && a.span.endMeasure >= snapshot.selection.startMeasure));
  if (relevantAnnotations.length) {
    const annotationLines = relevantAnnotations.slice(0, 24).map(a => {
      const details = a.kind === 'chord'
        ? `[m. ${a.position.measure}] chord: ${a.chordSymbol}${a.romanNumeral ? ` (${a.romanNumeral})` : ''} - ${a.label}`
        : `[mm. ${a.span.startMeasure}–${a.span.endMeasure}] ${a.kind}: ${a.label}`;
      return `- ${details} [id=${JSON.stringify(a.id)}, source=${a.source}${a.kind === 'chord' ? `, position=${JSON.stringify(a.position)}` : ''}] - ${a.body.slice(0, 200)}`;
    });
    parts.push(`${snapshot.selection ? 'existingAnnotationsInSelection' : 'existingAnnotations'}:\n${annotationLines.join('\n')}`);
    parts.push(`Annotation preview: ${annotationLines.length} of ${relevantAnnotations.length}. Call get_annotations for complete details in the target range before proposing additions.`);
  }
  const automaticReferences = automaticAnnotations.filter(a => !snapshot.selection
    || (a.span.startMeasure <= snapshot.selection.endMeasure && a.span.endMeasure >= snapshot.selection.startMeasure));
  if (automaticReferences.length) parts.push(`automaticAnalysisReferences (read-only suggestions, separate from saved annotations; do not duplicate):\n${
    JSON.stringify(automaticReferences.slice(0, 24).map(a => ({ id: a.id, kind: a.kind, span: a.span, label: a.label,
      ...(a.kind === 'chord' ? { position: a.position, chordSymbol: a.chordSymbol, romanNumeral: a.romanNumeral } : {}),
    })))
  }\nAutomatic reference preview: ${Math.min(24, automaticReferences.length)} of ${automaticReferences.length}. Use get_annotations for the full target range.`);

  try {
    const score = extracted ?? extractScore(snapshot.abc);
    const keyInfo = describeKeySignature(score.key);
    const totalMeasures = score.measures.length;
    const voices = score.voices.join(', ');

    parts.push(
      `scoreSummary: title=${JSON.stringify(score.title || 'Untitled')}, ` +
      `globalKey="${score.key || 'C'}" (${keyInfo.description}), ` +
      `meter="${score.meter || '4/4'}", ` +
      `totalMeasures=${totalMeasures}, ` +
      `voices=[${voices}]`,
    );

    if (snapshot.selection) {
      const { startMeasure, endMeasure } = snapshot.selection;
      const selected = score.measures.filter(
        (m) => m.measureNumber >= startMeasure && m.measureNumber <= endMeasure,
      );
      const activeKey = selected[0]?.activeKey || score.key || 'C';
      const activeKeyInfo = describeKeySignature(activeKey);
      const activeMeter = selected[0]?.activeMeter || score.meter || '4/4';

      parts.push(
        `selection: mm. ${startMeasure}–${endMeasure} | activeKey="${activeKey}" (${activeKeyInfo.description}) | activeMeter="${activeMeter}"`,
      );

      const measureSlices = selected.map((m) => `[m. ${m.measureNumber}]\n${m.abcSlice}`).join('\n');
      parts.push(`selectedMeasuresAbc:\n${measureSlices}`);
    } else if (totalMeasures <= 24) {
      parts.push(`abc:\n${snapshot.abc}`);
    } else {
      const preview = score.measures.slice(0, 8).map((m) => `[m. ${m.measureNumber}]\n${m.abcSlice}`).join('\n');
      parts.push(
        `initialMeasuresPreview:\n${preview}\n\n(Note: Score has ${totalMeasures} measures. Call read_measure_range to inspect additional passages.)`,
      );
    }
  } catch {
    if (snapshot.selection) {
      parts.push(`selection=${JSON.stringify(snapshot.selection)}`);
    }
    parts.push(`abc:\n${snapshot.abc}`);
  }

  parts.push(CONTEXT_END);
  parts.push(`\nUser question: ${question}`);
  return parts.join('\n');
};

const assistantHistoryMessage = (
  message: ChatMessage,
  model: Model<Api>,
): AssistantMessage => {
  const visibleText = message.parts && message.parts.length > 0
    ? message.parts
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('')
    : message.content;

  return {
    role: 'assistant',
    content: [{ type: 'text', text: visibleText }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: EMPTY_USAGE,
    stopReason: message.status === 'stopped' ? 'aborted' : 'stop',
    timestamp: Date.parse(message.createdAt),
  };
};

export const toAgentHistory = (
  messages: ChatMessage[],
  model: Model<Api>,
): AgentMessage[] => (
  messages.flatMap<AgentMessage>((message) => {
    const visibleText = message.parts && message.parts.length > 0
      ? message.parts
          .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
          .map((part) => part.text)
          .join('')
      : message.content;
    if (!visibleText.trim() || message.status === 'error' || message.status === 'streaming') {
      return [];
    }
    if (message.role === 'user') {
      const content = message.context
        ? formatPrompt(message.content, message.context)
        : message.content;
      return [{ role: 'user', content, timestamp: Date.parse(message.createdAt) } as Message];
    }
    return [assistantHistoryMessage(message, model)];
  })
);
