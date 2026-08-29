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
    duplicateWindowMinutes?: number,
  ): Promise<boolean> {
    void duplicateWindowMinutes;

    if (isDuplicateSignalIdentity(this.signals, signal)) {
      return false;
    }

    this.signals.push({
      ...signal,
      id: signal.id ?? randomUUID(),
      createdAt: new Date(),
      excludedFromResearch: false,
      reviewRequired: false,
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


const isDuplicateSignalIdentity = (
  signals: PersistedEvidenceSignalSnapshot[],
  signal: EvidenceSignalSnapshot,
): boolean => {
  if (!signal.signalCandleTimestamp) {
    return false;
  }

  return signals.some(
    (existing) =>
      existing.signalCandleTimestamp !== undefined &&
      existing.ticker === signal.ticker &&
      existing.timeframe === signal.timeframe &&
      existing.signalType === signal.signalType &&
      existing.strategyVersion === signal.strategyVersion &&
      existing.signalCandleTimestamp.getTime() === signal.signalCandleTimestamp?.getTime(),
  );
};
