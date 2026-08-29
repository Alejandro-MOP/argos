import type { ForwardSignalSnapshot, PersistedForwardSignalSnapshot } from '../models/ForwardSignal';

export interface ForwardSignalFilters {
  signalId?: string;
  ticker?: string;
  limit?: number;
}

export interface ForwardSignalRepository {
  save(signal: ForwardSignalSnapshot): Promise<boolean>;
  findPending(filters?: ForwardSignalFilters): Promise<PersistedForwardSignalSnapshot[]>;
}
