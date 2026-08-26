import type { EngineConfigEntry } from '../models/EngineConfig';

export interface EngineConfigRepository {
  findActive(): Promise<EngineConfigEntry[]>;
}
