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

  /** App quit: disposes every provider, which disposes all of its live sessions and runtimes. */
  async shutdownAll(): Promise<void> {
    await Promise.allSettled([...this.providers.values()].map((provider) => provider.dispose()));
  }
}
