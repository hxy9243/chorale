import type {
  AISelection,
  SaveAIConnectionInput,
  SheetAgentRequest,
  SheetAgentSteerRequest,
} from '../src/agent/aiTypes';
import { isAIProviderKind, isAIThinkingLevel } from '../src/agent/aiTypes';
import type { ChatMessage, ChatMessagePart, MusicContextSnapshot } from '../src/agent/types';
import type { Annotation, ScoreAnchor } from '../src/types/document';
import { normalizeAnnotation } from '../src/music/documentSchema';

const MAX_CHAT_HISTORY = 200;
const MAX_ABC_LENGTH = 2_000_000;
const MAX_QUESTION_LENGTH = 20_000;
const MAX_HISTORY_CONTENT_LENGTH = 500_000;
const MAX_CHAT_MESSAGE_PARTS = 2_000;
const MAX_ANNOTATIONS = 2_000;
const MAX_ANNOTATION_LABEL_LENGTH = 500;
const MAX_ANNOTATION_BODY_LENGTH = 50_000;
const MAX_MEASURE_NUMBER = 1_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const boundedString = (value: unknown, maximumLength: number) => (
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength
);

const optionalBoundedString = (value: unknown, maximumLength: number) => (
  value === undefined || boundedString(value, maximumLength)
);

const validateChatMessagePart = (value: unknown): { part: ChatMessagePart; contentLength: number } => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Invalid chat history parts.');
  }

  if (value.type === 'text') {
    if (typeof value.text !== 'string') throw new Error('Invalid chat history parts.');
    return { part: { type: 'text', text: value.text }, contentLength: value.text.length };
  }

  if (value.type === 'reasoning') {
    if (
      typeof value.text !== 'string'
      || (
        value.status !== undefined
        && !['streaming', 'complete', 'stopped'].includes(String(value.status))
      )
    ) {
      throw new Error('Invalid chat history parts.');
    }
    return {
      part: {
        type: 'reasoning',
        text: value.text,
        ...(value.status !== undefined
          ? { status: value.status as 'streaming' | 'complete' | 'stopped' }
          : {}),
      },
      contentLength: value.text.length,
    };
  }

  if (value.type === 'tool') {
    if (
      !boundedString(value.toolCallId, 300)
      || !boundedString(value.toolName, 300)
      || typeof value.summary !== 'string'
      || !['running', 'success', 'error'].includes(String(value.status))
      || (
        value.durationMs !== undefined
        && (
          typeof value.durationMs !== 'number'
          || !Number.isFinite(value.durationMs)
          || value.durationMs < 0
        )
      )
      || !optionalBoundedString(value.startTime, 100)
      || !optionalBoundedString(value.endTime, 100)
    ) {
      throw new Error('Invalid chat history parts.');
    }
    return {
      part: {
        type: 'tool',
        toolCallId: value.toolCallId as string,
        toolName: value.toolName as string,
        summary: value.summary,
        status: value.status as 'running' | 'success' | 'error',
        ...(value.durationMs !== undefined ? { durationMs: value.durationMs } : {}),
        ...(value.startTime !== undefined ? { startTime: value.startTime as string } : {}),
        ...(value.endTime !== undefined ? { endTime: value.endTime as string } : {}),
      },
      contentLength: value.summary.length,
    };
  }

  throw new Error('Invalid chat history parts.');
};

