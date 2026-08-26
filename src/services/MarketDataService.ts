import type { Candle } from '../models/Candle';
import type { MarketDataProvider } from '../ports/MarketDataProvider';

export interface HistoricalMarketDataProvider extends MarketDataProvider {
  getHistoricalCandles(
    ticker: string,
    timeframe: string,
    from: Date,
    to: Date,
    options?: HistoricalCandlesOptions,
  ): Promise<Candle[]>;
}

export interface HistoricalCandlesOptions {
  minimumCandles?: number;
}

export class MarketDataService {
  public constructor(private readonly marketDataProvider: MarketDataProvider) {}

  public getCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]> {
    return this.marketDataProvider.getCandles(ticker, timeframe, limit);
  }

  public getHistoricalCandles(
    ticker: string,
    timeframe: string,
    from: Date,
    to: Date,
    options?: HistoricalCandlesOptions,
  ): Promise<Candle[]> {
    if (!this.hasHistoricalCandles(this.marketDataProvider)) {
      throw new Error('market-data-provider-does-not-support-historical-candles');
    }

    return this.marketDataProvider.getHistoricalCandles(ticker, timeframe, from, to, options);
  }

  private hasHistoricalCandles(
    provider: MarketDataProvider,
  ): provider is HistoricalMarketDataProvider {
    return 'getHistoricalCandles' in provider && typeof provider.getHistoricalCandles === 'function';
  }
}
