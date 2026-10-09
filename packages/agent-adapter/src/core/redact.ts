/**
 * Best-effort redaction for evidence files and logs (tasks/AGENTS.md evidence rules:
 * no credentials, authentication responses or email addresses). Not applied to text
 * shown to the user in the app.
 */
export function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-|sk_|agt_code|ghp_|gho_|xox[abp]-)[A-Za-z0-9_*.-]{6,}/g, '[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
}

/** Recursively redacts string leaves and drops keys that commonly hold secrets. */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 20) return '[truncated]';
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = /token|secret|password|api[-_]?key|authorization|cookie|email/i.test(key)
        ? '[redacted]'
        : redactDeep(item, depth + 1);
    }
    return result;
  }
  return value;
}
