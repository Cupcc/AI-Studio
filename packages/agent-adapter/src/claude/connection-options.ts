import type { ProviderConnection } from '../provider.js';

/** Applied over stdin after native settings load; no credentials in argv or config files. */
export function claudeConnectionSettings(connection: ProviderConnection) {
  return { env: {
    ANTHROPIC_BASE_URL: connection.baseUrl,
    ANTHROPIC_API_KEY: connection.auth === 'api_key' ? connection.apiKey : '',
    ANTHROPIC_AUTH_TOKEN: connection.auth === 'bearer' ? connection.apiKey : '',
    CLAUDE_CODE_OAUTH_TOKEN: '', CLAUDE_CODE_BEARER_TOKEN: '',
    CLAUDE_CODE_USE_BEDROCK: '', CLAUDE_CODE_USE_VERTEX: '', CLAUDE_CODE_USE_FOUNDRY: '',
  } };
}
