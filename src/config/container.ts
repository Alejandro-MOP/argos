import { MomentumAnalyzer } from '../analyzers/MomentumAnalyzer';
import { StructureAnalyzer } from '../analyzers/StructureAnalyzer';
import { TrendAnalyzer } from '../analyzers/TrendAnalyzer';
import { VolumeAnalyzer } from '../analyzers/VolumeAnalyzer';
import { PolygonClient } from '../clients/PolygonClient';
import { TelegramClient } from '../clients/TelegramClient';
import { OpportunityMemoryRepository } from '../repositories/OpportunityMemoryRepository';
import { SignalRepository } from '../repositories/SignalRepository';
import { MarketDataService } from '../services/MarketDataService';
import { MarketScanExecutor } from '../services/MarketScanExecutor';
import { NotificationService } from '../services/NotificationService';
import { OpportunityFilter } from '../services/OpportunityFilter';
import { OpportunityService } from '../services/OpportunityService';
import { RateLimiterService } from '../services/RateLimiterService';
import { RankingService } from '../services/RankingService';
import { RiskService } from '../services/RiskService';
import { WatchlistService } from '../services/WatchlistService';
import { env } from './env';

const polygonClient = new PolygonClient(env.polygonApiKey, undefined, env.marketScanDebug);
const marketDataService = new MarketDataService(polygonClient);
const rateLimiterService = new RateLimiterService(env.marketDataRequestDelayMs);
const opportunityRepository = new OpportunityMemoryRepository();
const signalRepository = new SignalRepository();
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
  minimumScore: env.scoring.opportunityNotifyThreshold,
  duplicateWindowMinutes: env.scoring.duplicateWindowMinutes,
});
const riskService = new RiskService();
const telegramClient = new TelegramClient(
  env.telegramBotToken,
  env.telegramChatId,
  env.telegramEnabled,
);
export const notificationService = new NotificationService(telegramClient);

export const marketScanExecutor = new MarketScanExecutor({
  marketDataService,
  watchlistService,
  opportunityService,
  rankingService,
  opportunityFilter,
  riskService,
  opportunityRepository,
  signalRepository,
  notificationService,
  rateLimiterService,
  debug: env.marketScanDebug,
  marketDataMaxAgeMinutes: env.marketDataMaxAgeMinutes,
  marketDataMaxRetries: env.marketDataMaxRetries,
  marketDataRetryBaseDelayMs: env.marketDataRetryBaseDelayMs,
  marketDataSequential: env.marketDataSequential,
});
