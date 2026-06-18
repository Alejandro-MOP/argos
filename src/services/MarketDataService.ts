import type { Candle } from '../models/Candle';
import type { MarketDataProvider } from '../ports/MarketDataProvider';

export class MarketDataService {
  public constructor(private readonly marketDataProvider: MarketDataProvider) {}

  public getCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]> {
    return this.marketDataProvider.getCandles(ticker, timeframe, limit);
  }
}
