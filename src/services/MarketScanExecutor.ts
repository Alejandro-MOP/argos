import type { Candle } from '../models/Candle';
import type { Opportunity } from '../models/Opportunity';
import type { Signal } from '../models/Signal';
import { InsufficientCandlesError } from '../clients/PolygonClient';
import type { OpportunityRepository } from '../ports/OpportunityRepository';
import type { SignalRepository } from '../ports/SignalRepository';
import type { MarketDataService } from './MarketDataService';
import type { NotificationService } from './NotificationService';
import type { OpportunityFilter } from './OpportunityFilter';
import type { OpportunityService } from './OpportunityService';
import type { RankingService } from './RankingService';
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
  | 'duplicate-window'
  | 'insufficient-data'
  | 'invalid-risk';

export interface MarketScanResult {
  scannedTickers: string[];
  opportunities: Opportunity[];
  notifiedSignals: Signal[];
  skipped: Array<{
    ticker: string;
    score: number;
    reason: MarketScanSkippedReason;
  }>;
  errors: Array<{
    ticker: string;
    message: string;
    candlesCount?: number;
    requestedFrom?: string;
    requestedTo?: string;
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
  debug?: boolean;
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

    for (const ticker of tickers) {
      try {
        const candles = await this.dependencies.marketDataService.getCandles(
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
          skipped.push({
            ticker,
            score: 0,
            reason: 'insufficient-data',
          });
          continue;
        }

        const opportunity = this.dependencies.opportunityService.analyze(
          ticker,
          options.timeframe,
          candles,
        );

        analyzedOpportunities.push(opportunity);
        candlesByTicker.set(ticker, candles);
      } catch (error) {
        logger.error(`No se pudo escanear ${ticker}`, error);
        errors.push(this.buildScanError(ticker, error));
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

    return {
      ticker,
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}
