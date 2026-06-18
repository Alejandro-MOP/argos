import type { Candle } from '../models/Candle';

export interface MarketDataProvider {
  getCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]>;
}
