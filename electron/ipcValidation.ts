import type {
  AISelection,
  SaveAIConnectionInput,
  SheetAgentRequest,
} from '../src/agent/aiTypes';
import { isAIProviderKind } from '../src/agent/aiTypes';

const MAX_CHAT_HISTORY = 200;
const MAX_ABC_LENGTH = 2_000_000;
const MAX_QUESTION_LENGTH = 20_000;
const MAX_HISTORY_CONTENT_LENGTH = 500_000;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isOptionalFiniteNumber = (value: unknown) => (
  value === undefined || (typeof value === 'number' && Number.isFinite(value))
);

const validateMusicContext = (value: unknown) => {
  if (
    isRecord(value) &&
    typeof value.abc === 'string' &&
    value.abc.length > MAX_ABC_LENGTH
  ) {
    throw new Error('Music context exceeds the supported limits.');
  }
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.revision !== 'number' ||
    !Number.isFinite(value.revision) ||
    value.revision < 0 ||
    typeof value.capturedAt !== 'string' ||
    typeof value.fileName !== 'string' ||
    value.fileName.length > 500 ||
    typeof value.abc !== 'string'
  ) {
    throw new Error('Invalid music context.');
  }
  if (value.selection !== undefined) {
    if (
      !isRecord(value.selection) ||
      !isOptionalFiniteNumber(value.selection.measureStart) ||
      !isOptionalFiniteNumber(value.selection.measureEnd)
    ) {
      throw new Error('Invalid music selection context.');
    }
    if (
      value.selection.abcRange !== undefined &&
      (
        !isRecord(value.selection.abcRange) ||
        !isOptionalFiniteNumber(value.selection.abcRange.start) ||
        !isOptionalFiniteNumber(value.selection.abcRange.end)
      )
    ) {
      throw new Error('Invalid ABC range context.');
    }
  }
  return value;
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
  validateMusicContext(value.context);
  let historyContentLength = 0;
  for (const message of value.history) {
    if (
      !isRecord(message) ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.id !== 'string' ||
      typeof message.content !== 'string' ||
      typeof message.createdAt !== 'string' ||
      (
        message.status !== undefined &&
        !['streaming', 'complete', 'stopped', 'error'].includes(String(message.status))
      )
    ) {
      throw new Error('Invalid chat history.');
    }
    historyContentLength += message.content.length;
    if (message.context !== undefined) {
      const historyContext = validateMusicContext(message.context);
      historyContentLength += String(historyContext.abc).length;
    }
    if (historyContentLength > MAX_HISTORY_CONTENT_LENGTH) {
      throw new Error('Chat history exceeds the supported limits.');
    }
  }
  return value as unknown as SheetAgentRequest;
};
