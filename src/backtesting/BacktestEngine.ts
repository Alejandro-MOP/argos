import type { Candle } from '../models/Candle';
import type { Opportunity } from '../models/Opportunity';
import type { Signal } from '../models/Signal';
import type { BacktestOutcome, BacktestTrade } from '../models/BacktestTrade';
import type { RiskService } from '../services/RiskService';
import type { OpportunityService } from '../services/OpportunityService';
import { TradeOutcomeEvaluator } from '../services/TradeOutcomeEvaluator';

const DAY_IN_MILLISECONDS = 86_400_000;
const MINIMUM_BACKTEST_CANDLES = 60;

export interface HistoricalMarketDataService {
  getHistoricalCandles(ticker: string, timeframe: string, from: Date, to: Date): Promise<Candle[]>;
}

export interface BacktestEngineDependencies {
  marketDataService: HistoricalMarketDataService;
  opportunityService: Pick<OpportunityService, 'analyze'>;
  riskService: Pick<RiskService, 'calculateRisk'>;
  expirationWindows?: Partial<Record<string, number>>;
}

export interface BacktestRunRequest {
  tickers: string[];
  timeframe: string;
  from: Date;
  to: Date;
  minimumScore: number;
  stopLossPercent: number;
  takeProfitMinPercent: number;
  takeProfitMaxPercent: number;
  includeTrades?: boolean;
}

export interface BacktestError {
  ticker: string;
  timeframe: string;
  message: string;
  from: string;
  to: string;
  candlesReturned?: number;
}

export interface BacktestOutcomeSummary {
  targetPercent: number;
  wins: number;
  losses: number;
  expired: number;
  ambiguous: number;
  resolvedTrades: number;
  winRate: number;
}

export interface BacktestSummary {
  ticker: string;
  timeframe: string;
  period: {
    from: string;
    to: string;
  };
  minimumScore: number;
  totalSignals: number;
  tp1: BacktestOutcomeSummary;
  tp2: BacktestOutcomeSummary;
  averageScore: number;
  averageMfePercent: number;
  averageMaePercent: number;
}

export interface BacktestWindowSummary {
  signals: number;
  tp1WinRate: number;
  tp2WinRate: number;
}

export interface BacktestWindows {
  fullPeriod: BacktestWindowSummary;
  last12Months: BacktestWindowSummary;
  last6Months: BacktestWindowSummary;
  last30Days: BacktestWindowSummary;
  last7Days: BacktestWindowSummary;
}

export interface BacktestTickerResult {
  ticker: string;
  timeframe: string;
  period: {
    from: string;
    to: string;
  };
  minimumScore: number;
  fullPeriod: BacktestSummary;
  windows: BacktestWindows;
  trades?: BacktestTrade[];
}

export interface BacktestRunResult {
  ok: boolean;
  timeframe: string;
  period: {
    from: string;
    to: string;
  };
  minimumScore: number;
  results: BacktestTickerResult[];
  errors: BacktestError[];
}

export const DEFAULT_BACKTEST_EXPIRATION_WINDOWS_DAYS: Record<string, number> = {
  '1m': 1,
  '5m': 2,
  '15m': 3,
  '30m': 5,
  '1h': 10,
  '1d': 45,
  '1w': 180,
};

export class InsufficientHistoricalDataError extends Error {
  public constructor(
    public readonly ticker: string,
    public readonly timeframe: string,
    public readonly from: string,
    public readonly to: string,
    public readonly candlesReturned: number,
  ) {
    super('insufficient-historical-data');
  }
}

export class BacktestEngine {
  private readonly expirationWindows: Record<string, number>;
  private readonly tradeOutcomeEvaluator = new TradeOutcomeEvaluator();

  public constructor(private readonly dependencies: BacktestEngineDependencies) {
    this.expirationWindows = {
      ...DEFAULT_BACKTEST_EXPIRATION_WINDOWS_DAYS,
      ...compactExpirationWindows(dependencies.expirationWindows),
    };
  }

  public async run(request: BacktestRunRequest): Promise<BacktestRunResult> {
    this.validateRequest(request);

    const results: BacktestTickerResult[] = [];
    const errors: BacktestError[] = [];

    for (const ticker of request.tickers) {
      const normalizedTicker = ticker.trim().toUpperCase();

      try {
        const candles = await this.dependencies.marketDataService.getHistoricalCandles(
          normalizedTicker,
          request.timeframe,
          request.from,
          request.to,
        );

        if (candles.length < MINIMUM_BACKTEST_CANDLES) {
          throw new InsufficientHistoricalDataError(
            normalizedTicker,
            request.timeframe,
            request.from.toISOString(),
            request.to.toISOString(),
            candles.length,
          );
        }

        const trades = this.simulateTicker(normalizedTicker, candles, request);
        const fullPeriod = this.buildSummary(normalizedTicker, request, trades);

        results.push({
          ticker: normalizedTicker,
          timeframe: request.timeframe,
          period: this.formatPeriod(request.from, request.to),
          minimumScore: request.minimumScore,
          fullPeriod,
          windows: this.buildWindows(trades, request),
          trades: request.includeTrades ? trades : undefined,
        });
      } catch (error) {
        errors.push(this.toBacktestError(normalizedTicker, request, error));
      }
    }

    return {
      ok: errors.length === 0,
      timeframe: request.timeframe,
      period: this.formatPeriod(request.from, request.to),
      minimumScore: request.minimumScore,
      results,
      errors,
    };
  }

