import type { Candle } from '../models/Candle';
import type { Opportunity } from '../models/Opportunity';
import type { Signal } from '../models/Signal';
import type { SignalCandidate } from '../models/SignalCandidate';

export class RiskService {
  public calculateRisk(opportunity: Opportunity, candles: Candle[]): Signal | null;
  public calculateRisk(candidate: SignalCandidate, candles: Candle[]): Signal | null;
  public calculateRisk(
    opportunityOrCandidate: Opportunity | SignalCandidate,
    candles: Candle[],
  ): Signal | null {
    const lastCandle = candles.at(-1);

    if (!lastCandle) {
      return null;
    }

    const signalType =
      'signalType' in opportunityOrCandidate ? opportunityOrCandidate.signalType : 'LONG';

    if (signalType === 'SHORT') {
      return null;
    }

    const entry = lastCandle.close;
    const stop = lastCandle.low;
    const risk = entry - stop;

    if (risk <= 0) {
      return null;
    }

    const target = entry + risk * 2;

    return {
      ticker: opportunityOrCandidate.ticker,
      timeframe: opportunityOrCandidate.timeframe,
      entry,
      stop,
      target,
      score: opportunityOrCandidate.score,
      signalType,
      createdAt:
        'detectedAt' in opportunityOrCandidate
          ? opportunityOrCandidate.detectedAt
          : opportunityOrCandidate.createdAt,
      signalCandleTimestamp: lastCandle.timestamp,
      strategyVersion:
        'strategyVersion' in opportunityOrCandidate
          ? opportunityOrCandidate.strategyVersion
          : undefined,
    };
  }
}
