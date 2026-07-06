import type { Candle } from '../models/Candle';
import type { Opportunity } from '../models/Opportunity';
import type { Signal } from '../models/Signal';
import {
  InsufficientCandlesError,
  MarketDataProviderError,
  MarketDataRateLimitError,
} from '../clients/PolygonClient';
import type { OpportunityRepository } from '../ports/OpportunityRepository';
import type { SignalRepository } from '../ports/SignalRepository';
import type { MarketDataService } from './MarketDataService';
import type { NotificationService } from './NotificationService';
import type { OpportunityFilter } from './OpportunityFilter';
import type { OpportunityService } from './OpportunityService';
import type { RankingService } from './RankingService';
import type { RateLimiterService } from './RateLimiterService';
import type { RiskService } from './RiskService';
import type { WatchlistService } from './WatchlistService';

const MINIMUM_PROVIDER_CANDLES = 60;

export interface MarketScanLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface MarketScanOptions {
  tickers?: string[];
  timeframe: string;
  candleLimit: number;
  notify: boolean;
}

export type MarketScanSkippedReason =
  | 'below-threshold'
  | 'below-telegram-threshold'
  | 'duplicate-window'
  | 'insufficient-data'
  | 'invalid-risk'
  | 'stale-market-data';

export interface MarketScanResult {
  scannedTickers: string[];
  opportunities: Opportunity[];
  notifiedSignals: Signal[];
  skipped: Array<{
    ticker: string;
    score: number;
    reason: MarketScanSkippedReason;
    lastTimestamp?: Date;
    dataAgeMinutes?: number;
    maxAllowedAgeMinutes?: number;
  }>;
  errors: Array<{
    ticker: string;
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
  notificationService: NotificationService;
  rateLimiterService: RateLimiterService;
  debug?: boolean;
  marketDataMaxAgeMinutes: number;
  marketDataMaxRetries: number;
  marketDataRetryBaseDelayMs: number;
  marketDataSequential: boolean;
}

export class MarketScanExecutor {
  public constructor(private readonly dependencies: MarketScanExecutorDependencies) {}

