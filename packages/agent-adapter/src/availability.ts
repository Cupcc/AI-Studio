import { type AdapterErrorInfo } from './errors.js';
import type {
  AvailabilityReport,
  AvailabilityStatus,
  CheckResult,
  ExecutableInfo,
  LoginInfo,
  ModelCatalog,
  VersionInfo,
} from './provider.js';
import type { ProviderId } from './types.js';

/**
 * Derives the summary status from the four independent checks so every provider reports
 * "not installed / not logged in / available" the same way (UX §6 New Chat item 4).
 *
 * - executable failed → not_installed
 * - version unsupported → unsupported_version
 * - login logged_out (or failed with auth_required) → not_logged_in
 * - any other failed check except models → error
 * - otherwise available (a failed model catalog alone does not block; it is reported separately)
 */
export function deriveAvailabilityStatus(parts: {
  executable: CheckResult<ExecutableInfo>;
  version: CheckResult<VersionInfo>;
  login: CheckResult<LoginInfo>;
  models: CheckResult<ModelCatalog>;
}): { status: AvailabilityStatus; reason?: AdapterErrorInfo } {
  if (parts.executable.status === 'failed') return { status: 'not_installed', reason: parts.executable.error };
  if (parts.executable.status === 'skipped') {
    return { status: 'not_installed', reason: { code: 'not_installed', message: parts.executable.reason } };
  }
  if (parts.version.status === 'ok' && parts.version.value.compatibility === 'unsupported') {
    return {
      status: 'unsupported_version',
      reason: {
        code: 'unsupported_version',
        message: `Version ${parts.version.value.version} is not supported${
          parts.version.value.testedVersions ? ` (tested: ${parts.version.value.testedVersions})` : ''
        }`,
      },
    };
  }
  if (parts.login.status === 'ok' && parts.login.value.state === 'logged_out') {
    return { status: 'not_logged_in', reason: { code: 'auth_required', message: 'The CLI is not logged in' } };
  }
  if (parts.login.status === 'failed' && parts.login.error.code === 'auth_required') {
    return { status: 'not_logged_in', reason: parts.login.error };
  }
  if (parts.version.status === 'failed') return { status: 'error', reason: parts.version.error };
  if (parts.login.status === 'failed') return { status: 'error', reason: parts.login.error };
  return { status: 'available' };
}

export function buildAvailabilityReport(
  providerId: ProviderId,
  parts: {
    executable: CheckResult<ExecutableInfo>;
    version: CheckResult<VersionInfo>;
    login: CheckResult<LoginInfo>;
    models: CheckResult<ModelCatalog>;
  },
  checkedAt: number = Date.now(),
): AvailabilityReport {
  const { status, reason } = deriveAvailabilityStatus(parts);
  const report: AvailabilityReport = { providerId, checkedAt, status, ...parts };
  if (reason) report.reason = reason;
  return report;
}

export function skipped<T>(reason: string): CheckResult<T> {
  return { status: 'skipped', reason };
}

export function ok<T>(value: T): CheckResult<T> {
  return { status: 'ok', value };
}

export function failed<T>(error: AdapterErrorInfo): CheckResult<T> {
  return { status: 'failed', error };
}
