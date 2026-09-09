import type {
  OrbFvgSignalFilters,
  OrbFvgSignalLevelSnapshot,
  OrbFvgSignalSnapshot,
  OrbFvgSignalWithLevels,
  PersistedOrbFvgSignalSnapshot,
} from '../models/OrbFvgSignal';

export interface OrbFvgSaveResult {
  inserted: boolean;
  signal?: PersistedOrbFvgSignalSnapshot;
}

export interface OrbFvgSignalRepository {
  saveIfNotDuplicate(signal: OrbFvgSignalSnapshot, levels: OrbFvgSignalLevelSnapshot[]): Promise<OrbFvgSaveResult>;
  findOpen(limit?: number): Promise<PersistedOrbFvgSignalSnapshot[]>;
  updateForwardState(signal: OrbFvgSignalSnapshot): Promise<void>;
  updateSetupState(signal: OrbFvgSignalSnapshot): Promise<void>;
  claimLevelTrigger(signalId: string, rMultiple: number, triggeredAt: Date): Promise<boolean>;
  find(filters?: OrbFvgSignalFilters): Promise<OrbFvgSignalWithLevels[]>;
}

