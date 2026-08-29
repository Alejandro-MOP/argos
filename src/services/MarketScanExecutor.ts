import type { Candle } from '../models/Candle';
import type { EngineRuntimeConfig } from '../models/EngineConfig';
import type { EvidenceSignalSnapshot } from '../models/EvidenceSignal';
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
import type { EvidenceSignalRepository } from '../ports/EvidenceSignalRepository';
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
import type { RiskService } from './RiskService';
import type { SignalContextService } from './SignalContextService';
import type { WatchlistService } from './WatchlistService';
import { runWithConcurrency } from '../utils/concurrencyPool';
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
  | 'duplicate-signal-identity'
  | 'insufficient-data'
  | 'invalid-risk'
  | 'market-closed'
  | 'stale-market-data';

export interface MarketScanCombination {
  ticker: string;
  timeframe: string;
}

export interface MarketScanMetrics {
  totalCombinations: number;
  marketClosed: number;
  marketDataRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  retryAttempts: number;
  durationMs: number;
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
    attempt?: number;
  }>;
  metrics: MarketScanMetrics;
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
  evidenceSignalRepository?: EvidenceSignalRepository;
  notificationService: NotificationService;
  signalContextService?: SignalContextService;
  engineConfigService?: EngineConfigService;
  marketUniverseService?: MarketUniverseService;
  marketSessionService?: MarketSessionService;
  opportunityServiceFactory?: (config: EngineRuntimeConfig) => OpportunityService;
  opportunityFilterFactory?: (config: EngineRuntimeConfig) => OpportunityFilter;
  notificationServiceFactory?: (config: EngineRuntimeConfig) => NotificationService;
  signalContextServiceFactory?: (config: EngineRuntimeConfig) => SignalContextService;
  debug?: boolean;
  marketDataMaxAgeMinutes: number;
  marketDataMaxConcurrency: number;
  marketDataBatchDelayMs: number;
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
    const startedAt = Date.now();
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
    const candidatesBySignalKey = new Map<string, MarketScanCandidate>();
    const errors: MarketScanResult['errors'] = [];
    const skipped: MarketScanResult['skipped'] = [];
    const metrics = this.createInitialMetrics(candidates.length);

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
        `marketDataMaxConcurrency=${runtimeServices.config.marketDataMaxConcurrency}`,
        `marketDataBatchDelayMs=${runtimeServices.config.marketDataBatchDelayMs}`,
        `opportunityMinScore=${this.getOpportunityMinScore(options, runtimeServices)}`,
        `telegramMinScore=${this.getTelegramMinScore(options, runtimeServices)}`,
        `evidenceMinScore=${runtimeServices.config.scoring.evidenceMinScore}`,
      ].join(' '),
    );

    const marketSessionFiltered = this.filterMarketClosedCandidates(candidates, logger, metrics);
    skipped.push(...marketSessionFiltered.skipped);

    const executionContext: ScanExecutionContext = { ...runtimeServices, candleLimit };
    const scanResults = await runWithConcurrency(
      marketSessionFiltered.allowed,
      (candidate) => this.scanCandidate(candidate, executionContext, logger, metrics),
      {
        concurrency: runtimeServices.config.marketDataMaxConcurrency,
        batchDelayMs: runtimeServices.config.marketDataBatchDelayMs,
      },
    );

    for (const scanResult of scanResults) {
      analyzedOpportunities.push(...scanResult.opportunities);
      skipped.push(...scanResult.skipped);
      errors.push(...scanResult.errors);

      for (const [signalKey, candles] of scanResult.candlesBySignalKey) {
        candlesBySignalKey.set(signalKey, candles);
      }

      for (const [signalKey, candidate] of scanResult.candidatesBySignalKey) {
        candidatesBySignalKey.set(signalKey, candidate);
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
      const shouldCaptureEvidence = opportunity.score >= runtimeServices.config.scoring.evidenceMinScore;
      const signal = filterResult.shouldNotify || shouldCaptureEvidence
        ? this.dependencies.riskService.calculateRisk(opportunity, candles)
        : undefined;

      if (signal) {
        signal.strategyVersion = runtimeServices.config.strategyVersion;
      }

      if (signal && shouldCaptureEvidence) {
        const evidenceCaptured = await this.persistEvidenceSignal(
          opportunity,
          signal,
          candidatesBySignalKey.get(this.buildSignalKey(opportunity.ticker, opportunity.timeframe)),
          runtimeServices.config,
          filterResult.shouldNotify,
          logger,
        );

        if (evidenceCaptured === false) {
          this.logDuplicateSignalIdentity(signal, runtimeServices.config, logger);
          skipped.push({
            ticker: opportunity.ticker,
            timeframe: opportunity.timeframe,
            score: opportunity.score,
            reason: 'duplicate-signal-identity',
          });
          continue;
        }
      }

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

      if (!signal) {
        skipped.push({
          ticker: opportunity.ticker,
          timeframe: opportunity.timeframe,
          score: opportunity.score,
          reason: 'invalid-risk',
        });
        continue;
      }

      const willNotify = runtimeServices.notificationService.shouldNotifyOpportunity(
        opportunity,
        options.telegramNotificationMinScore,
      );
      this.logNotificationDecisionDebug(opportunity, willNotify, logger, options, runtimeServices);

      if (!willNotify) {
        opportunitySignals.push(signal);
        await this.dependencies.opportunityRepository.save(opportunity);
        skipped.push({
          ticker: opportunity.ticker,
          timeframe: opportunity.timeframe,
          score: opportunity.score,
          reason: 'below-telegram-threshold',
        });
        continue;
      }

      let forwardSignalSaved = true;

      if (options.notify) {
        forwardSignalSaved = await this.persistForwardSignal(
          signal,
          opportunity,
          logger,
          runtimeServices.config,
          true,
        );

        if (!forwardSignalSaved) {
          validOpportunities.pop();
          this.logDuplicateSignalIdentity(signal, runtimeServices.config, logger);
          skipped.push({
            ticker: opportunity.ticker,
            timeframe: opportunity.timeframe,
            score: opportunity.score,
            reason: 'duplicate-signal-identity',
          });
          continue;
        }
      }

      opportunitySignals.push(signal);
      await this.dependencies.opportunityRepository.save(opportunity);
      await this.dependencies.signalRepository.save(signal);

      if (options.notify) {
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

    metrics.durationMs = Date.now() - startedAt;
    this.logMetricsSummary(logger, metrics);
    logger.log('Escaneo de mercado finalizado');

    return {
      scannedTickers,
      scanned,
      opportunities: validOpportunities,
      opportunitySignals,
      notifiedSignals,
      skipped,
      errors,
      metrics,
    };
  }

  private createInitialMetrics(totalCombinations: number): MarketScanMetrics {
    return {
      totalCombinations,
      marketClosed: 0,
      marketDataRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      retryAttempts: 0,
      durationMs: 0,
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
    };
  }

  private buildFallbackRuntimeConfig(): EngineRuntimeConfig {
    return {
      strategyVersion: this.dependencies.strategyVersion ?? 'v1',
      marketScanCandleLimit: 80,
      marketDataMaxAgeMinutes: this.dependencies.marketDataMaxAgeMinutes,
      marketDataRequestDelayMs: 0,
      marketDataMaxConcurrency: this.dependencies.marketDataMaxConcurrency,
      marketDataBatchDelayMs: this.dependencies.marketDataBatchDelayMs,
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
        evidenceMinScore: 80,
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

  private filterMarketClosedCandidates(
    candidates: MarketScanCandidate[],
    logger: MarketScanLogger,
    metrics: MarketScanMetrics,
  ): { allowed: MarketScanCandidate[]; skipped: MarketScanResult['skipped'] } {
    const allowed: MarketScanCandidate[] = [];
    const skipped: MarketScanResult['skipped'] = [];

    for (const candidate of candidates) {
      const sessionDecision = this.dependencies.marketSessionService?.canScan(
        candidate.metadata,
        candidate.timeframe,
      );

      if (sessionDecision && !sessionDecision.canScan) {
        metrics.marketClosed += 1;
        skipped.push({
          ticker: candidate.symbol,
          timeframe: candidate.timeframe,
          score: 0,
          reason: sessionDecision.reason ?? 'market-closed',
        });
        logger.log(`Omitiendo ${candidate.symbol} ${candidate.timeframe}: ${sessionDecision.reason ?? 'market-closed'}`);
        this.debugLog(logger, `market-closed ticker=${candidate.symbol} timeframe=${candidate.timeframe}`);
        continue;
      }

      allowed.push(candidate);
    }

    return { allowed, skipped };
  }

  private async persistEvidenceSignal(
    opportunity: Opportunity,
    signal: Signal,
    candidate: MarketScanCandidate | undefined,
    config: EngineRuntimeConfig,
    isOperationalOpportunity: boolean,
    logger: MarketScanLogger,
  ): Promise<boolean | undefined> {
    if (!this.dependencies.evidenceSignalRepository) {
      return undefined;
    }

    const snapshot = this.buildEvidenceSignalSnapshot(
      opportunity,
      signal,
      candidate,
      config,
      isOperationalOpportunity,
    );

    if (!snapshot) {
      return undefined;
    }

    try {
      const captured = await this.dependencies.evidenceSignalRepository.saveIfNotDuplicate(
        snapshot,
        config.scoring.duplicateWindowMinutes,
      );

      if (captured) {
        logger.log(
          `Evidence captured ticker=${snapshot.ticker} timeframe=${snapshot.timeframe} score=${snapshot.score} operational=${snapshot.isOperationalOpportunity}`,
        );
      }

      return captured;
    } catch (error) {
      logger.error(`No se pudo persistir evidence signal para ${signal.ticker}`, {
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        message: error instanceof Error ? error.message : 'evidence-signal-persistence-failed',
      });

      return undefined;
    }
  }

  private buildEvidenceSignalSnapshot(
    opportunity: Opportunity,
    signal: Signal,
    candidate: MarketScanCandidate | undefined,
    config: EngineRuntimeConfig,
    isOperationalOpportunity: boolean,
  ): EvidenceSignalSnapshot | undefined {
    const tradePlan = calculateTradePlan(signal, config.tradePlan);

    if (!tradePlan) {
      return undefined;
    }

    return {
      ticker: signal.ticker,
      providerSymbol: candidate?.providerSymbol ?? signal.ticker,
      timeframe: signal.timeframe,
      detectedAt: opportunity.detectedAt,
      signalCandleTimestamp: signal.signalCandleTimestamp ?? opportunity.signalCandleTimestamp,
      signalType: signal.signalType,
      score: opportunity.score,
      trendScore: opportunity.trendScore,
      volumeScore: opportunity.volumeScore,
      momentumScore: opportunity.momentumScore,
      structureScore: opportunity.structureScore,
      reasons: opportunity.reasons,
      entry: tradePlan.entry,
      technicalStopPrice: tradePlan.technicalStop.price,
      financialStopPercent: tradePlan.financialStop.percent,
      financialStopPrice: tradePlan.financialStop.price,
      tp1Percent: tradePlan.targets.min.percent,
      tp1Price: tradePlan.targets.min.price,
      tp2Percent: tradePlan.targets.max.percent,
      tp2Price: tradePlan.targets.max.price,
      strategyVersion: config.strategyVersion,
      assetType: candidate?.metadata.assetType,
      sector: candidate?.metadata.sector,
      industry: candidate?.metadata.industry,
      market: candidate?.metadata.market,
      isOperationalOpportunity,
    };
  }

  private async persistForwardSignal(
    signal: Signal,
    opportunity: Opportunity,
    logger: MarketScanLogger,
    config: EngineRuntimeConfig,
    telegramSent: boolean,
  ): Promise<boolean> {
    if (!this.dependencies.forwardSignalRepository) {
      return true;
    }

    const snapshot = this.buildForwardSignalSnapshot(signal, opportunity, config, telegramSent);

    if (!snapshot) {
      return true;
    }

    try {
      return await this.dependencies.forwardSignalRepository.save(snapshot);
    } catch (error) {
      logger.error(`No se pudo persistir señal forward para ${signal.ticker}`, {
        ticker: signal.ticker,
        timeframe: signal.timeframe,
        message: error instanceof Error ? error.message : 'forward-signal-persistence-failed',
      });

      return true;
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
      signalCandleTimestamp: signal.signalCandleTimestamp ?? opportunity.signalCandleTimestamp,
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

  private logDuplicateSignalIdentity(
    signal: Signal,
    config: EngineRuntimeConfig,
    logger: MarketScanLogger,
  ): void {
    logger.log(
      [
        '[MarketScan] duplicate signal identity skipped',
        `ticker=${signal.ticker}`,
        `timeframe=${signal.timeframe}`,
        `signalCandleTimestamp=${signal.signalCandleTimestamp?.toISOString() ?? 'n/a'}`,
        `strategyVersion=${signal.strategyVersion ?? config.strategyVersion}`,
        `signalType=${signal.signalType}`,
      ].join(' '),
    );
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

  private async scanCandidate(
    candidate: MarketScanCandidate,
    context: ScanExecutionContext,
    logger: MarketScanLogger,
    metrics: MarketScanMetrics,
  ): Promise<TickerScanResult> {
    const result: TickerScanResult = {
      opportunities: [],
      skipped: [],
      errors: [],
      candlesBySignalKey: new Map<string, Candle[]>(),
      candidatesBySignalKey: new Map<string, MarketScanCandidate>(),
    };

    try {
      metrics.marketDataRequests += 1;
      const candles = await this.getCandlesWithRetry(
        candidate,
        context.candleLimit,
        context.config,
        logger,
        metrics,
      );
      metrics.successfulRequests += 1;
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
      result.candidatesBySignalKey.set(this.buildSignalKey(candidate.symbol, candidate.timeframe), candidate);
    } catch (error) {
      metrics.failedRequests += 1;
      const scanError = this.buildScanError(candidate.symbol, candidate.timeframe, error);
      logger.error(`No se pudo escanear ${candidate.symbol} ${candidate.timeframe}`, scanError);
      result.errors.push(scanError);
    }

    return result;
  }

  private async getCandlesWithRetry(
    candidate: MarketScanCandidate,
    candleLimit: number,
    config: EngineRuntimeConfig,
    logger: MarketScanLogger,
    metrics: MarketScanMetrics,
  ): Promise<Candle[]> {
    let retriesUsed = 0;

    while (true) {
      try {
        return await this.dependencies.marketDataService.getCandles(
          candidate.providerSymbol,
          candidate.timeframe,
          candleLimit,
        );
      } catch (error) {
        const attempt = retriesUsed + 1;
        this.attachAttempt(error, attempt);

        if (error instanceof MarketDataRateLimitError) {
          metrics.rateLimitedRequests += 1;
        }

        if (!this.isRetryableMarketDataError(error) || retriesUsed >= config.marketDataMaxRetries) {
          throw error;
        }

        const delayMs = config.marketDataRetryBaseDelayMs * 2 ** retriesUsed;
        metrics.retryAttempts += 1;
        this.debugLog(
          logger,
          [
            `retrying-market-data ticker=${candidate.symbol}`,
            `timeframe=${candidate.timeframe}`,
            `providerSymbol=${candidate.providerSymbol}`,
            `attempt=${attempt}`,
            `nextDelayMs=${delayMs}`,
            `message=${error instanceof Error ? error.message : 'unknown-error'}`,
          ].join(' '),
        );
        retriesUsed += 1;
        await this.sleep(delayMs);
      }
    }
  }

  private isRetryableMarketDataError(error: unknown): boolean {
    if (error instanceof MarketDataRateLimitError) {
      return true;
    }

    if (error instanceof MarketDataProviderError) {
      const status = error.details.status;
      const message = error.message.toLowerCase();

      if (status === 408 || status === 429 || (status !== undefined && status >= 500 && status <= 599)) {
        return true;
      }

      if (status !== undefined && status >= 400 && status < 500) {
        return false;
      }

      if (this.isClearlyNonRecoverableMessage(message)) {
        return false;
      }

      return this.isRecoverableNetworkMessage(message);
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (this.isClearlyNonRecoverableMessage(message)) {
        return false;
      }

      return this.isRecoverableNetworkMessage(message) || this.isRecoverableErrorCode(error);
    }

    return false;
  }

  private isClearlyNonRecoverableMessage(message: string): boolean {
    return ['invalid symbol', 'delisted', 'not found', 'no data found', 'unknown symbol'].some(
      (pattern) => message.includes(pattern),
    );
  }

  private isRecoverableNetworkMessage(message: string): boolean {
    return ['timeout', 'timed out', 'econnreset', 'econnrefused', 'enotfound', 'network', 'socket'].some(
      (pattern) => message.includes(pattern),
    );
  }

  private isRecoverableErrorCode(error: Error): boolean {
    const code = (error as Error & { code?: string }).code;

    return Boolean(code && ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(code));
  }

  private attachAttempt(error: unknown, attempt: number): void {
    if (error && typeof error === 'object') {
      (error as { attempt?: number }).attempt = attempt;
    }
  }

  private getErrorAttempt(error: unknown): number | undefined {
    if (error && typeof error === 'object') {
      return (error as { attempt?: number }).attempt;
    }

    return undefined;
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

  private logMetricsSummary(logger: MarketScanLogger, metrics: MarketScanMetrics): void {
    logger.log(
      [
        'Market scan completed',
        `combinations=${metrics.totalCombinations}`,
        `marketClosed=${metrics.marketClosed}`,
        `requests=${metrics.marketDataRequests}`,
        `success=${metrics.successfulRequests}`,
        `failed=${metrics.failedRequests}`,
        `rateLimited=${metrics.rateLimitedRequests}`,
        `retries=${metrics.retryAttempts}`,
        `durationMs=${metrics.durationMs}`,
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
    const attempt = this.getErrorAttempt(error);

    if (error instanceof InsufficientCandlesError) {
      return {
        ticker: error.ticker,
        timeframe,
        message: error.message,
        candlesCount: error.candlesCount,
        requestedFrom: error.requestedFrom,
        requestedTo: error.requestedTo,
        attempt,
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
        attempt,
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
        attempt,
      };
    }

    return {
      ticker,
      timeframe,
      message: error instanceof Error ? error.message : 'Error desconocido',
      attempt,
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
  candidatesBySignalKey: Map<string, MarketScanCandidate>;
}
