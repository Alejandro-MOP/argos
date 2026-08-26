import type { Candle } from '../models/Candle';
import type { Opportunity } from '../models/Opportunity';
import type { Signal } from '../models/Signal';
import type { ForwardSignalSnapshot } from '../models/ForwardSignal';
import type { SignalContext } from '../models/SignalContext';
import {
  InsufficientCandlesError,
  MarketDataProviderError,
  MarketDataRateLimitError,
} from '../errors/MarketDataErrors';
import type { OpportunityRepository } from '../ports/OpportunityRepository';
import type { ForwardSignalRepository } from '../ports/ForwardSignalRepository';
import type { SignalRepository } from '../ports/SignalRepository';
import type { MarketDataService } from './MarketDataService';
import type { NotificationService } from './NotificationService';
import type { OpportunityFilter } from './OpportunityFilter';
import type { OpportunityService } from './OpportunityService';
import type { RankingService } from './RankingService';
import type { RateLimiterService } from './RateLimiterService';
import type { RiskService } from './RiskService';
import type { SignalContextService } from './SignalContextService';
import type { WatchlistService } from './WatchlistService';
import { calculateTradePlan, type TradePlanConfig } from '../utils/tradeSizing.utils';

const MINIMUM_PROVIDER_CANDLES = 60;

export interface MarketScanLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface MarketScanOptions {
  tickers?: string[];
  timeframe?: string;
  timeframes?: string[];
  candleLimit: number;
  notify: boolean;
  capital?: number;
  opportunityMinScore?: number;
  telegramNotificationMinScore?: number;
}

export type MarketScanSkippedReason =
  | 'below-threshold'
  | 'below-telegram-threshold'
  | 'duplicate-window'
  | 'insufficient-data'
  | 'invalid-risk'
  | 'stale-market-data';

export interface MarketScanCombination {
  ticker: string;
  timeframe: string;
}

export interface MarketScanResult {
  scannedTickers: string[];
  scanned: MarketScanCombination[];
  opportunities: Opportunity[];
  opportunitySignals: Signal[];
  notifiedSignals: Signal[];
  skipped: Array<{
    ticker: string;
    timeframe?: string;
    score: number;
    reason: MarketScanSkippedReason;
    lastTimestamp?: Date;
    dataAgeMinutes?: number;
    maxAllowedAgeMinutes?: number;
  }>;
  errors: Array<{
    ticker: string;
    timeframe?: string;
    message: string;
    candlesCount?: number;
    requestedFrom?: string;
    requestedTo?: string;
    status?: number;
    statusText?: string;
    provider?: string;
    endpoint?: string;
    requestId?: string;
  }>;
}

export interface MarketScanExecutorDependencies {
  marketDataService: MarketDataService;
  watchlistService: WatchlistService;
  opportunityService: OpportunityService;
  rankingService: RankingService;
  opportunityFilter: OpportunityFilter;
  riskService: RiskService;
  opportunityRepository: OpportunityRepository;
  signalRepository: SignalRepository;
  forwardSignalRepository?: ForwardSignalRepository;
  notificationService: NotificationService;
  signalContextService?: SignalContextService;
  rateLimiterService: RateLimiterService;
  debug?: boolean;
  marketDataMaxAgeMinutes: number;
  marketDataMaxRetries: number;
  marketDataRetryBaseDelayMs: number;
  marketDataSequential: boolean;
  tradePlan?: TradePlanConfig;
}

export class MarketScanExecutor {
  public constructor(private readonly dependencies: MarketScanExecutorDependencies) {}

