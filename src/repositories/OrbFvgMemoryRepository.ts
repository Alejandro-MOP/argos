import { randomUUID } from 'crypto';
import type {
  OrbFvgSignalFilters,
  OrbFvgSignalLevelSnapshot,
  OrbFvgSignalSnapshot,
  OrbFvgSignalWithLevels,
  PersistedOrbFvgSignalSnapshot,
} from '../models/OrbFvgSignal';
import type { OrbFvgSaveResult, OrbFvgSignalRepository } from '../ports/OrbFvgSignalRepository';

export class OrbFvgMemoryRepository implements OrbFvgSignalRepository {
  private readonly signals = new Map<string, PersistedOrbFvgSignalSnapshot>();
  private readonly levels = new Map<string, OrbFvgSignalLevelSnapshot[]>();

  public async saveIfNotDuplicate(signal: OrbFvgSignalSnapshot, levels: OrbFvgSignalLevelSnapshot[]): Promise<OrbFvgSaveResult> {
    const duplicate = [...this.signals.values()].find((existing) =>
      existing.ticker === signal.ticker &&
      existing.sessionDate === signal.sessionDate &&
      existing.direction === signal.direction &&
      existing.experimentVersion === signal.experimentVersion &&
      existing.breakoutCandle.timestamp.getTime() === signal.breakoutCandle.timestamp.getTime(),
    );

    if (duplicate) {
      return { inserted: false, signal: duplicate };
    }

    const id = signal.id ?? randomUUID();
    const now = new Date();
    const persisted = { ...signal, id, createdAt: now, updatedAt: now };
    this.signals.set(id, persisted);
    this.levels.set(id, levels.map((level) => ({ ...level, id: level.id ?? randomUUID(), orbFvgSignalId: id, createdAt: now, updatedAt: now })));

    return { inserted: true, signal: persisted };
  }

  public async findOpen(limit = 100): Promise<PersistedOrbFvgSignalSnapshot[]> {
    return [...this.signals.values()]
      .filter((signal) => signal.status === 'OPEN')
      .sort((left, right) => left.signalAt.getTime() - right.signalAt.getTime())
      .slice(0, limit);
  }

  public async updateForwardState(signal: OrbFvgSignalSnapshot): Promise<void> {
    if (!signal.id) {
      return;
    }
    const existing = this.signals.get(signal.id);
    if (!existing) {
      return;
    }
    this.signals.set(signal.id, { ...existing, ...signal, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date() });
  }

  public async claimLevelTrigger(signalId: string, rMultiple: number, triggeredAt: Date): Promise<boolean> {
    const levels = this.levels.get(signalId) ?? [];
    const level = levels.find((item) => item.rMultiple === rMultiple);
    if (!level || level.triggeredAt) {
      return false;
    }
    level.triggeredAt = triggeredAt;
    level.updatedAt = new Date();
    return true;
  }

  public async find(filters: OrbFvgSignalFilters = {}): Promise<OrbFvgSignalWithLevels[]> {
    return [...this.signals.values()]
      .filter((signal) => !filters.sessionDate || signal.sessionDate === filters.sessionDate)
      .filter((signal) => !filters.ticker || signal.ticker === filters.ticker.toUpperCase())
      .filter((signal) => !filters.assetType || signal.assetType === filters.assetType)
      .filter((signal) => !filters.direction || signal.direction === filters.direction)
      .filter((signal) => !filters.status || signal.status === filters.status)
      .filter((signal) => !filters.experimentVersion || signal.experimentVersion === filters.experimentVersion)
      .sort((left, right) => right.signalAt.getTime() - left.signalAt.getTime())
      .slice(0, filters.limit ?? 100)
      .map((signal) => ({ signal, levels: this.levels.get(signal.id) ?? [] }));
  }
}

