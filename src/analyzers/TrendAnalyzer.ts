import type { Candle } from '../models/Candle';
import type { Analyzer } from '../ports/Analyzer';
import { calculateEmaSeries } from '../utils/marketMath';

export interface TrendAnalyzerConfig {
  fastPeriod: number;
  slowPeriod: number;
}

export class TrendAnalyzer implements Analyzer {
  public constructor(private readonly config: TrendAnalyzerConfig) {}

  public analyze(candles: Candle[]): number {
    if (candles.length < this.config.slowPeriod + 1) {
      return 0;
    }

    const closes = candles.map((candle) => candle.close);
    const fastEma = calculateEmaSeries(closes, this.config.fastPeriod);
    const slowEma = calculateEmaSeries(closes, this.config.slowPeriod);

    const currentFast = fastEma.at(-1);
    const previousFast = fastEma.at(-2);
    const currentSlow = slowEma.at(-1);
    const previousSlow = slowEma.at(-2);

    if (!currentFast || !previousFast || !currentSlow || !previousSlow) {
      return 0;
    }

    const fastAboveSlow = currentFast > currentSlow;
    const fastAscending = currentFast > previousFast;
    const slowAscending = currentSlow > previousSlow;

    if (fastAboveSlow && fastAscending && slowAscending) {
      return 25;
    }

    if (fastAboveSlow && fastAscending) {
      return 15;
    }

    if (fastAboveSlow) {
      return 5;
    }

    return 0;
  }

  public getReasons(candles: Candle[]): string[] {
    const score = this.analyze(candles);

    if (score >= 25) {
      return ['EMA20 sobre EMA50 y ambas ascendentes'];
    }

    if (score >= 15) {
      return ['EMA20 sobre EMA50 con impulso moderado'];
    }

    if (score >= 5) {
      return ['EMA20 sobre EMA50'];
    }

    return [];
  }
}
