import type { Candle } from '../models/Candle';
import type { SignalCandidate } from '../models/SignalCandidate';
import type { TradingStrategy } from '../ports/TradingStrategy';
import { averageVolume, highestHigh } from '../utils/marketMath';

export class BreakoutStrategy implements TradingStrategy {
  public readonly name = 'legacy-breakout-20-volume-confirmation';

  public detect(ticker: string, timeframe: string, candles: Candle[]): SignalCandidate | null {
    if (candles.length < 21) {
      return null;
    }

    const lastCandle = candles.at(-1);
    const previousCandles = candles.slice(-21, -1);

    if (!lastCandle || previousCandles.length < 20) {
      return null;
    }

    const previousHigh = highestHigh(previousCandles);
    const previousAverageVolume = averageVolume(previousCandles);

    const isLongBreakout = lastCandle.close > previousHigh;
    const hasVolumeConfirmation = lastCandle.volume > previousAverageVolume;

    if (!isLongBreakout || !hasVolumeConfirmation) {
      return null;
    }

    return {
      ticker,
      timeframe,
      score: this.calculateScore(lastCandle, previousHigh, previousAverageVolume),
      signalType: 'LONG',
      createdAt: new Date(),
    };
  }

  private calculateScore(
    lastCandle: Candle,
    previousHigh: number,
    previousAverageVolume: number,
  ): number {
    const breakoutStrength = (lastCandle.close - previousHigh) / previousHigh;
    const volumeStrength = (lastCandle.volume - previousAverageVolume) / previousAverageVolume;
    const rawScore = 50 + breakoutStrength * 1_000 + volumeStrength * 20;

    return Math.max(0, Math.min(100, Number(rawScore.toFixed(2))));
  }
}

export class StrategyService {
  public constructor(private readonly strategies: TradingStrategy[]) {}

  public detectBreakout(
    ticker: string,
    timeframe: string,
    candles: Candle[],
  ): SignalCandidate | null {
    const breakoutStrategy = this.strategies.find(
      (strategy) =>
        strategy.name === 'legacy-breakout-20-volume-confirmation' ||
        strategy.name === 'breakout-20-volume-confirmation',
    );

    return breakoutStrategy?.detect(ticker, timeframe, candles) ?? null;
  }

  public detectSignals(ticker: string, timeframe: string, candles: Candle[]): SignalCandidate[] {
    return this.strategies
      .map((strategy) => strategy.detect(ticker, timeframe, candles))
      .filter((signal): signal is SignalCandidate => signal !== null);
  }
}
