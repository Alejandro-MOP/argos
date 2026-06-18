import type { Candle } from '../models/Candle';

export interface Analyzer {
  analyze(candles: Candle[]): number;
}
