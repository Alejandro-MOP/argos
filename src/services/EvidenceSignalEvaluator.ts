import type { BacktestOutcome } from '../models/BacktestTrade';
import {
  EXPERIMENTAL_TARGET_PERCENTS,
  type PersistedEvidenceSignalSnapshot,
} from '../models/EvidenceSignal';
import type { SignalEvaluationStatus } from '../models/ForwardSignal';
import type { EvidenceSignalEvaluationRepository } from '../ports/EvidenceSignalEvaluationRepository';
import type { EvidenceSignalRepository } from '../ports/EvidenceSignalRepository';
import type { HistoricalMarketDataProvider } from './MarketDataService';
import type { RateLimiterService } from './RateLimiterService';
import { resolveForwardEvaluationTimeframes } from './ForwardSignalEvaluator';
import { TradeOutcomeEvaluator, type TargetOutcomeEvaluation } from './TradeOutcomeEvaluator';
import { DEFAULT_BACKTEST_EXPIRATION_WINDOWS_DAYS } from '../backtesting/BacktestEngine';

const DAY_IN_MILLISECONDS = 86_400_000;
const DEFAULT_PENDING_LIMIT = 100;
const EVALUATION_HISTORICAL_DATA_OPTIONS = { minimumCandles: 0 };

type EvaluationPendingReason = 'no-future-candles-yet';

export interface EvidenceSignalEvaluatorLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface EvidenceSignalEvaluationFilters {
  evidenceSignalId?: string;
  ticker?: string;
  limit?: number;
}

export interface EvidenceSignalEvaluationResultItem {
  evidenceSignalId: string;
  ticker: string;
  timeframe: string;
  evaluationTimeframe?: string;
  status?: SignalEvaluationStatus;
  outcomeTp1?: BacktestOutcome;
  outcomeTp2?: BacktestOutcome;
  pendingReason?: EvaluationPendingReason;
  error?: string;
}

export interface EvidenceSignalEvaluationRunResult {
  ok: boolean;
  pendingSignals: number;
  evaluated: number;
  closed: number;
  partial: number;
  open: number;
  expired: number;
  ambiguous: number;
  pendingNoFutureCandles: number;
  providerErrors: number;
  errors: number;
  items: EvidenceSignalEvaluationResultItem[];
}

export interface EvidenceSignalEvaluatorDependencies {
  evidenceSignalRepository: EvidenceSignalRepository;
  evidenceSignalEvaluationRepository: EvidenceSignalEvaluationRepository;
  marketDataService: HistoricalMarketDataProvider;
  tradeOutcomeEvaluator?: TradeOutcomeEvaluator;
  rateLimiterService?: Pick<RateLimiterService, 'wait'>;
  now?: () => Date;
  expirationWindows?: Partial<Record<string, number>>;
}

export class EvidenceSignalEvaluator {
  private readonly tradeOutcomeEvaluator: TradeOutcomeEvaluator;
  private readonly expirationWindows: Record<string, number>;

  public constructor(private readonly dependencies: EvidenceSignalEvaluatorDependencies) {
    this.tradeOutcomeEvaluator = dependencies.tradeOutcomeEvaluator ?? new TradeOutcomeEvaluator();
    this.expirationWindows = {
      ...DEFAULT_BACKTEST_EXPIRATION_WINDOWS_DAYS,
      ...this.compactExpirationWindows(dependencies.expirationWindows),
    };
  }

  public async execute(
    filters: EvidenceSignalEvaluationFilters = {},
    logger: EvidenceSignalEvaluatorLogger = console,
  ): Promise<EvidenceSignalEvaluationRunResult> {
    logger.log('Evidence evaluation started');

    const signals = await this.dependencies.evidenceSignalRepository.findPending({
      evidenceSignalId: filters.evidenceSignalId,
      ticker: filters.ticker,
      limit: filters.limit ?? DEFAULT_PENDING_LIMIT,
    });

    logger.log(`Pending evidence signals: ${signals.length}`);

    const result: EvidenceSignalEvaluationRunResult = {
      ok: true,
      pendingSignals: signals.length,
      evaluated: 0,
      closed: 0,
      partial: 0,
      open: 0,
      expired: 0,
      ambiguous: 0,
      pendingNoFutureCandles: 0,
      providerErrors: 0,
      errors: 0,
      items: [],
    };

    for (const [index, signal] of signals.entries()) {
      if (index > 0) {
        await this.dependencies.rateLimiterService?.wait();
      }

      const item = await this.evaluateSignalSafely(signal, logger);
      result.items.push(item);

      if (item.pendingReason === 'no-future-candles-yet') {
        result.pendingNoFutureCandles += 1;
        continue;
      }

      if (item.error) {
        result.providerErrors += 1;
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
        'Evidence evaluation completed',
        `evaluated=${result.evaluated}`,
        `closed=${result.closed}`,
        `partial=${result.partial}`,
        `open=${result.open}`,
        `expired=${result.expired}`,
        `ambiguous=${result.ambiguous}`,
        `pendingNoFutureCandles=${result.pendingNoFutureCandles}`,
        `providerErrors=${result.providerErrors}`,
        `errors=${result.errors}`,
      ].join(' '),
    );

    return result;
  }

