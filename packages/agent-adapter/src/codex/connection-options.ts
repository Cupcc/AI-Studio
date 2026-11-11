import type { ProviderConnection, ProviderEnvironment } from '../provider.js';
import type { Config } from './protocol/v2/Config.js';
import type { JsonValue } from './protocol/serde_json/JsonValue.js';

export function codexConnectionOptions(environment: ProviderEnvironment, config?: Config): { args: string[]; env: ProviderEnvironment['env'] } {
  if (!environment.connection) return { args: [], env: environment.env };
  const overrides = config ? codexConnectionConfig(environment.connection, config) : {};
  const args = Object.entries(overrides).flatMap(([key, value]) => ['-c', `${key}=${toml(value)}`]);
  return { args, env: { ...environment.env, AI_STUDIO_CODEX_API_KEY: environment.connection.apiKey } };
}

/** Clone the effective provider's transport settings; replace only its endpoint and credentials. */
export function codexConnectionConfig(connection: ProviderConnection, config: Config): Record<string, JsonValue> {
  const providers = config.model_providers;
  const provider = providers && typeof providers === 'object' && !Array.isArray(providers)
    ? providers[config.model_provider ?? 'openai'] : undefined;
  const inherited: Record<string, JsonValue> = {};
  if (provider && typeof provider === 'object' && !Array.isArray(provider)) {
    for (const [key, value] of Object.entries(provider)) if (value != null) inherited[key] = value;
  }
  for (const key of ['env_key', 'env_key_instructions', 'experimental_bearer_token', 'requires_openai_auth', 'api_key_helper', 'auth', 'gateway_oauth', 'aws_auth', 'aws', 'credential_file']) delete inherited[key];
  // Authentication headers from the previous endpoint must not accompany the replacement key.
  for (const field of ['http_headers', 'env_http_headers']) {
    const headers = inherited[field];
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      inherited[field] = Object.fromEntries(Object.entries(headers).filter(([key]) => !['authorization', 'x-api-key', 'api-key'].includes(key.toLowerCase())));
    }
  }
  return { model_provider: 'ai_studio', model_providers: { ai_studio: {
    ...inherited, name: inherited.name ?? 'AI Studio', base_url: connection.baseUrl,
    env_key: 'AI_STUDIO_CODEX_API_KEY', requires_openai_auth: false,
  } } };
}

function toml(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(toml).join(', ')}]`;
  if (value && typeof value === 'object') return `{ ${Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] != null).map(([key, item]) => `${JSON.stringify(key)} = ${toml(item)}`).join(', ')} }`;
  return JSON.stringify(value);
}
