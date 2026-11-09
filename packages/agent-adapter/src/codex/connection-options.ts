import type { ProviderEnvironment } from '../provider.js';

export function codexConnectionOptions(environment: ProviderEnvironment): { args: string[]; env: ProviderEnvironment['env'] } {
  const c = environment.connection;
  if (!c) return { args: [], env: environment.env };
  const env = { ...environment.env };
  for (const key of ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_API_KEY', 'OPENAI_ORG_ID', 'OPENAI_ORGANIZATION', 'OPENAI_PROJECT_ID']) delete env[key];
  env.AI_STUDIO_CODEX_API_KEY = c.apiKey;
  const table = `{ name = "AI Studio", base_url = ${JSON.stringify(c.baseUrl)}, env_key = "AI_STUDIO_CODEX_API_KEY", wire_api = "responses", requires_openai_auth = false }`;
  const args = ['-c', 'model_provider="ai_studio"', '-c', `model_providers.ai_studio=${table}`];
  if (c.model) args.push('-c', `model=${JSON.stringify(c.model)}`);
  return { args, env };
}
