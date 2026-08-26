import type { Candle } from '../models/Candle';
import type { EngineRuntimeConfig } from '../models/EngineConfig';
import type { ForwardSignalSnapshot } from '../models/ForwardSignal';
import type { MarketScanCandidate } from '../models/MarketSymbol';
import type { Opportunity } from '../models/Opportunity';
import type { Signal } from '../models/Signal';
import type { SignalContext } from '../models/SignalContext';
import {
  InsufficientCandlesError,
  MarketDataProviderError,
  MarketDataRateLimitError,
} from '../errors/MarketDataErrors';
import type { ForwardSignalRepository } from '../ports/ForwardSignalRepository';
import type { OpportunityRepository } from '../ports/OpportunityRepository';
import type { SignalRepository } from '../ports/SignalRepository';
import type { MarketDataService } from './MarketDataService';
import type { EngineConfigService } from './EngineConfigService';
import type { MarketSessionService } from './MarketSessionService';
import type { MarketUniverseService } from './MarketUniverseService';
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
  candleLimit?: number;
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
  | 'market-closed'
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
  engineConfigService?: EngineConfigService;
  marketUniverseService?: MarketUniverseService;
  marketSessionService?: MarketSessionService;
  opportunityServiceFactory?: (config: EngineRuntimeConfig) => OpportunityService;
  opportunityFilterFactory?: (config: EngineRuntimeConfig) => OpportunityFilter;
  notificationServiceFactory?: (config: EngineRuntimeConfig) => NotificationService;
  signalContextServiceFactory?: (config: EngineRuntimeConfig) => SignalContextService;
  rateLimiterServiceFactory?: (requestDelayMs: number) => RateLimiterService;
  debug?: boolean;
  marketDataMaxAgeMinutes: number;
  marketDataMaxRetries: number;
  marketDataRetryBaseDelayMs: number;
  marketDataSequential: boolean;
  tradePlan?: TradePlanConfig;
  strategyVersion?: string;
  defaultTimeframes?: string[];
}

interface MarketScanRuntimeServices {
  config: EngineRuntimeConfig;
  opportunityService: OpportunityService;
  opportunityFilter: OpportunityFilter;
  notificationService: NotificationService;
  signalContextService?: SignalContextService;
  rateLimiterService: RateLimiterService;
}

interface ScanExecutionContext extends MarketScanRuntimeServices {
  candleLimit: number;
}

export class MarketScanExecutor {
  public constructor(private readonly dependencies: MarketScanExecutorDependencies) {}

