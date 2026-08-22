import type { BacktestEngine } from '../backtesting/BacktestEngine';
import type { PerformanceSummary } from '../models/SignalContext';
import type { Signal } from '../models/Signal';
import type { TradePlanConfig } from '../utils/tradeSizing.utils';

export interface PerformanceLookupRequest {
  ticker: string;
  timeframe: string;
  minimumScore: number;
  months: number;
  tradePlan: TradePlanConfig;
  referenceDate: Date;
}

export interface HistoricalPerformanceProvider {
  getHistoricalPerformance(request: PerformanceLookupRequest): Promise<PerformanceSummary | undefined>;
}

export interface ForwardPerformanceProvider {
  getForwardPerformance(signal: Signal): Promise<PerformanceSummary | undefined>;
}

export class BacktestHistoricalPerformanceProvider implements HistoricalPerformanceProvider {
  private readonly cache = new Map<string, Promise<PerformanceSummary | undefined>>();

  public constructor(private readonly backtestEngine: BacktestEngine) {}

  public getHistoricalPerformance(
    request: PerformanceLookupRequest,
  ): Promise<PerformanceSummary | undefined> {
    const key = [
      request.ticker.toUpperCase(),
      request.timeframe.toLowerCase(),
      request.minimumScore,
      request.months,
      request.tradePlan.stopLossPercent,
      request.tradePlan.targetMinPercent,
      request.tradePlan.targetMaxPercent,
      request.referenceDate.toISOString().slice(0, 10),
    ].join(':');

    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const promise = this.fetchHistoricalPerformance(request);
    this.cache.set(key, promise);

    return promise;
  }

  private async fetchHistoricalPerformance(
    request: PerformanceLookupRequest,
  ): Promise<PerformanceSummary | undefined> {
    const to = request.referenceDate;
    const from = addMonths(to, -request.months);
    const result = await this.backtestEngine.run({
      tickers: [request.ticker],
      timeframe: request.timeframe,
      from,
      to,
      minimumScore: request.minimumScore,
      stopLossPercent: request.tradePlan.stopLossPercent,
      takeProfitMinPercent: request.tradePlan.targetMinPercent,
      takeProfitMaxPercent: request.tradePlan.targetMaxPercent,
      includeTrades: false,
    });
    const tickerResult = result.results[0];

    if (!tickerResult) {
      return undefined;
    }

    return {
      sampleSize: tickerResult.fullPeriod.totalSignals,
      tp1: {
        targetPercent: tickerResult.fullPeriod.tp1.targetPercent,
        wins: tickerResult.fullPeriod.tp1.wins,
        losses: tickerResult.fullPeriod.tp1.losses,
        winRate: toNullableWinRate(tickerResult.fullPeriod.tp1.winRate, tickerResult.fullPeriod.tp1.resolvedTrades),
      },
      tp2: {
        targetPercent: tickerResult.fullPeriod.tp2.targetPercent,
        wins: tickerResult.fullPeriod.tp2.wins,
        losses: tickerResult.fullPeriod.tp2.losses,
        winRate: toNullableWinRate(tickerResult.fullPeriod.tp2.winRate, tickerResult.fullPeriod.tp2.resolvedTrades),
      },
      averageMfePercent: tickerResult.fullPeriod.averageMfePercent,
      averageMaePercent: tickerResult.fullPeriod.averageMaePercent,
    };
  }
}

export class EmptyForwardPerformanceProvider implements ForwardPerformanceProvider {
  public async getForwardPerformance(): Promise<PerformanceSummary | undefined> {
    return undefined;
  }
}

const toNullableWinRate = (winRate: number, resolvedTrades: number): number | null =>
  resolvedTrades > 0 ? winRate : null;

const addMonths = (date: Date, months: number): Date => {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
};
