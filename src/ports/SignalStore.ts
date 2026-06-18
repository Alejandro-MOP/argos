import type { Signal } from '../models/Signal';

export interface SignalStore {
  save(signal: Signal): Promise<void>;
  findAll(): Promise<Signal[]>;
}