  public async run(
    options: MarketScanOptions,
    logger: MarketScanLogger,
  ): Promise<MarketScanResult> {
    const runtimeServices = await this.resolveRuntimeServices(logger);
    const candleLimit = options.candleLimit ?? runtimeServices.config.marketScanCandleLimit;
    const candidates = await this.resolveScanCandidates(options, runtimeServices.config, logger);
    const scanned = candidates.map((candidate) => ({
      ticker: candidate.symbol,
      timeframe: candidate.timeframe,
    }));
    const scannedTickers = [...new Set(candidates.map((candidate) => candidate.symbol))];
    const analyzedOpportunities: Opportunity[] = [];
    const candlesBySignalKey = new Map<string, Candle[]>();
    const errors: MarketScanResult['errors'] = [];
    const skipped: MarketScanResult['skipped'] = [];

    logger.log(
      `Iniciando escaneo de mercado tickers=${scannedTickers.length} timeframes=${new Set(candidates.map((candidate) => candidate.timeframe)).size} totalCombinations=${scanned.length}`,
    );
    this.debugLog(
      logger,
      [
        `Debug de escaneo habilitado. temporalidades=${[...new Set(candidates.map((candidate) => candidate.timeframe))].join(',')}`,
        `limiteVelas=${candleLimit}`,
        `notificar=${options.notify}`,
        `strategyVersion=${runtimeServices.config.strategyVersion}`,
        `opportunityMinScore=${this.getOpportunityMinScore(options, runtimeServices)}`,
        `telegramMinScore=${this.getTelegramMinScore(options, runtimeServices)}`,
      ].join(' '),
    );

    const executionContext: ScanExecutionContext = { ...runtimeServices, candleLimit };
    const scanResults = runtimeServices.config.marketDataSequential
      ? await this.scanCandidatesSequentially(candidates, executionContext, logger)
      : await this.scanCandidatesInParallel(candidates, executionContext, logger);

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

      const filterResult = await runtimeServices.opportunityFilter.evaluate(
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

      signal.strategyVersion = runtimeServices.config.strategyVersion;
      opportunitySignals.push(signal);

      const willNotify = runtimeServices.notificationService.shouldNotifyOpportunity(
        opportunity,
        options.telegramNotificationMinScore,
      );
      this.logNotificationDecisionDebug(opportunity, willNotify, logger, options, runtimeServices);

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
        await this.persistForwardSignal(signal, opportunity, logger, runtimeServices.config, true);
        const signalContext = await this.buildSignalContext(
          signal,
          opportunity,
          logger,
          runtimeServices.signalContextService,
        );
        await runtimeServices.notificationService.sendSignal(
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
      scannedTickers,
      scanned,
      opportunities: validOpportunities,
      opportunitySignals,
      notifiedSignals,
      skipped,
      errors,
    };
  }

  private async resolveRuntimeServices(logger: MarketScanLogger): Promise<MarketScanRuntimeServices> {
    const configSnapshot = this.dependencies.engineConfigService
      ? await this.dependencies.engineConfigService.loadSnapshot(logger)
      : { source: 'env-fallback' as const, values: this.buildFallbackRuntimeConfig() };
    const config = configSnapshot.values;

    return {
      config,
      opportunityService: this.dependencies.opportunityServiceFactory?.(config) ?? this.dependencies.opportunityService,
      opportunityFilter: this.dependencies.opportunityFilterFactory?.(config) ?? this.dependencies.opportunityFilter,
      notificationService: this.dependencies.notificationServiceFactory?.(config) ?? this.dependencies.notificationService,
      signalContextService: this.dependencies.signalContextServiceFactory?.(config) ?? this.dependencies.signalContextService,
      rateLimiterService:
        this.dependencies.rateLimiterServiceFactory?.(config.marketDataRequestDelayMs) ??
        this.dependencies.rateLimiterService,
    };
  }

  private buildFallbackRuntimeConfig(): EngineRuntimeConfig {
    return {
      strategyVersion: this.dependencies.strategyVersion ?? 'v1',
      marketScanCandleLimit: 80,
      marketDataMaxAgeMinutes: this.dependencies.marketDataMaxAgeMinutes,
      marketDataRequestDelayMs: 0,
      marketDataMaxRetries: this.dependencies.marketDataMaxRetries,
      marketDataRetryBaseDelayMs: this.dependencies.marketDataRetryBaseDelayMs,
      marketDataSequential: this.dependencies.marketDataSequential,
      tradePlan: this.dependencies.tradePlan ?? {
        stopLossPercent: 1,
        targetMinPercent: 2,
        targetMaxPercent: 3,
      },
      signalIntelligence: {
        backtestContextEnabled: true,
        backtestContextMonths: 24,
        performanceMinSampleSize: 20,
        forwardTestContextEnabled: true,
      },
      scoring: {
        maxAnalyzerScore: 25,
        opportunityMinScore: this.dependencies.opportunityFilter.getMinimumScore(),
        telegramNotificationMinScore: this.dependencies.notificationService.getMinimumScore(),
        duplicateWindowMinutes: 60,
        emaFastPeriod: 20,
        emaSlowPeriod: 50,
        volumeLookbackPeriod: 20,
        volumeStrongRatio: 1.5,
        volumeModerateRatio: 1.3,
        volumeWeakRatio: 1.1,
        rsiPeriod: 14,
        rsiIdealMin: 55,
        rsiIdealMax: 70,
        rsiNeutralMin: 45,
        rsiNeutralMax: 55,
        rsiExtendedMax: 80,
        structureLookbackPeriod: 20,
      },
    };
  }

  private async resolveScanCandidates(
    options: MarketScanOptions,
    config: EngineRuntimeConfig,
    logger: MarketScanLogger,
  ): Promise<MarketScanCandidate[]> {
    if (this.dependencies.marketUniverseService) {
      const universeSnapshot = await this.dependencies.marketUniverseService.loadSnapshot(logger);
      return this.dependencies.marketUniverseService.buildScanCandidates(
        universeSnapshot,
        {
          tickers: options.tickers,
          timeframe: options.timeframe,
          timeframes: options.timeframes,
          fallbackTimeframes: this.resolveFallbackTimeframes(options),
        },
        logger,
      );
    }

    const tickers = this.resolveTickers(options.tickers);
    const timeframes = this.resolveTimeframes(options);

    void config;

    return tickers.flatMap((ticker) =>
      timeframes.map((timeframe) => ({
        symbol: ticker,
        providerSymbol: ticker,
        timeframe,
        metadata: {
          symbol: ticker,
          providerSymbol: ticker,
          displayName: ticker,
          assetType: ticker.endsWith('-USD') ? 'CRYPTO' : 'STOCK',
          market: ticker.endsWith('-USD') ? 'Crypto' : 'US',
          timezone: ticker.endsWith('-USD') ? 'UTC' : 'America/New_York',
          sessionType: ticker.endsWith('-USD') ? 'TWENTY_FOUR_SEVEN' : 'US_REGULAR',
          supportsIntraday: true,
          isActive: true,
          timeframes,
        },
        source: 'env-fallback' as const,
      })),
    );
  }

  private async persistForwardSignal(
    signal: Signal,
    opportunity: Opportunity,
    logger: MarketScanLogger,
    config: EngineRuntimeConfig,
    telegramSent: boolean,
  ): Promise<void> {
    if (!this.dependencies.forwardSignalRepository) {
      return;
    }

    const snapshot = this.buildForwardSignalSnapshot(signal, opportunity, config, telegramSent);

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
    config: EngineRuntimeConfig,
    telegramSent: boolean,
  ): ForwardSignalSnapshot | undefined {
    const tradePlan = calculateTradePlan(signal, config.tradePlan);

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
      strategyVersion: config.strategyVersion,
    };
  }