  private simulateTicker(ticker: string, candles: Candle[], request: BacktestRunRequest): BacktestTrade[] {
    const sortedCandles = [...candles].sort(
      (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
    );
    const trades: BacktestTrade[] = [];
    let nextAllowedSignalIndex = 0;

    for (let index = 0; index < sortedCandles.length; index += 1) {
      if (index < nextAllowedSignalIndex) {
        continue;
      }

      const historicalWindow = sortedCandles.slice(0, index + 1);
      const opportunity = this.dependencies.opportunityService.analyze(
        ticker,
        request.timeframe,
        historicalWindow,
      );
      const signalAt = sortedCandles[index].timestamp;
      const historicalOpportunity: Opportunity = {
        ...opportunity,
        detectedAt: signalAt,
      };

      if (historicalOpportunity.score < request.minimumScore) {
        continue;
      }

      const signal = this.dependencies.riskService.calculateRisk(historicalOpportunity, historicalWindow);

      if (!signal) {
        continue;
      }

      const trade = this.createTrade(ticker, request, historicalOpportunity, signal, sortedCandles, index);
      trades.push(trade.trade);
      nextAllowedSignalIndex = Math.max(index + 1, trade.terminalIndex + 1);
    }

    return trades;
  }

  private createTrade(
    ticker: string,
    request: BacktestRunRequest,
    opportunity: Opportunity,
    signal: Signal,
    candles: Candle[],
    signalIndex: number,
  ): { trade: BacktestTrade; terminalIndex: number } {
    const entry = signal.entry;
    const expiresAt = this.calculateExpiresAt(signal.createdAt, request.timeframe);
    const stopLoss = entry * (1 - request.stopLossPercent / 100);
    const takeProfit1 = entry * (1 + request.takeProfitMinPercent / 100);
    const takeProfit2 = entry * (1 + request.takeProfitMaxPercent / 100);
    const evaluation = this.tradeOutcomeEvaluator.evaluate({
      entry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      signalAt: signal.createdAt,
      expiresAt,
      candles,
    });
    const terminalIndex = this.resolveTerminalIndex(candles, signalIndex, evaluation.terminalTimestamp);

    return {
      terminalIndex,
      trade: {
        ticker,
        timeframe: request.timeframe,
        signalAt: signal.createdAt,
        score: opportunity.score,
        trendScore: opportunity.trendScore,
        volumeScore: opportunity.volumeScore,
        momentumScore: opportunity.momentumScore,
        structureScore: opportunity.structureScore,
        entry: roundPrice(entry),
        stopLoss: {
          percent: roundPercent(request.stopLossPercent),
          price: roundPrice(stopLoss),
        },
        takeProfit1: {
          percent: roundPercent(request.takeProfitMinPercent),
          price: roundPrice(takeProfit1),
        },
        takeProfit2: {
          percent: roundPercent(request.takeProfitMaxPercent),
          price: roundPrice(takeProfit2),
        },
        outcomeTp1: evaluation.outcomeTp1.outcome,
        outcomeTp2: evaluation.outcomeTp2.outcome,
        exitAtTp1: evaluation.outcomeTp1.exitAt,
        exitAtTp2: evaluation.outcomeTp2.exitAt,
        candlesUntilTp1: evaluation.outcomeTp1.candlesUntil,
        candlesUntilTp2: evaluation.outcomeTp2.candlesUntil,
        maxFavorableExcursionPercent: roundPercent(evaluation.maxFavorableExcursionPercent),
        maxAdverseExcursionPercent: roundPercent(evaluation.maxAdverseExcursionPercent),
        expiresAt,
      },
    };
  }

  private resolveTerminalIndex(
    candles: Candle[],
    signalIndex: number,
    terminalTimestamp: Date | undefined,
  ): number {
    if (!terminalTimestamp) {
      return signalIndex;
    }

    const terminalIndex = candles.findIndex(
      (candle) => candle.timestamp.getTime() === terminalTimestamp.getTime(),
    );

    return terminalIndex >= 0 ? terminalIndex : signalIndex;
  }

  private calculateExpiresAt(signalAt: Date, timeframe: string): Date {
    const normalizedTimeframe = timeframe.trim().toLowerCase();
    const days = this.expirationWindows[normalizedTimeframe];

    if (!days) {
      throw new Error(
        `Unsupported backtest timeframe: ${timeframe}. Supported: ${Object.keys(this.expirationWindows).join(', ')}`,
      );
    }

    return new Date(signalAt.getTime() + days * DAY_IN_MILLISECONDS);
  }

  private buildSummary(ticker: string, request: BacktestRunRequest, trades: BacktestTrade[]): BacktestSummary {
    return {
      ticker,
      timeframe: request.timeframe,
      period: this.formatPeriod(request.from, request.to),
      minimumScore: request.minimumScore,
      totalSignals: trades.length,
      tp1: this.buildOutcomeSummary(trades, 'outcomeTp1', request.takeProfitMinPercent),
      tp2: this.buildOutcomeSummary(trades, 'outcomeTp2', request.takeProfitMaxPercent),
      averageScore: average(trades.map((trade) => trade.score)),
      averageMfePercent: average(trades.map((trade) => trade.maxFavorableExcursionPercent)),
      averageMaePercent: average(trades.map((trade) => trade.maxAdverseExcursionPercent)),
    };
  }

  private buildWindows(trades: BacktestTrade[], request: BacktestRunRequest): BacktestWindows {
    return {
      fullPeriod: this.buildWindowSummary(trades),
      last12Months: this.buildWindowSummary(this.filterTradesAfter(trades, addMonths(request.to, -12))),
      last6Months: this.buildWindowSummary(this.filterTradesAfter(trades, addMonths(request.to, -6))),
      last30Days: this.buildWindowSummary(
        this.filterTradesAfter(trades, new Date(request.to.getTime() - 30 * DAY_IN_MILLISECONDS)),
      ),
      last7Days: this.buildWindowSummary(
        this.filterTradesAfter(trades, new Date(request.to.getTime() - 7 * DAY_IN_MILLISECONDS)),
      ),
    };
  }

  private buildWindowSummary(trades: BacktestTrade[]): BacktestWindowSummary {
    return {
      signals: trades.length,
      tp1WinRate: this.buildOutcomeSummary(trades, 'outcomeTp1', 0).winRate,
      tp2WinRate: this.buildOutcomeSummary(trades, 'outcomeTp2', 0).winRate,
    };
  }

  private filterTradesAfter(trades: BacktestTrade[], from: Date): BacktestTrade[] {
    return trades.filter((trade) => trade.signalAt.getTime() >= from.getTime());
  }

  private buildOutcomeSummary(
    trades: BacktestTrade[],
    outcomeKey: 'outcomeTp1' | 'outcomeTp2',
    targetPercent: number,
  ): BacktestOutcomeSummary {
    const wins = countOutcome(trades, outcomeKey, 'WIN');
    const losses = countOutcome(trades, outcomeKey, 'LOSS');
    const expired = countOutcome(trades, outcomeKey, 'EXPIRED');
    const ambiguous = countOutcome(trades, outcomeKey, 'AMBIGUOUS');
    const resolvedTrades = wins + losses;

    return {
      targetPercent: roundPercent(targetPercent),
      wins,
      losses,
      expired,
      ambiguous,
      resolvedTrades,
      winRate: resolvedTrades > 0 ? roundPercent((wins / resolvedTrades) * 100) : 0,
    };
  }

  private validateRequest(request: BacktestRunRequest): void {
    if (request.tickers.length === 0) {
      throw new Error('Backtest requires at least one ticker');
    }

    if (request.from.getTime() >= request.to.getTime()) {
      throw new Error('Backtest from must be before to');
    }

    if (request.minimumScore < 0 || request.minimumScore > 100) {
      throw new Error('Backtest minimumScore must be between 0 and 100');
    }

    if (request.stopLossPercent <= 0 || request.takeProfitMinPercent <= 0 || request.takeProfitMaxPercent <= 0) {
      throw new Error('Backtest stop and take profit percentages must be greater than 0');
    }

    if (request.takeProfitMaxPercent <= request.takeProfitMinPercent) {
      throw new Error('Backtest takeProfitMaxPercent must be greater than takeProfitMinPercent');
    }
  }

  private toBacktestError(ticker: string, request: BacktestRunRequest, error: unknown): BacktestError {
    if (error instanceof InsufficientHistoricalDataError) {
      return {
        ticker: error.ticker,
        timeframe: error.timeframe,
        message: error.message,
        from: error.from,
        to: error.to,
        candlesReturned: error.candlesReturned,
      };
    }

    return {
      ticker,
      timeframe: request.timeframe,
      message: error instanceof Error ? error.message : 'backtest-failed',
      from: request.from.toISOString(),
      to: request.to.toISOString(),
    };
  }

  private formatPeriod(from: Date, to: Date): { from: string; to: string } {
    return {
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }
}

const countOutcome = (
  trades: BacktestTrade[],
  outcomeKey: 'outcomeTp1' | 'outcomeTp2',
  outcome: BacktestOutcome,
): number => trades.filter((trade) => trade[outcomeKey] === outcome).length;

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return roundPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const addMonths = (date: Date, months: number): Date => {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
};

const roundPrice = (value: number): number => round(value, 8);
const roundPercent = (value: number): number => round(value, 2);

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};


const compactExpirationWindows = (
  expirationWindows: Partial<Record<string, number>> | undefined,
): Record<string, number> => {
  if (!expirationWindows) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(expirationWindows).filter((entry): entry is [string, number] => {
      const [, value] = entry;
      return typeof value === 'number' && Number.isFinite(value) && value > 0;
    }),
  );
};