  public async run(
    options: MarketScanOptions,
    logger: MarketScanLogger,
  ): Promise<MarketScanResult> {
    const tickers = this.resolveTickers(options.tickers);
    const timeframes = this.resolveTimeframes(options);
    const scanned = this.buildScanCombinations(tickers, timeframes);
    const analyzedOpportunities: Opportunity[] = [];
    const candlesBySignalKey = new Map<string, Candle[]>();
    const errors: MarketScanResult['errors'] = [];
    const skipped: MarketScanResult['skipped'] = [];

    logger.log(
      `Iniciando escaneo de mercado tickers=${tickers.length} timeframes=${timeframes.length} totalCombinations=${scanned.length}`,
    );
    this.debugLog(
      logger,
      [
        `Debug de escaneo habilitado. temporalidades=${timeframes.join(',')}`,
        `limiteVelas=${options.candleLimit}`,
        `notificar=${options.notify}`,
        `opportunityMinScore=${this.getOpportunityMinScore(options)}`,
        `telegramMinScore=${this.getTelegramMinScore(options)}`,
      ].join(' '),
    );

    const scanResults = this.dependencies.marketDataSequential
      ? await this.scanTickersSequentially(tickers, options, logger)
      : await this.scanTickersInParallel(tickers, options, logger);

    for (const scanResult of scanResults) {
      analyzedOpportunities.push(...scanResult.opportunities);
      skipped.push(...scanResult.skipped);
      errors.push(...scanResult.errors);

      for (const [signalKey, candles] of scanResult.candlesBySignalKey) {
        candlesBySignalKey.set(signalKey, candles);
      }
    }

    const rankedOpportunities = this.dependencies.rankingService.rank(analyzedOpportunities);
    const validOpportunities: Opportunity[] = [];
    const opportunitySignals: Signal[] = [];
    const notifiedSignals: Signal[] = [];

    for (const opportunity of rankedOpportunities) {
      const candles = candlesBySignalKey.get(
        this.buildSignalKey(opportunity.ticker, opportunity.timeframe),
      );

      if (!candles) {
        skipped.push({
          ticker: opportunity.ticker,
          timeframe: opportunity.timeframe,
          score: opportunity.score,
          reason: 'insufficient-data',
        });
        continue;
      }

      const filterResult = await this.dependencies.opportunityFilter.evaluate(
        opportunity,
        options.opportunityMinScore,
      );

      if (!filterResult.shouldNotify) {
        const reason = filterResult.reason ?? 'below-threshold';
        logger.log(
          `Oportunidad omitida para ${opportunity.ticker}. Score: ${opportunity.score}. Motivo: ${reason}`,
        );
        skipped.push({
          ticker: opportunity.ticker,
          timeframe: opportunity.timeframe,
          score: opportunity.score,
          reason,
        });
        continue;
      }

      validOpportunities.push(opportunity);

      const signal = this.dependencies.riskService.calculateRisk(opportunity, candles);

      if (!signal) {
        skipped.push({
          ticker: opportunity.ticker,
          timeframe: opportunity.timeframe,
          score: opportunity.score,
          reason: 'invalid-risk',
        });
        continue;
      }

      opportunitySignals.push(signal);

      const willNotify = this.dependencies.notificationService.shouldNotifyOpportunity(
        opportunity,
        options.telegramNotificationMinScore,
      );
      this.logNotificationDecisionDebug(opportunity, willNotify, logger, options);

      if (!willNotify) {
        await this.dependencies.opportunityRepository.save(opportunity);
        skipped.push({
          ticker: opportunity.ticker,
          timeframe: opportunity.timeframe,
          score: opportunity.score,
          reason: 'below-telegram-threshold',
        });
        continue;
      }

      await this.dependencies.opportunityRepository.save(opportunity);
      await this.dependencies.signalRepository.save(signal);

      if (options.notify) {
        await this.persistForwardSignal(signal, opportunity, logger, true);
        const signalContext = await this.buildSignalContext(signal, opportunity, logger);
        await this.dependencies.notificationService.sendSignal(
          signal,
          opportunity,
          options.capital,
          signalContext,
        );
      }

      notifiedSignals.push(signal);
      logger.log(`Señal generada para ${signal.ticker} ${signal.timeframe}`);
    }

    logger.log('Escaneo de mercado finalizado');

    return {
      scannedTickers: tickers,
      scanned,
      opportunities: validOpportunities,
      opportunitySignals,
      notifiedSignals,
      skipped,
      errors,
    };
  }


