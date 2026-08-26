import { MomentumAnalyzer } from '../analyzers/MomentumAnalyzer';
import { StructureAnalyzer } from '../analyzers/StructureAnalyzer';
import { TrendAnalyzer } from '../analyzers/TrendAnalyzer';
import { VolumeAnalyzer } from '../analyzers/VolumeAnalyzer';
import { BacktestEngine } from '../backtesting/BacktestEngine';
import { TelegramClient } from '../clients/TelegramClient';
import { YahooFinanceClient } from '../clients/YahooFinanceClient';
import {
  BacktestHistoricalPerformanceProvider,
  EmptyForwardPerformanceProvider,
} from '../performance/PerformanceProviders';
import { createRepositories } from './repositories';
import { MarketDataService } from '../services/MarketDataService';
import { ForwardSignalEvaluator } from '../services/ForwardSignalEvaluator';
import { MarketScanExecutor } from '../services/MarketScanExecutor';
import { NotificationService } from '../services/NotificationService';
import { OpportunityFilter } from '../services/OpportunityFilter';
import { OpportunityService } from '../services/OpportunityService';
import { RateLimiterService } from '../services/RateLimiterService';
import { SignalContextService } from '../services/SignalContextService';
import { RankingService } from '../services/RankingService';
import { RiskService } from '../services/RiskService';
import { WatchlistService } from '../services/WatchlistService';
import { env } from './env';

const marketDataProvider = new YahooFinanceClient(undefined, env.marketScanDebug);
const marketDataService = new MarketDataService(marketDataProvider);
const rateLimiterService = new RateLimiterService(env.marketDataRequestDelayMs);
const {
  opportunityRepository,
  signalRepository,
  forwardSignalRepository,
  signalEvaluationRepository,
} = createRepositories(env.databaseUrl);
const watchlistService = new WatchlistService(env.marketScanWatchlist, env.marketScanTickers);
const opportunityService = new OpportunityService({
  trendAnalyzer: new TrendAnalyzer({
    fastPeriod: env.scoring.emaFastPeriod,
    slowPeriod: env.scoring.emaSlowPeriod,
  }),
  volumeAnalyzer: new VolumeAnalyzer({
    lookbackPeriod: env.scoring.volumeLookbackPeriod,
    strongRatio: env.scoring.volumeStrongRatio,
    moderateRatio: env.scoring.volumeModerateRatio,
    weakRatio: env.scoring.volumeWeakRatio,
  }),
  momentumAnalyzer: new MomentumAnalyzer({
    rsiPeriod: env.scoring.rsiPeriod,
    idealMin: env.scoring.rsiIdealMin,
    idealMax: env.scoring.rsiIdealMax,
    neutralMin: env.scoring.rsiNeutralMin,
    neutralMax: env.scoring.rsiNeutralMax,
    extendedMax: env.scoring.rsiExtendedMax,
  }),
  structureAnalyzer: new StructureAnalyzer({
    lookbackPeriod: env.scoring.structureLookbackPeriod,
  }),
});
const rankingService = new RankingService();
const opportunityFilter = new OpportunityFilter(opportunityRepository, {
  minimumScore: env.scoring.opportunityMinScore,
  duplicateWindowMinutes: env.scoring.duplicateWindowMinutes,
});
const riskService = new RiskService();
const telegramClient = new TelegramClient(
  env.telegramBotToken,
  env.telegramChatId,
  env.telegramEnabled,
);
export const backtestEngine = new BacktestEngine({
  marketDataService,
  opportunityService,
  riskService,
});

const signalContextService = new SignalContextService(
  {
    historicalPerformanceProvider: new BacktestHistoricalPerformanceProvider(backtestEngine),
    forwardPerformanceProvider: new EmptyForwardPerformanceProvider(),
  },
  {
    backtestContextEnabled: env.signalIntelligence.backtestContextEnabled,
    backtestContextMonths: env.signalIntelligence.backtestContextMonths,
    historicalMinimumScore: env.scoring.telegramNotificationMinScore,
    forwardTestContextEnabled: env.signalIntelligence.forwardTestContextEnabled,
    performanceMinSampleSize: env.signalIntelligence.performanceMinSampleSize,
    tradePlan: env.tradePlan,
  },
);

export const notificationService = new NotificationService(telegramClient, {
  minimumScore: env.scoring.telegramNotificationMinScore,
  tradePlan: env.tradePlan,
});

export const forwardSignalEvaluator = new ForwardSignalEvaluator({
  forwardSignalRepository,
  signalEvaluationRepository,
  marketDataService,
  rateLimiterService,
});

export const marketScanExecutor = new MarketScanExecutor({
  marketDataService,
  watchlistService,
  opportunityService,
  rankingService,
  opportunityFilter,
  riskService,
  opportunityRepository,
  signalRepository,
  forwardSignalRepository,
  notificationService,
  signalContextService,
  rateLimiterService,
  debug: env.marketScanDebug,
  marketDataMaxAgeMinutes: env.marketDataMaxAgeMinutes,
  marketDataMaxRetries: env.marketDataMaxRetries,
  marketDataRetryBaseDelayMs: env.marketDataRetryBaseDelayMs,
  marketDataSequential: env.marketDataSequential,
  tradePlan: env.tradePlan,
});
