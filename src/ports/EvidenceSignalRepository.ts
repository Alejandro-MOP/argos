import type { EvidenceSignalFilters, EvidenceSignalSnapshot, PersistedEvidenceSignalSnapshot } from '../models/EvidenceSignal';

export interface EvidenceSignalRepository {
  saveIfNotDuplicate(signal: EvidenceSignalSnapshot, duplicateWindowMinutes: number): Promise<boolean>;
  findPending(filters?: EvidenceSignalFilters): Promise<PersistedEvidenceSignalSnapshot[]>;
}
