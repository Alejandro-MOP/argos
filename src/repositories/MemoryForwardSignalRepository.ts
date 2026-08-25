import type { ForwardSignalSnapshot } from '../models/ForwardSignal';
import type { ForwardSignalRepository } from '../ports/ForwardSignalRepository';

export class MemoryForwardSignalRepository implements ForwardSignalRepository {
  private readonly signals: ForwardSignalSnapshot[] = [];

  public async save(signal: ForwardSignalSnapshot): Promise<void> {
    this.signals.push({ ...signal });
  }

  public async findAll(): Promise<ForwardSignalSnapshot[]> {
    return this.signals.map((signal) => ({ ...signal }));
  }
}
