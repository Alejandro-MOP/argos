import type { Candle } from '../models/Candle';
import type { BacktestOutcome } from '../models/BacktestTrade';

export type TradeDirection = 'LONG';

export interface TradeOutcomeEvaluationRequest {
  direction?: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  signalAt: Date;
  expiresAt: Date;
  candles: Candle[];
}

export interface SingleTargetOutcomeEvaluationRequest {
  direction?: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  signalAt: Date;
  expiresAt: Date;
  candles: Candle[];
}

export interface TargetOutcomeEvaluation {
  outcome: BacktestOutcome;
  exitAt?: Date;
  candlesUntil?: number;
  exitIndex: number;
}

export interface TradeOutcomeEvaluation {
  outcomeTp1: TargetOutcomeEvaluation;
  outcomeTp2: TargetOutcomeEvaluation;
  maxFavorableExcursionPercent: number;
  maxAdverseExcursionPercent: number;
  terminalTimestamp?: Date;
  terminalIndex?: number;
}

export class TradeOutcomeEvaluator {
  public evaluateTarget(request: SingleTargetOutcomeEvaluationRequest): TargetOutcomeEvaluation {
    this.validateSingleTargetRequest(request);
    const futureCandles = this.getFutureCandles(request);
    return this.evaluateLongTarget(futureCandles, request.stopLoss, request.takeProfit);
  }

  public evaluate(request: TradeOutcomeEvaluationRequest): TradeOutcomeEvaluation {
    this.validateRequest(request);

    const futureCandles = this.getFutureCandles(request);
    const outcomeTp1 = this.evaluateLongTarget(futureCandles, request.stopLoss, request.takeProfit1);
    const outcomeTp2 = this.evaluateLongTarget(futureCandles, request.stopLoss, request.takeProfit2);
    const terminalRelativeIndex = Math.max(outcomeTp1.exitIndex, outcomeTp2.exitIndex);
    const mfeMaeCandles =
      terminalRelativeIndex >= 0
        ? futureCandles.slice(0, terminalRelativeIndex + 1)
        : futureCandles;
    const maxHigh = Math.max(request.entry, ...mfeMaeCandles.map((candle) => candle.high));
    const minLow = Math.min(request.entry, ...mfeMaeCandles.map((candle) => candle.low));
    const terminalCandle = terminalRelativeIndex >= 0 ? futureCandles[terminalRelativeIndex] : undefined;

    return {
      outcomeTp1,
      outcomeTp2,
      maxFavorableExcursionPercent: ((maxHigh - request.entry) / request.entry) * 100,
      maxAdverseExcursionPercent: ((minLow - request.entry) / request.entry) * 100,
      terminalTimestamp: terminalCandle?.timestamp,
      terminalIndex: terminalRelativeIndex >= 0 ? terminalRelativeIndex : undefined,
    };
  }

  private getFutureCandles(request: TradeOutcomeEvaluationRequest | SingleTargetOutcomeEvaluationRequest): Candle[] {
    const signalTimestamp = request.signalAt.getTime();
    const expirationTimestamp = request.expiresAt.getTime();

    return [...request.candles]
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
      .filter((candle) => {
        const timestamp = candle.timestamp.getTime();
        return timestamp > signalTimestamp && timestamp <= expirationTimestamp;
      });
  }

  private evaluateLongTarget(
    candles: Candle[],
    stopLoss: number,
    takeProfit: number,
  ): TargetOutcomeEvaluation {
    for (let index = 0; index < candles.length; index += 1) {
      const candle = candles[index];
      const hitStop = candle.low <= stopLoss;
      const hitTarget = candle.high >= takeProfit;

      if (hitStop && hitTarget) {
        return {
          outcome: 'AMBIGUOUS',
          exitAt: candle.timestamp,
          candlesUntil: index + 1,
          exitIndex: index,
        };
      }

      if (hitTarget) {
        return {
          outcome: 'WIN',
          exitAt: candle.timestamp,
          candlesUntil: index + 1,
          exitIndex: index,
        };
      }

      if (hitStop) {
        return {
          outcome: 'LOSS',
          exitAt: candle.timestamp,
          candlesUntil: index + 1,
          exitIndex: index,
        };
      }
    }

    return {
      outcome: 'EXPIRED',
      candlesUntil: candles.length,
      exitIndex: candles.length > 0 ? candles.length - 1 : -1,
    };
  }


  private validateSingleTargetRequest(request: SingleTargetOutcomeEvaluationRequest): void {
    const direction = request.direction ?? 'LONG';

    if (direction !== 'LONG') {
      throw new Error(`Unsupported trade direction: ${direction}`);
    }

    if (!Number.isFinite(request.entry) || request.entry <= 0) {
      throw new Error('Trade outcome entry must be greater than 0');
    }

    if (!Number.isFinite(request.stopLoss) || request.stopLoss >= request.entry) {
      throw new Error('Trade outcome stopLoss must be below entry for LONG trades');
    }

    if (!Number.isFinite(request.takeProfit) || request.takeProfit <= request.entry) {
      throw new Error('Trade outcome takeProfit must be above entry for LONG trades');
    }

    if (request.expiresAt.getTime() <= request.signalAt.getTime()) {
      throw new Error('Trade outcome expiresAt must be after signalAt');
    }
  }

  private validateRequest(request: TradeOutcomeEvaluationRequest): void {
    const direction = request.direction ?? 'LONG';

    if (direction !== 'LONG') {
      throw new Error(`Unsupported trade direction: ${direction}`);
    }

    if (!Number.isFinite(request.entry) || request.entry <= 0) {
      throw new Error('Trade outcome entry must be greater than 0');
    }

    if (!Number.isFinite(request.stopLoss) || request.stopLoss >= request.entry) {
      throw new Error('Trade outcome stopLoss must be below entry for LONG trades');
    }

    if (!Number.isFinite(request.takeProfit1) || request.takeProfit1 <= request.entry) {
      throw new Error('Trade outcome takeProfit1 must be above entry for LONG trades');
    }

    if (!Number.isFinite(request.takeProfit2) || request.takeProfit2 <= request.takeProfit1) {
      throw new Error('Trade outcome takeProfit2 must be greater than takeProfit1');
    }

    if (request.expiresAt.getTime() <= request.signalAt.getTime()) {
      throw new Error('Trade outcome expiresAt must be after signalAt');
    }
  }
}