const validateAnchor = (value: unknown, allowLegacy = false): ScoreAnchor => {
  if (!isRecord(value)) throw new Error('Invalid music selection context.');
  const startMeasure = value.startMeasure ?? (allowLegacy ? value.measureStart : undefined);
  const endMeasure = value.endMeasure ?? (allowLegacy ? value.measureEnd ?? startMeasure : undefined);
  if (
    !Number.isSafeInteger(startMeasure)
    || !Number.isSafeInteger(endMeasure)
    || (startMeasure as number) <= 0
    || (endMeasure as number) < (startMeasure as number)
    || (endMeasure as number) > MAX_MEASURE_NUMBER
  ) {
    throw new Error('Invalid music selection context.');
  }

  const optionalFinite = (candidate: unknown) => (
    candidate === undefined || (typeof candidate === 'number' && Number.isFinite(candidate))
  );
  if (
    !optionalFinite(value.beat)
    || !optionalFinite(value.playbackSeconds)
    || !optionalFinite(value.playbackFraction)
    || (value.beat !== undefined && (value.beat as number) <= 0)
    || (value.playbackSeconds !== undefined && (value.playbackSeconds as number) < 0)
    || (
      value.playbackFraction !== undefined
      && ((value.playbackFraction as number) < 0 || (value.playbackFraction as number) > 1)
    )
    || (value.abcOffset !== undefined && (!Number.isSafeInteger(value.abcOffset) || (value.abcOffset as number) < 0))
    || (value.voiceId !== undefined && !boundedString(value.voiceId, 300))
    || (value.label !== undefined && !boundedString(value.label, 500))
  ) {
    throw new Error('Invalid music selection context.');
  }

  const legacyRange = allowLegacy && isRecord(value.abcRange) ? value.abcRange : undefined;
  const abcOffset = value.abcOffset ?? legacyRange?.start;
  return {
    startMeasure: startMeasure as number,
    endMeasure: endMeasure as number,
    ...(value.beat !== undefined ? { beat: value.beat as number } : {}),
    ...(value.voiceId !== undefined ? { voiceId: value.voiceId as string } : {}),
    ...(Number.isSafeInteger(abcOffset) && (abcOffset as number) >= 0
      ? { abcOffset: abcOffset as number }
      : {}),
    ...(value.playbackSeconds !== undefined
      ? { playbackSeconds: value.playbackSeconds as number }
      : {}),
    ...(value.playbackFraction !== undefined
      ? { playbackFraction: value.playbackFraction as number }
      : {}),
    ...(value.label !== undefined ? { label: value.label as string } : {}),
  };
};

const validateAnnotation = (value: unknown): Annotation => {
  const normalized = normalizeAnnotation(value);
  if (!normalized || !isRecord(value) || value.kind !== normalized.kind) {
    throw new Error('Invalid music annotation context.');
  }
  if (
    normalized.id.length > 300
    || normalized.createdAt.length > 100
    || normalized.updatedAt.length > 100
    || normalized.label.length > MAX_ANNOTATION_LABEL_LENGTH
    || normalized.body.length > MAX_ANNOTATION_BODY_LENGTH
    || normalized.span.endMeasure > MAX_MEASURE_NUMBER
    || (
      value.agentProfiles !== undefined
      && (
        !Array.isArray(value.agentProfiles)
        || value.agentProfiles.length !== normalized.agentProfiles?.length
      )
    )
    || (
      normalized.kind === 'chord'
      && (
        normalized.chordSymbol.length > 100
        || (normalized.romanNumeral?.length || 0) > 100
      )
    )
  ) {
    throw new Error('Invalid music annotation context.');
  }
  return normalized;
};

const validateMusicContext = (
  value: unknown,
  legacyDocumentId?: string,
): MusicContextSnapshot => {
  if (
    isRecord(value) &&
    typeof value.abc === 'string' &&
    value.abc.length > MAX_ABC_LENGTH
  ) {
    throw new Error('Music context exceeds the supported limits.');
  }
  if (
    !isRecord(value) ||
    !boundedString(value.id, 300) ||
    !(boundedString(value.documentId, 300) || legacyDocumentId) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) <= 0 ||
    !boundedString(value.capturedAt, 100) ||
    !boundedString(value.fileName, 500) ||
    typeof value.abc !== 'string'
  ) {
    throw new Error('Invalid music context.');
  }
  const allowLegacy = Boolean(legacyDocumentId);
  if (!allowLegacy && !Array.isArray(value.annotations)) {
    throw new Error('Invalid music annotation context.');
  }
  const rawAnnotations = Array.isArray(value.annotations) ? value.annotations : [];
  if (rawAnnotations.length > MAX_ANNOTATIONS) {
    throw new Error('Music annotation context exceeds the supported limits.');
  }
  return {
    id: value.id as string,
    documentId: boundedString(value.documentId, 300)
      ? value.documentId as string
      : legacyDocumentId!,
    revision: value.revision as number,
    capturedAt: value.capturedAt as string,
    fileName: value.fileName as string,
    abc: value.abc,
    ...(value.selection !== undefined
      ? { selection: validateAnchor(value.selection, allowLegacy) }
      : {}),
    annotations: rawAnnotations.map(validateAnnotation),
  };
};

export const assertShortId = (value: unknown, label: string) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 300) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
};

export const isAllowedRendererUrl = (senderUrl: string) => {
  let url: URL;
  try {
    url = new URL(senderUrl);
  } catch {
    return false;
  }
  return (
    (url.protocol === 'app:' && url.hostname === 'chorale') ||
    (
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      url.port === '5173'
    )
  );
};