  public async run(
    options: MarketScanOptions,
    logger: MarketScanLogger,
  ): Promise<MarketScanResult> {
    const tickers = this.resolveTickers(options.tickers);
    const analyzedOpportunities: Opportunity[] = [];
    const candlesByTicker = new Map<string, Candle[]>();
    const errors: MarketScanResult['errors'] = [];
    const skipped: MarketScanResult['skipped'] = [];

    logger.log(`Iniciando escaneo de mercado para ${tickers.length} tickers`);
    this.debugLog(
      logger,
      `Debug de escaneo habilitado. temporalidad=${options.timeframe} limiteVelas=${options.candleLimit} notificar=${options.notify}`,
    );

    const scanResults = this.dependencies.marketDataSequential
      ? await this.scanTickersSequentially(tickers, options, logger)
      : await this.scanTickersInParallel(tickers, options, logger);

    for (const scanResult of scanResults) {
      analyzedOpportunities.push(...scanResult.opportunities);
      skipped.push(...scanResult.skipped);
      errors.push(...scanResult.errors);

      for (const [ticker, candles] of scanResult.candlesByTicker) {
        candlesByTicker.set(ticker, candles);
      }
    }

    const rankedOpportunities = this.dependencies.rankingService.rank(analyzedOpportunities);
    const notifiedSignals: Signal[] = [];

    for (const opportunity of rankedOpportunities) {
      const candles = candlesByTicker.get(opportunity.ticker);

      if (!candles) {
        skipped.push({
          ticker: opportunity.ticker,
          score: opportunity.score,
          reason: 'insufficient-data',
        });
        continue;
      }

      const filterResult = await this.dependencies.opportunityFilter.evaluate(opportunity);

      if (!filterResult.shouldNotify) {
        const reason = filterResult.reason ?? 'below-threshold';
        logger.log(
          `Oportunidad omitida para ${opportunity.ticker}. Score: ${opportunity.score}. Motivo: ${reason}`,
        );
        skipped.push({
          ticker: opportunity.ticker,
          score: opportunity.score,
          reason,
        });
        continue;
      }

      const willNotify = this.dependencies.notificationService.shouldNotifyOpportunity(opportunity);
      this.logNotificationDecisionDebug(opportunity, willNotify, logger);

      if (!willNotify) {
        await this.dependencies.opportunityRepository.save(opportunity);
        skipped.push({
          ticker: opportunity.ticker,
          score: opportunity.score,
          reason: 'below-telegram-threshold',
        });
        continue;
      }

      const signal = this.dependencies.riskService.calculateRisk(opportunity, candles);

      if (!signal) {
        skipped.push({
          ticker: opportunity.ticker,
          score: opportunity.score,
          reason: 'invalid-risk',
        });
        continue;
      }

      await this.dependencies.opportunityRepository.save(opportunity);
      await this.dependencies.signalRepository.save(signal);

      if (options.notify) {
        await this.dependencies.notificationService.sendSignal(signal, opportunity);
      }

      notifiedSignals.push(signal);
      logger.log(`Señal generada para ${signal.ticker} ${signal.timeframe}`);
    }

    logger.log('Escaneo de mercado finalizado');

    return {
      scannedTickers: tickers,
      opportunities: rankedOpportunities,
      notifiedSignals,
      skipped,
      errors,
    };
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

    for (const [index, ticker] of tickers.entries()) {
      results.push(await this.scanTicker(ticker, options, logger, index > 0));
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

    return Promise.all(tickers.map((ticker) => this.scanTicker(ticker, options, logger, false)));
  }

  private async scanTicker(
    ticker: string,
    options: MarketScanOptions,
    logger: MarketScanLogger,
    shouldWaitBeforeRequest: boolean,
  ): Promise<TickerScanResult> {
    const result: TickerScanResult = {
      opportunities: [],
      skipped: [],
      errors: [],
      candlesByTicker: new Map<string, Candle[]>(),
    };

    try {
      if (shouldWaitBeforeRequest) {
        await this.dependencies.rateLimiterService.wait();
      }

      const candles = await this.getCandlesWithRetry(
        ticker,
        options.timeframe,
        options.candleLimit,
      );
      this.logCandleSummary(ticker, candles, logger);

      if (candles.length < MINIMUM_PROVIDER_CANDLES) {
        throw new InsufficientCandlesError(ticker, candles.length, 'n/a', 'n/a');
      }

      if (candles.length < options.candleLimit) {
        logger.log(
          `Omitiendo ${ticker}: datos insuficientes velas=${candles.length} esperado=${options.candleLimit}`,
        );
        result.skipped.push({
          ticker,
          score: 0,
          reason: 'insufficient-data',
        });
        return result;
      }

      const freshness = this.calculateDataFreshness(candles);
      this.logFreshnessDebug(ticker, freshness, logger);

      if (
        this.isIntradayTimeframe(options.timeframe) &&
        freshness.dataAgeMinutes > this.dependencies.marketDataMaxAgeMinutes
      ) {
        result.skipped.push({
          ticker,
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
        options.timeframe,
        candles,
      );

      result.opportunities.push(opportunity);
      result.candlesByTicker.set(ticker, candles);
    } catch (error) {
      const scanError = this.buildScanError(ticker, error);
      logger.error(`No se pudo escanear ${ticker}`, scanError);
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

  private logCandleSummary(ticker: string, candles: Candle[], logger: MarketScanLogger): void {
    const firstCandle = candles.at(0);
    const lastCandle = candles.at(-1);

    logger.log(
      [
        `Datos de mercado ticker=${ticker}`,
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
  ): void {
    this.debugLog(
      logger,
      [
        `decisionNotificacion ticker=${opportunity.ticker}`,
        `score=${opportunity.score}`,
        `opportunityMinScore=${this.dependencies.opportunityFilter.getMinimumScore()}`,
        `telegramMinScore=${this.dependencies.notificationService.getMinimumScore()}`,
        `willNotify=${willNotify}`,
      ].join(' '),
    );
  }

  private buildScanError(ticker: string, error: unknown): MarketScanResult['errors'][number] {
    if (error instanceof InsufficientCandlesError) {
      return {
        ticker: error.ticker,
        message: error.message,
        candlesCount: error.candlesCount,
        requestedFrom: error.requestedFrom,
        requestedTo: error.requestedTo,
      };
    }

    if (error instanceof MarketDataRateLimitError) {
      return {
        ticker,
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
  candlesByTicker: Map<string, Candle[]>;
}
