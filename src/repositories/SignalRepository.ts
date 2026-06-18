import type { Signal } from '../models/Signal';
import type { SignalRepository as SignalRepositoryPort } from '../ports/SignalRepository';
import type { SignalStore } from '../ports/SignalStore';

export class SignalRepository implements SignalStore, SignalRepositoryPort {
  private readonly signals: Signal[] = [];

  public async save(signal: Signal): Promise<void> {
    this.signals.push(signal);
  }

  public async findAll(): Promise<Signal[]> {
    return [...this.signals];
  }

  public async findRecentByTicker(
    ticker: string,
    timeframe: string,
    since: Date,
  ): Promise<Signal[]> {
    return this.signals.filter(
      (signal) =>
        signal.ticker === ticker && signal.timeframe === timeframe && signal.createdAt >= since,
    );
  }
}
