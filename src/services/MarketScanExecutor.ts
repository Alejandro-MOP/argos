import type { Candle } from '../models/Candle';
import type { Opportunity } from '../models/Opportunity';
import type { Signal } from '../models/Signal';
import type { OpportunityRepository } from '../ports/OpportunityRepository';
import type { SignalRepository } from '../ports/SignalRepository';
import type { MarketDataService } from './MarketDataService';
import type { NotificationService } from './NotificationService';
import type { OpportunityFilter } from './OpportunityFilter';
import type { OpportunityService } from './OpportunityService';
import type { RankingService } from './RankingService';
import type { RiskService } from './RiskService';
import type { WatchlistService } from './WatchlistService';

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

export interface MarketScanResult {
  scannedTickers: string[];
  opportunities: Opportunity[];
  notifiedSignals: Signal[];
  skipped: Array<{
    ticker: string;
    score: number;
    reason: string;
  }>;
  errors: Array<{
    ticker: string;
    message: string;
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

    logger.log(`Starting market scan for ${tickers.length} tickers`);

    for (const ticker of tickers) {
      try {
        const candles = await this.dependencies.marketDataService.getCandles(
          ticker,
          options.timeframe,
          options.candleLimit,
        );
        const opportunity = this.dependencies.opportunityService.analyze(
          ticker,
          options.timeframe,
          candles,
        );

        analyzedOpportunities.push(opportunity);
        candlesByTicker.set(ticker, candles);
      } catch (error) {
        logger.error(`Failed to scan ${ticker}`, error);
        errors.push({
          ticker,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const rankedOpportunities = this.dependencies.rankingService.rank(analyzedOpportunities);
    const notifiedSignals: Signal[] = [];
    const skipped: MarketScanResult['skipped'] = [];

    for (const opportunity of rankedOpportunities) {
      const candles = candlesByTicker.get(opportunity.ticker);

      if (!candles) {
        skipped.push({
          ticker: opportunity.ticker,
          score: opportunity.score,
          reason: 'candles-not-found',
        });
        continue;
      }

      if (!(await this.dependencies.opportunityFilter.shouldNotify(opportunity))) {
        logger.log(`Opportunity skipped for ${opportunity.ticker}. Score: ${opportunity.score}`);
        skipped.push({
          ticker: opportunity.ticker,
          score: opportunity.score,
          reason: 'below-threshold-or-duplicate',
        });
        continue;
      }

      const signal = this.dependencies.riskService.calculateRisk(opportunity, candles);

      if (!signal) {
        skipped.push({
          ticker: opportunity.ticker,
          score: opportunity.score,
          reason: 'risk-not-valid',
        });
        continue;
      }

      await this.dependencies.opportunityRepository.save(opportunity);
      await this.dependencies.signalRepository.save(signal);

      if (options.notify) {
        await this.dependencies.notificationService.sendSignal(signal, opportunity);
      }

      notifiedSignals.push(signal);
      logger.log(`Signal generated for ${signal.ticker} ${signal.timeframe}`);
    }

    logger.log('Market scan finished');

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
}
