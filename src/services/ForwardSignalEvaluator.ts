import type { BacktestOutcome } from '../models/BacktestTrade';
import type {
  PersistedForwardSignalSnapshot,
  SignalEvaluationStatus,
} from '../models/ForwardSignal';
import { DEFAULT_BACKTEST_EXPIRATION_WINDOWS_DAYS } from '../backtesting/BacktestEngine';
import type { ForwardSignalRepository } from '../ports/ForwardSignalRepository';
import type { SignalEvaluationRepository } from '../ports/SignalEvaluationRepository';
import type { HistoricalMarketDataProvider } from './MarketDataService';
import type { RateLimiterService } from './RateLimiterService';
import { TradeOutcomeEvaluator, type TargetOutcomeEvaluation } from './TradeOutcomeEvaluator';

const DAY_IN_MILLISECONDS = 86_400_000;
const DEFAULT_PENDING_LIMIT = 100;

export interface ForwardSignalEvaluatorLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface ForwardSignalEvaluationFilters {
  signalId?: string;
  ticker?: string;
  limit?: number;
}

export interface ForwardSignalEvaluationResultItem {
  signalId: string;
  ticker: string;
  timeframe: string;
  evaluationTimeframe?: string;
  status?: SignalEvaluationStatus;
  outcomeTp1?: BacktestOutcome;
  outcomeTp2?: BacktestOutcome;
  error?: string;
}

export interface ForwardSignalEvaluationRunResult {
  ok: boolean;
  pendingSignals: number;
  evaluated: number;
  closed: number;
  partial: number;
  open: number;
  expired: number;
  ambiguous: number;
  errors: number;
  items: ForwardSignalEvaluationResultItem[];
}

export interface ForwardSignalEvaluatorDependencies {
  forwardSignalRepository: ForwardSignalRepository;
  signalEvaluationRepository: SignalEvaluationRepository;
  marketDataService: HistoricalMarketDataProvider;
  tradeOutcomeEvaluator?: TradeOutcomeEvaluator;
  rateLimiterService?: Pick<RateLimiterService, 'wait'>;
  now?: () => Date;
  expirationWindows?: Partial<Record<string, number>>;
}

export const resolveForwardEvaluationTimeframes = (timeframe: string): string[] => {
  const normalized = timeframe.trim().toLowerCase();

  switch (normalized) {
    case '1m':
      return ['1m', '5m', '15m', '1d'];
    case '5m':
      return ['5m', '15m', '1d'];
    case '15m':
      return ['15m', '30m', '1h', '1d'];
    case '30m':
      return ['15m', '30m', '1h', '1d'];
    case '1h':
      return ['15m', '30m', '1h', '1d'];
    case '1d':
      return ['15m', '30m', '1h', '1d'];
    case '1w':
      return ['1d', '1w'];
    default:
      return [normalized];
  }
};

export class ForwardSignalEvaluator {
  private readonly tradeOutcomeEvaluator: TradeOutcomeEvaluator;
  private readonly expirationWindows: Record<string, number>;

  public constructor(private readonly dependencies: ForwardSignalEvaluatorDependencies) {
    this.tradeOutcomeEvaluator = dependencies.tradeOutcomeEvaluator ?? new TradeOutcomeEvaluator();
    this.expirationWindows = {
      ...DEFAULT_BACKTEST_EXPIRATION_WINDOWS_DAYS,
      ...this.compactExpirationWindows(dependencies.expirationWindows),
    };
  }

