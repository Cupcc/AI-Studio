import { adapterError } from './errors.js';
import type { AgentProvider } from './provider.js';
import type { ProviderId } from './types.js';

/** Provider lookup by id; new CLIs register here without changes to the core (04 §6). */
export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, AgentProvider>();

  register(provider: AgentProvider): void {
    if (this.providers.has(provider.id)) {
      throw adapterError('invalid_argument', `Provider ${provider.id} is already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: ProviderId): AgentProvider {
    const provider = this.providers.get(id);
    if (!provider) throw adapterError('unsupported', `Unknown provider ${id}`);
    return provider;
  }

  has(id: ProviderId): boolean {
    return this.providers.has(id);
  }

  list(): AgentProvider[] {
    return [...this.providers.values()];
  }

  /**
   * App quit: disposes every provider, which disposes all of its live sessions and runtimes. Every
   * provider is attempted; rejects with an AggregateError (one entry per provider) when any exit
   * stays unconfirmed, so a final shutdown never reports success over a surviving Runtime.
   */
  async shutdownAll(): Promise<void> {
    const results = await Promise.allSettled([...this.providers.values()].map((provider) => provider.dispose()));
    const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Provider shutdown failed');
  }
}
