import type { Candle } from '../models/Candle';
import type { Analyzer } from '../ports/Analyzer';
import { highestHigh, lowestLow } from '../utils/marketMath';

export interface StructureAnalyzerConfig {
  lookbackPeriod: number;
}

export class StructureAnalyzer implements Analyzer {
  public constructor(private readonly config: StructureAnalyzerConfig) {}

  public analyze(candles: Candle[]): number {
    if (candles.length < this.config.lookbackPeriod + 1) {
      return 0;
    }

    if (this.hasBreakout(candles)) {
      return 25;
    }

    if (this.hasBullishStructure(candles)) {
      return 15;
    }

    if (this.isConsolidating(candles)) {
      return 5;
    }

    return 0;
  }

  public getReasons(candles: Candle[]): string[] {
    if (this.hasBreakout(candles)) {
      return ['Breakout confirmado'];
    }

    if (this.hasBullishStructure(candles)) {
      return ['Higher highs y higher lows'];
    }

    if (this.isConsolidating(candles)) {
      return ['Consolidación cerca de resistencia'];
    }

    return [];
  }

  private hasBreakout(candles: Candle[]): boolean {
    const lastCandle = candles.at(-1);
    const previousCandles = candles.slice(-(this.config.lookbackPeriod + 1), -1);

    if (!lastCandle || previousCandles.length < this.config.lookbackPeriod) {
      return false;
    }

    return lastCandle.close > highestHigh(previousCandles);
  }

  private hasBullishStructure(candles: Candle[]): boolean {
    if (candles.length < 6) {
      return false;
    }

    const recent = candles.slice(-6);
    const firstHalf = recent.slice(0, 3);
    const secondHalf = recent.slice(3);

    return (
      highestHigh(secondHalf) > highestHigh(firstHalf) &&
      lowestLow(secondHalf) > lowestLow(firstHalf)
    );
  }

  private isConsolidating(candles: Candle[]): boolean {
    const recent = candles.slice(-10);

    if (recent.length < 10) {
      return false;
    }

    const range = highestHigh(recent) - lowestLow(recent);
    const lastClose = recent.at(-1)?.close ?? 0;

    if (lastClose <= 0) {
      return false;
    }

    return range / lastClose <= 0.04;
  }
}