  public async execute(
    filters: ForwardSignalEvaluationFilters = {},
    logger: ForwardSignalEvaluatorLogger = console,
  ): Promise<ForwardSignalEvaluationRunResult> {
    logger.log('Forward evaluation started');

    const signals = await this.dependencies.forwardSignalRepository.findPending({
      ...filters,
      limit: filters.limit ?? DEFAULT_PENDING_LIMIT,
    });

    logger.log(`Pending signals: ${signals.length}`);

    const result: ForwardSignalEvaluationRunResult = {
      ok: true,
      pendingSignals: signals.length,
      evaluated: 0,
      closed: 0,
      partial: 0,
      open: 0,
      expired: 0,
      ambiguous: 0,
      errors: 0,
      items: [],
    };

    for (const [index, signal] of signals.entries()) {
      if (index > 0) {
        await this.dependencies.rateLimiterService?.wait();
      }

      const item = await this.evaluateSignalSafely(signal, logger);
      result.items.push(item);

      if (item.error) {
        result.errors += 1;
        continue;
      }

      result.evaluated += 1;

      switch (item.status) {
        case 'CLOSED':
          result.closed += 1;
          break;
        case 'PARTIALLY_RESOLVED':
          result.partial += 1;
          break;
        case 'OPEN':
          result.open += 1;
          break;
        case 'EXPIRED':
          result.expired += 1;
          break;
        case 'AMBIGUOUS':
          result.ambiguous += 1;
          break;
        default:
          break;
      }
    }

    result.ok = result.errors === 0;
    logger.log(
      [
        'Forward evaluation completed',
        `evaluated=${result.evaluated}`,
        `closed=${result.closed}`,
        `partial=${result.partial}`,
        `open=${result.open}`,
        `expired=${result.expired}`,
        `ambiguous=${result.ambiguous}`,
        `errors=${result.errors}`,
      ].join(' '),
    );

    return result;
  }

