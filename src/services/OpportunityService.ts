import type { MomentumAnalyzer } from '../analyzers/MomentumAnalyzer';
import type { StructureAnalyzer } from '../analyzers/StructureAnalyzer';
import type { TrendAnalyzer } from '../analyzers/TrendAnalyzer';
import type { VolumeAnalyzer } from '../analyzers/VolumeAnalyzer';
import type { Candle } from '../models/Candle';
import type { Opportunity } from '../models/Opportunity';

export interface OpportunityAnalyzers {
  trendAnalyzer: TrendAnalyzer;
  volumeAnalyzer: VolumeAnalyzer;
  momentumAnalyzer: MomentumAnalyzer;
  structureAnalyzer: StructureAnalyzer;
}

export class OpportunityService {
  public constructor(private readonly analyzers: OpportunityAnalyzers) {}

  public analyze(ticker: string, timeframe: string, candles: Candle[]): Opportunity {
    const trendScore = this.analyzers.trendAnalyzer.analyze(candles);
    const volumeScore = this.analyzers.volumeAnalyzer.analyze(candles);
    const momentumScore = this.analyzers.momentumAnalyzer.analyze(candles);
    const structureScore = this.analyzers.structureAnalyzer.analyze(candles);
    const score = trendScore + volumeScore + momentumScore + structureScore;

    return {
      ticker,
      timeframe,
      score,
      trendScore,
      volumeScore,
      momentumScore,
      structureScore,
      reasons: this.getReasons(candles),
      detectedAt: new Date(),
      signalCandleTimestamp: candles.at(-1)?.timestamp,
    };
  }

  private getReasons(candles: Candle[]): string[] {
    return [
      ...this.analyzers.trendAnalyzer.getReasons(candles),
      ...this.analyzers.volumeAnalyzer.getReasons(candles),
      ...this.analyzers.momentumAnalyzer.getReasons(candles),
      ...this.analyzers.structureAnalyzer.getReasons(candles),
    ];
  }
}