  private async persistForwardSignal(
    signal: Signal,
    opportunity: Opportunity,
    logger: MarketScanLogger,
    telegramSent: boolean,
  ): Promise<void> {
    if (!this.dependencies.forwardSignalRepository || !this.dependencies.tradePlan) {
      return;
    }

    const snapshot = this.buildForwardSignalSnapshot(
      signal,
      opportunity,
      this.dependencies.tradePlan,
      telegramSent,
    );

    if (!snapshot) {
      return;
    }

    try {
      await this.dependencies.forwardSignalRepository.save(snapshot);
    } catch (error) {
      logger.error(`No se pudo persistir señal forward para ${signal.ticker}`, {
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        message: error instanceof Error ? error.message : 'forward-signal-persistence-failed',
      });
    }
  }

  private buildForwardSignalSnapshot(
    signal: Signal,
    opportunity: Opportunity,
    tradePlanConfig: TradePlanConfig,
    telegramSent: boolean,
  ): ForwardSignalSnapshot | undefined {
    const tradePlan = calculateTradePlan(signal, tradePlanConfig);

    if (!tradePlan) {
      return undefined;
    }

    return {
      ticker: signal.ticker,
      timeframe: signal.timeframe,
      signalType: signal.signalType,
      signalAt: signal.createdAt,
      score: opportunity.score,
      trendScore: opportunity.trendScore,
      volumeScore: opportunity.volumeScore,
      momentumScore: opportunity.momentumScore,
      structureScore: opportunity.structureScore,
      entry: tradePlan.entry,
      technicalStopPrice: tradePlan.technicalStop.price,
      financialStopPercent: tradePlan.financialStop.percent,
      financialStopPrice: tradePlan.financialStop.price,
      tp1Percent: tradePlan.targets.min.percent,
      tp1Price: tradePlan.targets.min.price,
      tp2Percent: tradePlan.targets.max.percent,
      tp2Price: tradePlan.targets.max.price,
      telegramSent,
    };
  }


  private async buildSignalContext(
    signal: Signal,
    opportunity: Opportunity,
    logger: MarketScanLogger,
  ): Promise<SignalContext | undefined> {
    if (!this.dependencies.signalContextService) {
      return undefined;
    }

    try {
      return await this.dependencies.signalContextService.buildContext(signal, opportunity);
    } catch (error) {
      logger.error(`No se pudo construir contexto de señal para ${signal.ticker}`, {
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        message: error instanceof Error ? error.message : 'signal-context-failed',
      });
      return undefined;
    }
  }

  private resolveTickers(tickers?: string[]): string[] {
    if (tickers && tickers.length > 0) {
      return tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean);
    }

