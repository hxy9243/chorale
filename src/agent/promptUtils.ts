import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type {
  Api,
  AssistantMessage,
  Message,
  Model,
  Usage,
} from '@earendil-works/pi-ai';
import type { ChatMessage, MusicContextSnapshot } from './types';

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
): string => {
  const parts: string[] = [
    CONTEXT_START,
    `file=${JSON.stringify(snapshot.fileName)}`,
    `revision=${snapshot.revision}`,
    `capturedAt=${snapshot.capturedAt}`,
  ];

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

      const relevantAnnotations = snapshot.annotations.filter(
        (a) => a.span.startMeasure <= endMeasure && a.span.endMeasure >= startMeasure,
      );
      if (relevantAnnotations.length > 0) {
        const annotationLines = relevantAnnotations.map((a) => {
          if (a.kind === 'chord') {
            return `- [m. ${a.span.startMeasure}] chord: ${a.chordSymbol}${a.romanNumeral ? ` (${a.romanNumeral})` : ''} - ${a.label}`;
          }
          return `- [mm. ${a.span.startMeasure}–${a.span.endMeasure}] ${a.kind}: ${a.label} - ${a.body}`;
        });
        parts.push(`existingAnnotationsInSelection:\n${annotationLines.join('\n')}`);
      }

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
): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text: message.content }],
  api: model.api,
  provider: model.provider,
  model: model.id,
  usage: EMPTY_USAGE,
  stopReason: message.status === 'stopped' ? 'aborted' : 'stop',
  timestamp: Date.parse(message.createdAt),
});

export const toAgentHistory = (
  messages: ChatMessage[],
  model: Model<Api>,
): AgentMessage[] => (
  messages.flatMap<AgentMessage>((message) => {
    if (!message.content.trim() || message.status === 'error' || message.status === 'streaming') {
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
