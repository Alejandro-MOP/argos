import type { Candle } from '../models/Candle';
import type { SignalCandidate } from '../models/SignalCandidate';

export interface TradingStrategy {
  readonly name: string;
  detect(ticker: string, timeframe: string, candles: Candle[]): SignalCandidate | null;
}
