import { randomUUID } from 'crypto';
import type { ForwardSignalSnapshot, PersistedForwardSignalSnapshot } from '../models/ForwardSignal';
import type { ForwardSignalFilters, ForwardSignalRepository } from '../ports/ForwardSignalRepository';

export class MemoryForwardSignalRepository implements ForwardSignalRepository {
  private readonly signals: PersistedForwardSignalSnapshot[] = [];

  public async save(signal: ForwardSignalSnapshot): Promise<void> {
    this.signals.push({ ...signal, id: signal.id ?? randomUUID() });
  }

  public async findAll(): Promise<PersistedForwardSignalSnapshot[]> {
    return this.signals.map((signal) => ({ ...signal }));
  }

  public async findPending(filters: ForwardSignalFilters = {}): Promise<PersistedForwardSignalSnapshot[]> {
    return this.signals
      .filter((signal) => !filters.signalId || signal.id === filters.signalId)
      .filter((signal) => !filters.ticker || signal.ticker === filters.ticker.toUpperCase())
      .slice(0, filters.limit)
      .map((signal) => ({ ...signal }));
  }
}
