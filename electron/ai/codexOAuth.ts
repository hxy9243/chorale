import { shell } from 'electron';
import { createModels, type Credential } from '@earendil-works/pi-ai';
import type { AIModelOption, OAuthUpdateDetails } from '../../src/agent/aiTypes';
import { getCodexProvider } from './providers';

export type CodexOAuthResult = {
  credential: Credential;
  models: AIModelOption[];
};

export type CodexOAuthAdapter = {
  login(
    signal: AbortSignal,
    notify: (details: OAuthUpdateDetails) => void,
  ): Promise<CodexOAuthResult>;
  openVerificationUrl(url: string): Promise<void>;
};

const assertHttpsOpenAIUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !(
    url.hostname === 'auth.openai.com' ||
    url.hostname.endsWith('.openai.com')
  )) {
    throw new Error('Refused to open an unexpected OAuth URL.');
  }
  return url.toString();
};

export class ElectronCodexOAuthAdapter implements CodexOAuthAdapter {
  async login(
    signal: AbortSignal,
    notify: (details: OAuthUpdateDetails) => void,
  ): Promise<CodexOAuthResult> {
    const provider = getCodexProvider();
    const models = createModels();
    models.setProvider(provider);
    const credential = await models.login('openai-codex', 'oauth', {
      signal,
      prompt: async (prompt) => {
        if (prompt.type === 'select') return 'device_code';
        throw new Error(`Unexpected Codex OAuth prompt: ${prompt.type}`);
      },
      notify: (event) => {
        if (event.type === 'device_code') {
          notify({
            verificationUri: event.verificationUri,
            userCode: event.userCode,
            expiresInSeconds: event.expiresInSeconds,
          });
        } else if (event.type === 'progress' || event.type === 'info') {
          notify({ message: event.message });
        }
      },
    });
    return {
      credential,
      models: provider.getModels().map((model) => ({
        id: model.id,
        name: model.name || model.id,
        source: 'pi-catalog' as const,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        reasoning: model.reasoning,
      })),
    };
  }

  openVerificationUrl(value: string) {
    return shell.openExternal(assertHttpsOpenAIUrl(value));
  }
}
