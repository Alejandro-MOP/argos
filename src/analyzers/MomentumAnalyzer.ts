import type { Candle } from '../models/Candle';
import type { Analyzer } from '../ports/Analyzer';
import { calculateRsi } from '../utils/marketMath';

export interface MomentumAnalyzerConfig {
  rsiPeriod: number;
  idealMin: number;
  idealMax: number;
  neutralMin: number;
  neutralMax: number;
  extendedMax: number;
}

export class MomentumAnalyzer implements Analyzer {
  public constructor(private readonly config: MomentumAnalyzerConfig) {}

  public analyze(candles: Candle[]): number {
    const rsi = calculateRsi(candles, this.config.rsiPeriod);

    if (rsi === null) {
      return 0;
    }

    if (rsi >= this.config.idealMin && rsi <= this.config.idealMax) {
      return 25;
    }

    if (rsi >= this.config.neutralMin && rsi < this.config.idealMin) {
      return 15;
    }

    if (rsi > this.config.idealMax && rsi <= this.config.extendedMax) {
      return 10;
    }

    if (rsi >= this.config.neutralMin && rsi <= this.config.neutralMax) {
      return 15;
    }

    return 0;
  }

  public getReasons(candles: Candle[]): string[] {
    const rsi = calculateRsi(candles, this.config.rsiPeriod);

    if (rsi === null) {
      return [];
    }

    const roundedRsi = Number(rsi.toFixed(2));

    if (this.analyze(candles) > 0) {
      return [`RSI14 en zona constructiva (${roundedRsi})`];
    }

    return [];
  }
}
