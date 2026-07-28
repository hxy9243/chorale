# Settings & AI Provider Authentication Spec

Date: 2026-07-28  
Status: Design Target

## 1. Goal

Define the Settings interface and authentication pipeline for configuring the Pi Agent runtime, supporting custom API endpoints (OpenAI, Anthropic, Ollama, custom proxies) and direct ChatGPT subscription OAuth login.

## 2. Access & Placement

- **Settings Trigger**: Gear icon located in the primary Workspace Header bar.
- **Presentation**: Modal overlay or slide-out drawer preserving active document state in the background.
- **Tab Structure**:
  1. **AI & Agent**: Provider selection, API credentials, OAuth login status, model parameters.
  2. **Score & Audio**: Default zoom, playback instrument, auto-centering speed.
  3. **Storage & Workspace**: Clear local storage, export file backups, manage local revisions.

## 3. AI Provider Configuration

The agent runtime ([pi-agent-chat.md](./pi-agent-chat.md)) consumes a dynamic provider configuration configured through the Settings panel.

### Mode A: Custom API Key & Base URL

- **Supported Provider Types**:
  - `openai-compatible`: Custom URL (e.g. `https://api.openai.com/v1` or proxy), API key, model ID (e.g. `gpt-4o`, `gpt-4o-mini`).
  - `anthropic`: Anthropic API key, model ID (e.g. `claude-3-5-sonnet-20241022`).
  - `ollama-local`: Local LLM endpoint (e.g. `http://localhost:11434/v1`), model ID (e.g. `deepseek-r1`, `llama3.2`).
  - `openrouter`: OpenRouter API key and model identifier.
- **Form Controls**:
  - Provider Dropdown (`OpenAI`, `Anthropic`, `Ollama / Local`, `OpenRouter`, `Custom Endpoint`).
  - Base URL Field (auto-populated defaults per provider with custom override).
  - Secret API Key Input (masked with visibility toggle).
  - Model Name Selector / Custom String Input.
- **Validation**: "Test Connection" action that executes a lightweight streaming ping using `@earendil-works/pi-agent-core`.

### Mode B: ChatGPT Subscription Login (OAuth)

- **OAuth PKCE Integration**:
  - "Sign in with ChatGPT / OpenAI" primary CTA button.
  - Opens secure browser popup or system browser for OAuth authorization.
  - Redirect callback handles PKCE code exchange for access token & refresh token.
- **Session State**:
  - Displays authenticated user profile badge, account type (e.g. ChatGPT Plus / Team), and expiration readout.
  - "Sign Out" action clears cached access/refresh tokens and reverts to mock/API key mode.

## 4. Credential Persistence & Security Boundaries

- **Browser Environment**: Credentials stored in `localStorage` (`chorale.settings.ai_provider`). API keys are scoped exclusively to agent request construction.
- **Electron Environment**: API keys and OAuth refresh tokens stored via Electron `safeStorage` encrypted keychain APIs.
- **Fallback Behavior**: When no key or login is present, the agent operates in `mock` mode using deterministic grounded responses ([pi-agent-feasibility.md](./pi-agent-feasibility.md)).

## 5. Agent Integration Contract

```typescript
export type AIProviderConfig =
  | { mode: 'mock' }
  | {
      mode: 'api-key';
      provider: 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'custom';
      baseUrl: string;
      apiKey: string;
      model: string;
    }
  | {
      mode: 'chatgpt-oauth';
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      model: string;
    };
```
