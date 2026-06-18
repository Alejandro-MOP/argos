import type { Signal } from '../models/Signal';

export interface SignalRepository {
  save(signal: Signal): Promise<void>;
  findAll(): Promise<Signal[]>;
  findRecentByTicker(ticker: string, timeframe: string, since: Date): Promise<Signal[]>;
}