  private async buildSignalContext(
    signal: Signal,
    opportunity: Opportunity,
    logger: MarketScanLogger,
    signalContextService?: SignalContextService,
  ): Promise<SignalContext | undefined> {
    if (!signalContextService) {
      return undefined;
    }

    try {
      return await signalContextService.buildContext(signal, opportunity);
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

  private async scanCandidatesSequentially(
    candidates: MarketScanCandidate[],
    context: ScanExecutionContext,
    logger: MarketScanLogger,
  ): Promise<TickerScanResult[]> {
    const results: TickerScanResult[] = [];

    for (const [index, candidate] of candidates.entries()) {
      results.push(await this.scanCandidate(candidate, context, logger, index > 0));
    }

    return results;
  }

  private async scanCandidatesInParallel(
    candidates: MarketScanCandidate[],
    context: ScanExecutionContext,
    logger: MarketScanLogger,
  ): Promise<TickerScanResult[]> {
    this.debugLog(
      logger,
      'MARKET_DATA_SEQUENTIAL=false; las llamadas paralelas pueden provocar 429 en planes gratuitos',
    );

    return Promise.all(
      candidates.map((candidate) => this.scanCandidate(candidate, context, logger, false)),
    );
  }

  private async scanCandidate(
    candidate: MarketScanCandidate,
    context: ScanExecutionContext,
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
      const sessionDecision = this.dependencies.marketSessionService?.canScan(
        candidate.metadata,
        candidate.timeframe,
      );

      if (sessionDecision && !sessionDecision.canScan) {
        result.skipped.push({
          ticker: candidate.symbol,
          timeframe: candidate.timeframe,
          score: 0,
          reason: sessionDecision.reason ?? 'market-closed',
        });
        logger.log(`Omitiendo ${candidate.symbol} ${candidate.timeframe}: market-closed`);
        return result;
      }

      if (shouldWaitBeforeRequest) {
        await context.rateLimiterService.wait();
      }

      const candles = await this.getCandlesWithRetry(
        candidate.providerSymbol,
        candidate.timeframe,
        context.candleLimit,
        context.config,
      );
      logger.log(`Processing ${candidate.symbol} ${candidate.timeframe}`);
      this.logCandleSummary(candidate.symbol, candidate.timeframe, candles, logger);

      if (candles.length < MINIMUM_PROVIDER_CANDLES) {
        throw new InsufficientCandlesError(candidate.symbol, candles.length, 'n/a', 'n/a');
      }

      if (candles.length < context.candleLimit) {
        logger.log(
          `Omitiendo ${candidate.symbol} ${candidate.timeframe}: datos insuficientes velas=${candles.length} esperado=${context.candleLimit}`,
        );
        result.skipped.push({
          ticker: candidate.symbol,
          timeframe: candidate.timeframe,
          score: 0,
          reason: 'insufficient-data',
        });
        return result;
      }

      const freshness = this.calculateDataFreshness(candles);
      this.logFreshnessDebug(candidate.symbol, freshness, logger, context.config);

      if (
        this.isIntradayTimeframe(candidate.timeframe) &&
        freshness.dataAgeMinutes > context.config.marketDataMaxAgeMinutes
      ) {
        result.skipped.push({
          ticker: candidate.symbol,
          timeframe: candidate.timeframe,
          score: 0,
          reason: 'stale-market-data',
          lastTimestamp: freshness.lastTimestamp,
          dataAgeMinutes: freshness.dataAgeMinutes,
          maxAllowedAgeMinutes: context.config.marketDataMaxAgeMinutes,
        });
        return result;
      }

      const opportunity = context.opportunityService.analyze(
        candidate.symbol,
        candidate.timeframe,
        candles,
      );
      opportunity.strategyVersion = context.config.strategyVersion;

      result.opportunities.push(opportunity);
      result.candlesBySignalKey.set(this.buildSignalKey(candidate.symbol, candidate.timeframe), candles);
    } catch (error) {
      const scanError = this.buildScanError(candidate.symbol, candidate.timeframe, error);
      logger.error(`No se pudo escanear ${candidate.symbol} ${candidate.timeframe}`, scanError);
      result.errors.push(scanError);
    }

    return result;
  }

  private async getCandlesWithRetry(
    ticker: string,
    timeframe: string,
    candleLimit: number,
    config: EngineRuntimeConfig,
  ): Promise<Candle[]> {
    let attempt = 0;

    while (true) {
      try {
        return await this.dependencies.marketDataService.getCandles(ticker, timeframe, candleLimit);
      } catch (error) {
        if (!(error instanceof MarketDataRateLimitError) || attempt >= config.marketDataMaxRetries) {
          throw error;
        }

        const delayMs = config.marketDataRetryBaseDelayMs * 2 ** attempt;
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
    config: EngineRuntimeConfig,
  ): void {
    const isStale = freshness.dataAgeMinutes > config.marketDataMaxAgeMinutes;

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
    runtimeServices: MarketScanRuntimeServices,
  ): void {
    this.debugLog(
      logger,
      [
        `decisionNotificacion ticker=${opportunity.ticker}`,
        `score=${opportunity.score}`,
        `opportunityMinScore=${this.getOpportunityMinScore(options, runtimeServices)}`,
        `telegramMinScore=${this.getTelegramMinScore(options, runtimeServices)}`,
        `willNotify=${willNotify}`,
      ].join(' '),
    );
  }

  private getOpportunityMinScore(
    options: MarketScanOptions,
    runtimeServices: MarketScanRuntimeServices,
  ): number {
    return options.opportunityMinScore ?? runtimeServices.opportunityFilter.getMinimumScore();
  }

  private getTelegramMinScore(
    options: MarketScanOptions,
    runtimeServices: MarketScanRuntimeServices,
  ): number {
    return options.telegramNotificationMinScore ?? runtimeServices.notificationService.getMinimumScore();
  }

  private resolveTimeframes(options: MarketScanOptions): string[] {
    const configuredTimeframes =
      options.timeframes && options.timeframes.length > 0
        ? options.timeframes
        : [options.timeframe ?? this.dependencies.defaultTimeframes?.[0] ?? '15m'];

    return [...new Set(configuredTimeframes.map((timeframe) => timeframe.trim().toLowerCase()))];
  }

  private resolveFallbackTimeframes(options: MarketScanOptions): string[] {
    if (options.timeframes?.length || options.timeframe) {
      return this.resolveTimeframes(options);
    }

    return this.dependencies.defaultTimeframes?.length
      ? this.dependencies.defaultTimeframes
      : this.resolveTimeframes(options);
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
