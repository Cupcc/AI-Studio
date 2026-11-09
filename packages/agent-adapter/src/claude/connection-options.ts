import type { ProviderEnvironment } from '../provider.js';

export function claudeConnectionEnvironment(environment: ProviderEnvironment): ProviderEnvironment['env'] {
  const c = environment.connection;
  if (!c) return environment.env;
  const env = { ...environment.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_CODE_USE_') || key === 'CLAUDE_CODE_OAUTH_TOKEN' || key === 'CLAUDE_CODE_API_KEY_HELPER_TTL_MS' || key === 'CLAUDE_CODE_BEARER_TOKEN') delete env[key];
  }
  env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST = '1';
  env.ANTHROPIC_BASE_URL = c.baseUrl;
  env[c.auth === 'bearer' ? 'ANTHROPIC_AUTH_TOKEN' : 'ANTHROPIC_API_KEY'] = c.apiKey;
  if (c.model) env.ANTHROPIC_MODEL = c.model;
  return env;
}