export const validateSaveInput = (value: unknown): SaveAIConnectionInput => {
  if (!isRecord(value) || !isAIProviderKind(value.kind) || value.kind === 'openai-codex') {
    throw new Error('Invalid AI connection.');
  }
  const headers = value.headers;
  if (
    headers !== undefined &&
    (!isRecord(headers) || Object.values(headers).some((item) => typeof item !== 'string'))
  ) {
    throw new Error('Invalid custom headers.');
  }
  return {
    id: value.id === undefined ? undefined : assertShortId(value.id, 'connection ID'),
    name: typeof value.name === 'string' ? value.name : '',
    kind: value.kind,
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : undefined,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    headers: headers as Record<string, string> | undefined,
    clearHeaders: value.clearHeaders === true,
  };
};

export const validateSelection = (value: unknown): AISelection | null => {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error('Invalid AI selection.');
  return {
    connectionId: assertShortId(value.connectionId, 'connection ID'),
    modelId: assertShortId(value.modelId, 'model ID'),
  };
};

export const validateChatRequest = (value: unknown): SheetAgentRequest => {
  if (!isRecord(value) || !isRecord(value.context) || !Array.isArray(value.history)) {
    throw new Error('Invalid chat request.');
  }
  if (
    typeof value.question !== 'string' ||
    value.question.length > MAX_QUESTION_LENGTH ||
    value.history.length > MAX_CHAT_HISTORY
  ) {
    throw new Error('Chat request exceeds the supported limits.');
  }
  const context = validateMusicContext(value.context);
  let historyContentLength = 0;
  let historyPartCount = 0;
  const history: ChatMessage[] = [];
  for (const message of value.history) {
    if (
      !isRecord(message) ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      !boundedString(message.id, 300) ||
      typeof message.content !== 'string' ||
      !boundedString(message.createdAt, 100) ||
      (
        message.status !== undefined &&
        !['streaming', 'complete', 'stopped', 'error'].includes(String(message.status))
      )
    ) {
      throw new Error('Invalid chat history.');
    }
    historyContentLength += message.content.length;
    let parts: ChatMessagePart[] | undefined;
    if (message.parts !== undefined) {
      if (!Array.isArray(message.parts)) {
        throw new Error('Invalid chat history parts.');
      }
      historyPartCount += message.parts.length;
      if (historyPartCount > MAX_CHAT_MESSAGE_PARTS) throw new Error('Invalid chat history parts.');
      parts = message.parts.map((part) => {
        const validated = validateChatMessagePart(part);
        historyContentLength += validated.contentLength;
        return validated.part;
      });
    }
    let messageContext: MusicContextSnapshot | undefined;
    if (message.context !== undefined) {
      messageContext = validateMusicContext(message.context, context.documentId);
      historyContentLength += messageContext.abc.length;
    }
    if (historyContentLength > MAX_HISTORY_CONTENT_LENGTH) {
      throw new Error('Chat history exceeds the supported limits.');
    }
    history.push({
      id: message.id as string,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt as string,
      ...(message.status !== undefined
        ? { status: message.status as 'streaming' | 'complete' | 'stopped' | 'error' }
        : {}),
      ...(parts ? { parts } : {}),
      ...(messageContext ? { context: messageContext } : {}),
    });
  }
  const thinkingLevel = value.thinkingLevel ?? 'off';
  if (!isAIThinkingLevel(thinkingLevel)) throw new Error('Invalid thinking level.');
  return {
    question: value.question,
    history,
    context,
    thinkingLevel,
  };
};

export const validateSteerRequest = (
  requestIdValue: unknown,
  steerValue: unknown,
): { requestId: string; steer: SheetAgentSteerRequest } => {
  const requestId = assertShortId(requestIdValue, 'request ID');
  if (!isRecord(steerValue)) {
    throw new Error('Invalid steer request.');
  }
  const messageId = assertShortId(steerValue.messageId, 'message ID');
  if (
    typeof steerValue.question !== 'string' ||
    steerValue.question.length > MAX_QUESTION_LENGTH
  ) {
    throw new Error('Steer request exceeds the supported limits.');
  }
  const context = validateMusicContext(steerValue.context);
  return {
    requestId,
    steer: {
      messageId,
      question: steerValue.question,
      context,
    },
  };
};