  private async evaluateSignalSafely(
    signal: PersistedForwardSignalSnapshot,
    logger: ForwardSignalEvaluatorLogger,
  ): Promise<ForwardSignalEvaluationResultItem> {
    try {
      const result = await this.evaluateSignal(signal);
      logger.log(
        `${signal.ticker} ${signal.timeframe} → TP1 ${result.outcomeTp1 ?? 'pending'} / TP2 ${result.outcomeTp2 ?? 'pending'} (${result.status})`,
      );
      return {
        signalId: signal.id,
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        evaluationTimeframe: result.evaluationTimeframe,
        status: result.status,
        outcomeTp1: result.outcomeTp1,
        outcomeTp2: result.outcomeTp2,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'forward-signal-evaluation-failed';
      logger.error(`No se pudo evaluar señal forward ${signal.ticker}`, {
        signalId: signal.id,
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        message,
      });
      return {
        signalId: signal.id,
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        error: message,
      };
    }
  }

  private async evaluateSignal(signal: PersistedForwardSignalSnapshot): Promise<{
    evaluationTimeframe: string;
    status: SignalEvaluationStatus;
    outcomeTp1?: BacktestOutcome;
    outcomeTp2?: BacktestOutcome;
  }> {
    const now = this.dependencies.now?.() ?? new Date();
    const expiresAt = this.calculateExpiresAt(signal.signalAt, signal.timeframe);
    const { timeframe, candles } = await this.getCandlesWithFallback(signal, expiresAt, now);

    if (candles.length === 0) {
      throw new Error('forward-evaluation-no-future-candles');
    }

    const evaluatedUntil = candles.at(-1)?.timestamp;
    const rawEvaluation = this.tradeOutcomeEvaluator.evaluate({
      entry: signal.entry,
      stopLoss: signal.financialStopPrice,
      takeProfit1: signal.tp1Price,
      takeProfit2: signal.tp2Price,
      signalAt: signal.signalAt,
      expiresAt,
      candles,
    });
    const isExpired = now.getTime() >= expiresAt.getTime();
    const outcomeTp1 = this.resolveTargetOutcome(rawEvaluation.outcomeTp1, isExpired);
    const outcomeTp2 = this.resolveTargetOutcome(rawEvaluation.outcomeTp2, isExpired);
    const status = this.resolveStatus(outcomeTp1, outcomeTp2);

    await this.dependencies.signalEvaluationRepository.upsert({
      signalId: signal.id,
      outcomeTp1,
      outcomeTp2,
      exitAtTp1: outcomeTp1 ? rawEvaluation.outcomeTp1.exitAt : undefined,
      exitAtTp2: outcomeTp2 ? rawEvaluation.outcomeTp2.exitAt : undefined,
      candlesUntilTp1: outcomeTp1 ? rawEvaluation.outcomeTp1.candlesUntil : undefined,
      candlesUntilTp2: outcomeTp2 ? rawEvaluation.outcomeTp2.candlesUntil : undefined,
      maxFavorableExcursionPercent: roundPercent(rawEvaluation.maxFavorableExcursionPercent),
      maxAdverseExcursionPercent: roundPercent(rawEvaluation.maxAdverseExcursionPercent),
      evaluatedUntil,
      status,
    });

    return {
      evaluationTimeframe: timeframe,
      status,
      outcomeTp1,
      outcomeTp2,
    };
  }

  private async getCandlesWithFallback(
    signal: PersistedForwardSignalSnapshot,
    expiresAt: Date,
    now: Date,
  ): Promise<{ timeframe: string; candles: Awaited<ReturnType<HistoricalMarketDataProvider['getHistoricalCandles']>> }> {
    const timeframes = resolveForwardEvaluationTimeframes(signal.timeframe);
    const from = signal.signalAt;
    const to = new Date(Math.min(now.getTime(), expiresAt.getTime()));
    const errors: string[] = [];

    for (const timeframe of timeframes) {
      try {
        const candles = await this.dependencies.marketDataService.getHistoricalCandles(
          signal.ticker,
          timeframe,
          from,
          to,
        );
        const futureCandles = candles
          .filter((candle) => candle.timestamp.getTime() > signal.signalAt.getTime())
          .filter((candle) => candle.timestamp.getTime() <= expiresAt.getTime())
          .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

        if (futureCandles.length > 0) {
          return { timeframe, candles: futureCandles };
        }

        errors.push(`${timeframe}: no-future-candles`);
      } catch (error) {
        errors.push(`${timeframe}: ${error instanceof Error ? error.message : 'market-data-failed'}`);
      }
    }

    throw new Error(`forward-evaluation-market-data-unavailable (${errors.join('; ')})`);
  }

  private resolveTargetOutcome(
    target: TargetOutcomeEvaluation,
    isExpired: boolean,
  ): BacktestOutcome | undefined {
    if (target.outcome !== 'EXPIRED') {
      return target.outcome;
    }

    return isExpired ? 'EXPIRED' : undefined;
  }

  private resolveStatus(
    outcomeTp1: BacktestOutcome | undefined,
    outcomeTp2: BacktestOutcome | undefined,
  ): SignalEvaluationStatus {
    if (outcomeTp1 === 'AMBIGUOUS' || outcomeTp2 === 'AMBIGUOUS') {
      return 'AMBIGUOUS';
    }

    if (!outcomeTp1 && !outcomeTp2) {
      return 'OPEN';
    }

    if (!outcomeTp1 || !outcomeTp2) {
      return 'PARTIALLY_RESOLVED';
    }

    if (outcomeTp1 === 'EXPIRED' || outcomeTp2 === 'EXPIRED') {
      return 'EXPIRED';
    }

    return 'CLOSED';
  }

  private calculateExpiresAt(signalAt: Date, timeframe: string): Date {
    const normalizedTimeframe = timeframe.trim().toLowerCase();
    const days = this.expirationWindows[normalizedTimeframe];

    if (!days) {
      throw new Error(
        `Unsupported forward evaluation timeframe: ${timeframe}. Supported: ${Object.keys(this.expirationWindows).join(', ')}`,
      );
    }

    return new Date(signalAt.getTime() + days * DAY_IN_MILLISECONDS);
  }

  private compactExpirationWindows(
    expirationWindows: Partial<Record<string, number>> | undefined,
  ): Record<string, number> {
    if (!expirationWindows) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(expirationWindows).filter((entry): entry is [string, number] => {
        const [, value] = entry;
        return typeof value === 'number' && Number.isFinite(value) && value > 0;
      }),
    );
  }
}

const roundPercent = (value: number): number => {
  const factor = 100;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