    return this.dependencies.watchlistService.getTickers();
  }

  private async scanTickersSequentially(
    tickers: string[],
    options: MarketScanOptions,
    logger: MarketScanLogger,
  ): Promise<TickerScanResult[]> {
    const results: TickerScanResult[] = [];
    const timeframes = this.resolveTimeframes(options);
    let combinationIndex = 0;

    for (const ticker of tickers) {
      for (const timeframe of timeframes) {
        results.push(
          await this.scanTickerTimeframe(ticker, timeframe, options, logger, combinationIndex > 0),
        );
        combinationIndex += 1;
      }
    }

    return results;
  }

  private async scanTickersInParallel(
    tickers: string[],
    options: MarketScanOptions,
    logger: MarketScanLogger,
  ): Promise<TickerScanResult[]> {
    this.debugLog(
      logger,
      'MARKET_DATA_SEQUENTIAL=false; las llamadas paralelas pueden provocar 429 en planes gratuitos',
    );

    const timeframes = this.resolveTimeframes(options);
    const combinations = this.buildScanCombinations(tickers, timeframes);

    return Promise.all(
      combinations.map((combination) =>
        this.scanTickerTimeframe(combination.ticker, combination.timeframe, options, logger, false),
      ),
    );
  }

  private async scanTickerTimeframe(
    ticker: string,
    timeframe: string,
    options: MarketScanOptions,
    logger: MarketScanLogger,
    shouldWaitBeforeRequest: boolean,
  ): Promise<TickerScanResult> {
    const result: TickerScanResult = {
      opportunities: [],
      skipped: [],
      errors: [],
      candlesBySignalKey: new Map<string, Candle[]>(),
    };

    try {
      if (shouldWaitBeforeRequest) {
        await this.dependencies.rateLimiterService.wait();
      }

      const candles = await this.getCandlesWithRetry(
        ticker,
        timeframe,
        options.candleLimit,
      );
      logger.log(`Processing ${ticker} ${timeframe}`);
      this.logCandleSummary(ticker, timeframe, candles, logger);

      if (candles.length < MINIMUM_PROVIDER_CANDLES) {
        throw new InsufficientCandlesError(ticker, candles.length, 'n/a', 'n/a');
      }

      if (candles.length < options.candleLimit) {
        logger.log(
          `Omitiendo ${ticker} ${timeframe}: datos insuficientes velas=${candles.length} esperado=${options.candleLimit}`,
        );
        result.skipped.push({
          ticker,
          timeframe,
          score: 0,
          reason: 'insufficient-data',
        });
        return result;
      }

      const freshness = this.calculateDataFreshness(candles);
      this.logFreshnessDebug(ticker, freshness, logger);

      if (
        this.isIntradayTimeframe(timeframe) &&
        freshness.dataAgeMinutes > this.dependencies.marketDataMaxAgeMinutes
      ) {
        result.skipped.push({
          ticker,
          timeframe,
          score: 0,
          reason: 'stale-market-data',
          lastTimestamp: freshness.lastTimestamp,
          dataAgeMinutes: freshness.dataAgeMinutes,
          maxAllowedAgeMinutes: this.dependencies.marketDataMaxAgeMinutes,
        });
        return result;
      }

      const opportunity = this.dependencies.opportunityService.analyze(
        ticker,
        timeframe,
        candles,
      );

      result.opportunities.push(opportunity);
      result.candlesBySignalKey.set(this.buildSignalKey(ticker, timeframe), candles);
    } catch (error) {
      const scanError = this.buildScanError(ticker, timeframe, error);
      logger.error(`No se pudo escanear ${ticker} ${timeframe}`, scanError);
      result.errors.push(scanError);
    }

    return result;
  }

  private async getCandlesWithRetry(
    ticker: string,
    timeframe: string,
    candleLimit: number,
  ): Promise<Candle[]> {
    let attempt = 0;

    while (true) {
      try {
        return await this.dependencies.marketDataService.getCandles(ticker, timeframe, candleLimit);
      } catch (error) {
        if (
          !(error instanceof MarketDataRateLimitError) ||
          attempt >= this.dependencies.marketDataMaxRetries
        ) {
          throw error;
        }

        const delayMs = this.dependencies.marketDataRetryBaseDelayMs * 2 ** attempt;
        attempt += 1;
        await this.sleep(delayMs);
      }
    }
  }

  private logCandleSummary(
    ticker: string,
    timeframe: string,
    candles: Candle[],
    logger: MarketScanLogger,
  ): void {
    const firstCandle = candles.at(0);
    const lastCandle = candles.at(-1);

    logger.log(
      [
        `Datos de mercado ticker=${ticker}`,
        `timeframe=${timeframe}`,
        `velas=${candles.length}`,
        `primerTimestamp=${firstCandle?.timestamp.toISOString() ?? 'n/a'}`,
        `ultimoTimestamp=${lastCandle?.timestamp.toISOString() ?? 'n/a'}`,
        `ultimoCierre=${lastCandle?.close ?? 'n/a'}`,
        `ultimoVolumen=${lastCandle?.volume ?? 'n/a'}`,
      ].join(' '),
    );
  }

  private debugLog(logger: MarketScanLogger, message: string): void {
    if (this.dependencies.debug) {
      logger.log(`[debug] ${message}`);
    }
  }

  private calculateDataFreshness(candles: Candle[]): {
    lastTimestamp?: Date;
    now: Date;
    dataAgeMinutes: number;
  } {
    const now = new Date();
    const lastTimestamp = candles.at(-1)?.timestamp;
    const dataAgeMinutes = lastTimestamp
      ? Math.max(0, Math.floor((now.getTime() - lastTimestamp.getTime()) / 60_000))
      : Number.POSITIVE_INFINITY;

    return {
      lastTimestamp,
      now,
      dataAgeMinutes,
    };
  }

  private isIntradayTimeframe(timeframe: string): boolean {
    return /^(\d+)\s*(m|min|minute|minutes|h|hour|hours)$/i.test(timeframe.trim());
  }

  private logFreshnessDebug(
    ticker: string,
    freshness: {
      lastTimestamp?: Date;
      now: Date;
      dataAgeMinutes: number;
    },
    logger: MarketScanLogger,
  ): void {
    const isStale = freshness.dataAgeMinutes > this.dependencies.marketDataMaxAgeMinutes;

    this.debugLog(
      logger,
      [
        `frescuraDatos ticker=${ticker}`,
        `lastTimestamp=${freshness.lastTimestamp?.toISOString() ?? 'n/a'}`,
        `now=${freshness.now.toISOString()}`,
        `dataAgeMinutes=${freshness.dataAgeMinutes}`,
        `isStale=${isStale}`,
      ].join(' '),
    );
  }

  private logNotificationDecisionDebug(
    opportunity: Opportunity,
    willNotify: boolean,
    logger: MarketScanLogger,
    options: MarketScanOptions,
  ): void {
    this.debugLog(
      logger,
      [
        `decisionNotificacion ticker=${opportunity.ticker}`,
        `score=${opportunity.score}`,
        `opportunityMinScore=${this.getOpportunityMinScore(options)}`,
        `telegramMinScore=${this.getTelegramMinScore(options)}`,
        `willNotify=${willNotify}`,
      ].join(' '),
    );
  }


  private getOpportunityMinScore(options: MarketScanOptions): number {
    return options.opportunityMinScore ?? this.dependencies.opportunityFilter.getMinimumScore();
  }

  private getTelegramMinScore(options: MarketScanOptions): number {
    return (
      options.telegramNotificationMinScore ?? this.dependencies.notificationService.getMinimumScore()
    );
  }


  private resolveTimeframes(options: MarketScanOptions): string[] {
    const configuredTimeframes =
      options.timeframes && options.timeframes.length > 0
        ? options.timeframes
        : [options.timeframe ?? '15m'];

    return [...new Set(configuredTimeframes.map((timeframe) => timeframe.trim().toLowerCase()))];
  }

  private buildScanCombinations(tickers: string[], timeframes: string[]): MarketScanCombination[] {
    return tickers.flatMap((ticker) => timeframes.map((timeframe) => ({ ticker, timeframe })));
  }

  private buildSignalKey(ticker: string, timeframe: string): string {
    return `${ticker}:${timeframe}`;
  }

  private buildScanError(
    ticker: string,
    timeframe: string,
    error: unknown,
  ): MarketScanResult['errors'][number] {
    if (error instanceof InsufficientCandlesError) {
      return {
        ticker: error.ticker,
        timeframe,
        message: error.message,
        candlesCount: error.candlesCount,
        requestedFrom: error.requestedFrom,
        requestedTo: error.requestedTo,
      };
    }

    if (error instanceof MarketDataRateLimitError) {
      return {
        ticker,
        timeframe,
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        provider: error.provider,
        endpoint: error.endpoint,
        requestId: error.requestId,
      };
    }

    if (error instanceof MarketDataProviderError) {
      return {
        ticker,
        timeframe,
        message: error.message,
        status: error.details.status,
        statusText: error.details.statusText,
        provider: error.details.provider,
        endpoint: error.details.endpoint,
        requestId: error.details.requestId,
      };
    }

    return {
      ticker,
      timeframe,
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }

  private async sleep(delayMs: number): Promise<void> {
    if (delayMs <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}

interface TickerScanResult {
  opportunities: Opportunity[];
  skipped: MarketScanResult['skipped'];
  errors: MarketScanResult['errors'];
  candlesBySignalKey: Map<string, Candle[]>;
}
