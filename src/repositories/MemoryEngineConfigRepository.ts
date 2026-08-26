import type { EngineConfigEntry } from '../models/EngineConfig';
import type { EngineConfigRepository } from '../ports/EngineConfigRepository';

export class MemoryEngineConfigRepository implements EngineConfigRepository {
  public async findActive(): Promise<EngineConfigEntry[]> {
    return [];
  }
}
