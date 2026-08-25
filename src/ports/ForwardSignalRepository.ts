import type { ForwardSignalSnapshot } from '../models/ForwardSignal';

export interface ForwardSignalRepository {
  save(signal: ForwardSignalSnapshot): Promise<void>;
}
