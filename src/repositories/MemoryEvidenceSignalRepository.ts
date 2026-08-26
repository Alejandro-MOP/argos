import { randomUUID } from 'crypto';
import type {
  EvidenceSignalFilters,
  EvidenceSignalSnapshot,
  PersistedEvidenceSignalSnapshot,
} from '../models/EvidenceSignal';
import type { EvidenceSignalRepository } from '../ports/EvidenceSignalRepository';

export class MemoryEvidenceSignalRepository implements EvidenceSignalRepository {
  private readonly signals: PersistedEvidenceSignalSnapshot[] = [];

  public async saveIfNotDuplicate(
    signal: EvidenceSignalSnapshot,
    duplicateWindowMinutes: number,
  ): Promise<boolean> {
    const duplicateWindowMs = duplicateWindowMinutes * 60_000;
    const duplicate = this.signals.some((existing) =>
      existing.ticker === signal.ticker &&
      existing.timeframe === signal.timeframe &&
      existing.strategyVersion === signal.strategyVersion &&
      Math.abs(existing.detectedAt.getTime() - signal.detectedAt.getTime()) <= duplicateWindowMs,
    );

    if (duplicate) {
      return false;
    }

    this.signals.push({
      ...signal,
      id: signal.id ?? randomUUID(),
      createdAt: new Date(),
    });

    return true;
  }

  public async findPending(filters: EvidenceSignalFilters = {}): Promise<PersistedEvidenceSignalSnapshot[]> {
    const limit = filters.limit ?? 100;

    return this.signals
      .filter((signal) => !filters.evidenceSignalId || signal.id === filters.evidenceSignalId)
      .filter((signal) => !filters.ticker || signal.ticker === filters.ticker?.toUpperCase())
      .slice(0, limit);
  }

  public all(): PersistedEvidenceSignalSnapshot[] {
    return [...this.signals];
  }
}