  private async evaluateSignalSafely(
    signal: PersistedEvidenceSignalSnapshot,
    logger: EvidenceSignalEvaluatorLogger,
  ): Promise<EvidenceSignalEvaluationResultItem> {
    try {
      const result = await this.evaluateSignal(signal);
      if (result.pendingReason) {
        logger.log(`${signal.ticker} ${signal.timeframe} evidence → pending (${result.pendingReason})`);
        return {
          evidenceSignalId: signal.id,
          ticker: signal.ticker,
          timeframe: signal.timeframe,
          pendingReason: result.pendingReason,
        };
      }

      logger.log(
        `${signal.ticker} ${signal.timeframe} evidence → TP1 ${result.outcomeTp1 ?? 'pending'} / TP2 ${result.outcomeTp2 ?? 'pending'} (${result.status})`,
      );
      return {
        evidenceSignalId: signal.id,
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        evaluationTimeframe: result.evaluationTimeframe,
        status: result.status,
        outcomeTp1: result.outcomeTp1,
        outcomeTp2: result.outcomeTp2,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'evidence-signal-evaluation-failed';
      logger.error(`No se pudo evaluar evidence signal ${signal.ticker}`, {
        evidenceSignalId: signal.id,
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        message,
      });
      return {
        evidenceSignalId: signal.id,
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        error: message,
      };
    }
  }

  private async evaluateSignal(signal: PersistedEvidenceSignalSnapshot): Promise<{
    evaluationTimeframe?: string;
    status?: SignalEvaluationStatus;
    outcomeTp1?: BacktestOutcome;
    outcomeTp2?: BacktestOutcome;
    pendingReason?: EvaluationPendingReason;
  }> {
    const now = this.dependencies.now?.() ?? new Date();
    const expiresAt = this.calculateExpiresAt(signal.detectedAt, signal.timeframe);
    const { timeframe, candles, pendingReason } = await this.getCandlesWithFallback(signal, expiresAt, now);

    if (pendingReason) {
      return { pendingReason };
    }

    const evaluatedUntil = candles.at(-1)?.timestamp;
    const rawEvaluation = this.tradeOutcomeEvaluator.evaluate({
      entry: signal.entry,
      stopLoss: signal.financialStopPrice,
      takeProfit1: signal.tp1Price,
      takeProfit2: signal.tp2Price,
      signalAt: signal.detectedAt,
      expiresAt,
      candles,
    });
    const isExpired = now.getTime() >= expiresAt.getTime();
    const outcomeTp1 = this.resolveTargetOutcome(rawEvaluation.outcomeTp1, isExpired);
    const outcomeTp2 = this.resolveTargetOutcome(rawEvaluation.outcomeTp2, isExpired);
    const status = this.resolveStatus(outcomeTp1, outcomeTp2);

    await this.dependencies.evidenceSignalEvaluationRepository.upsert({
      evidenceSignalId: signal.id,
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

    await this.dependencies.evidenceSignalEvaluationRepository.upsertTargetEvaluations(
      EXPERIMENTAL_TARGET_PERCENTS.map((targetPercent) => {
        const targetPrice = roundPrice(signal.entry * (1 + targetPercent / 100));
        const targetEvaluation = this.tradeOutcomeEvaluator.evaluateTarget({
          entry: signal.entry,
          stopLoss: signal.financialStopPrice,
          takeProfit: targetPrice,
          signalAt: signal.detectedAt,
          expiresAt,
          candles,
        });
        const outcome = this.resolveTargetOutcome(targetEvaluation, isExpired);

        return {
          evidenceSignalId: signal.id,
          targetPercent,
          targetPrice,
          outcome,
          hitAt: outcome ? targetEvaluation.exitAt : undefined,
          candlesUntil: outcome ? targetEvaluation.candlesUntil : undefined,
        };
      }),
    );

    return {
      evaluationTimeframe: timeframe,
      status,
      outcomeTp1,
      outcomeTp2,
    };
  }

  private async getCandlesWithFallback(
    signal: PersistedEvidenceSignalSnapshot,
    expiresAt: Date,
    now: Date,
  ): Promise<{
    timeframe?: string;
    candles: Awaited<ReturnType<HistoricalMarketDataProvider['getHistoricalCandles']>>;
    pendingReason?: EvaluationPendingReason;
  }> {
    const timeframes = resolveForwardEvaluationTimeframes(signal.timeframe);
    const from = signal.detectedAt;
    const to = new Date(Math.min(now.getTime(), expiresAt.getTime()));
    const errors: string[] = [];
    let hasProviderResponse = false;

    for (const timeframe of timeframes) {
      try {
        const candles = await this.dependencies.marketDataService.getHistoricalCandles(
          signal.providerSymbol ?? signal.ticker,
          timeframe,
          from,
          to,
          EVALUATION_HISTORICAL_DATA_OPTIONS,
        );
        hasProviderResponse = true;
        const futureCandles = candles
          .filter((candle) => candle.timestamp.getTime() > signal.detectedAt.getTime())
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

    if (hasProviderResponse) {
      return { candles: [], pendingReason: 'no-future-candles-yet' };
    }

    throw new Error(`evidence-evaluation-market-data-unavailable (${errors.join('; ')})`);
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
        `Unsupported evidence evaluation timeframe: ${timeframe}. Supported: ${Object.keys(this.expirationWindows).join(', ')}`,
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

const roundPrice = (value: number): number => {
  const decimals = Math.abs(value) >= 1 ? 4 : 8;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
