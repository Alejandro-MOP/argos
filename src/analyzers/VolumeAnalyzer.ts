import type { Candle } from '../models/Candle';
import type { Analyzer } from '../ports/Analyzer';
import { averageVolume } from '../utils/marketMath';

export interface VolumeAnalyzerConfig {
  lookbackPeriod: number;
  strongRatio: number;
  moderateRatio: number;
  weakRatio: number;
}

export class VolumeAnalyzer implements Analyzer {
  public constructor(private readonly config: VolumeAnalyzerConfig) {}

  public analyze(candles: Candle[]): number {
    const ratio = this.getCurrentVolumeRatio(candles);

    if (ratio === null) {
      return 0;
    }

    if (ratio > this.config.strongRatio) {
      return 25;
    }

    if (ratio > this.config.moderateRatio) {
      return 20;
    }

    if (ratio > this.config.weakRatio) {
      return 10;
    }

    return 0;
  }

  public getReasons(candles: Candle[]): string[] {
    const ratio = this.getCurrentVolumeRatio(candles);

    if (ratio === null || ratio <= this.config.weakRatio) {
      return [];
    }

    return [`Volumen ${Math.round(ratio * 100)}% sobre promedio`];
  }

  private getCurrentVolumeRatio(candles: Candle[]): number | null {
    if (candles.length < this.config.lookbackPeriod + 1) {
      return null;
    }

    const lastCandle = candles.at(-1);
    const previousCandles = candles.slice(-(this.config.lookbackPeriod + 1), -1);
    const previousAverageVolume = averageVolume(previousCandles);

    if (!lastCandle || previousAverageVolume <= 0) {
      return null;
    }

    return lastCandle.volume / previousAverageVolume;
  }
}
