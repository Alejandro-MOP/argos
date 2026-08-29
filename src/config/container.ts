import { MomentumAnalyzer } from '../analyzers/MomentumAnalyzer';
import { StructureAnalyzer } from '../analyzers/StructureAnalyzer';
import { TrendAnalyzer } from '../analyzers/TrendAnalyzer';
import { VolumeAnalyzer } from '../analyzers/VolumeAnalyzer';
import { BacktestEngine } from '../backtesting/BacktestEngine';
import { ProcessCommandRunner } from '../adapters/CommandRunner';
import { TelegramClient } from '../clients/TelegramClient';
import { YahooFinanceClient } from '../clients/YahooFinanceClient';
import type { EngineRuntimeConfig } from '../models/EngineConfig';
import {
  BacktestHistoricalPerformanceProvider,
  EmptyForwardPerformanceProvider,
} from '../performance/PerformanceProviders';
import { PostgresForwardPerformanceProvider } from '../performance/PostgresForwardPerformanceProvider';
import { PostgresStrategyProfileProvider } from '../research/PostgresStrategyProfileProvider';
import { PostgresResearchSnapshotProvider } from '../research/PostgresResearchSnapshotProvider';
import { createRepositories } from './repositories';
import { buildEnvRuntimeConfig, env } from './env';
import { EngineConfigService } from '../services/EngineConfigService';
import { EvidenceSignalEvaluator } from '../services/EvidenceSignalEvaluator';
import { ForwardSignalEvaluator } from '../services/ForwardSignalEvaluator';
import { MarketDataService } from '../services/MarketDataService';
import { MarketScanExecutor } from '../services/MarketScanExecutor';
import { MarketSessionService } from '../services/MarketSessionService';
import { MarketUniverseService } from '../services/MarketUniverseService';
import { NotificationService } from '../services/NotificationService';
import { OpportunityFilter } from '../services/OpportunityFilter';
import { OpportunityService } from '../services/OpportunityService';
import { RankingService } from '../services/RankingService';
import { RiskService } from '../services/RiskService';
import { PostgresBackupService } from '../services/PostgresBackupService';
import { ResearchSnapshotService } from '../services/ResearchSnapshotService';
import { SignalContextService } from '../services/SignalContextService';
import { WatchlistService } from '../services/WatchlistService';

const marketDataProvider = new YahooFinanceClient(undefined, env.marketScanDebug);
const marketDataService = new MarketDataService(marketDataProvider);
const telegramClient = new TelegramClient(
  env.telegramBotToken,
  env.telegramChatId,
  env.telegramEnabled,
);
const {
  opportunityRepository,
  signalRepository,
  forwardSignalRepository,
  signalEvaluationRepository,
  engineConfigRepository,
  marketSymbolRepository,
  evidenceSignalRepository,
  evidenceSignalEvaluationRepository,
  database,
} = createRepositories(env.databaseUrl);

const watchlistService = new WatchlistService(env.marketScanWatchlist, env.marketScanTickers);
const fallbackRuntimeConfig = buildEnvRuntimeConfig();
const engineConfigService = new EngineConfigService(engineConfigRepository, fallbackRuntimeConfig);
const marketUniverseService = new MarketUniverseService(marketSymbolRepository, watchlistService);
const marketSessionService = new MarketSessionService();
const forwardPerformanceReportProvider = database
  ? new PostgresForwardPerformanceProvider(database, fallbackRuntimeConfig.signalIntelligence.performanceMinSampleSize)
  : undefined;
const strategyProfileProvider = database
  ? new PostgresStrategyProfileProvider(database)
  : undefined;
const researchSnapshotProvider = database
  ? new PostgresResearchSnapshotProvider(database)
  : undefined;
const researchSnapshotService =
  researchSnapshotProvider && strategyProfileProvider && forwardPerformanceReportProvider
    ? new ResearchSnapshotService(
        researchSnapshotProvider,
        strategyProfileProvider,
        forwardPerformanceReportProvider,
        {
          timeZone: env.databaseBackupTimezone,
          strategyVersion: fallbackRuntimeConfig.strategyVersion,
          operationalThreshold: fallbackRuntimeConfig.scoring.opportunityMinScore,
        },
      )
    : undefined;

export const postgresBackupService = database
  ? new PostgresBackupService(database, new ProcessCommandRunner(), {
      databaseUrl: env.databaseUrl,
      basePath: env.databaseBackupBasePath,
      timezone: env.databaseBackupTimezone,
      pgDumpCommand: env.databasePgDumpBin,
      pgRestoreCommand: env.databasePgRestoreBin,
      psqlCommand: env.databasePsqlBin,
    })
  : undefined;

const createOpportunityService = (config: EngineRuntimeConfig): OpportunityService =>
  new OpportunityService({
    trendAnalyzer: new TrendAnalyzer({
      fastPeriod: config.scoring.emaFastPeriod,
      slowPeriod: config.scoring.emaSlowPeriod,
    }),
    volumeAnalyzer: new VolumeAnalyzer({
      lookbackPeriod: config.scoring.volumeLookbackPeriod,
      strongRatio: config.scoring.volumeStrongRatio,
      moderateRatio: config.scoring.volumeModerateRatio,
      weakRatio: config.scoring.volumeWeakRatio,
    }),
    momentumAnalyzer: new MomentumAnalyzer({
      rsiPeriod: config.scoring.rsiPeriod,
      idealMin: config.scoring.rsiIdealMin,
      idealMax: config.scoring.rsiIdealMax,
      neutralMin: config.scoring.rsiNeutralMin,
      neutralMax: config.scoring.rsiNeutralMax,
      extendedMax: config.scoring.rsiExtendedMax,
    }),
    structureAnalyzer: new StructureAnalyzer({
      lookbackPeriod: config.scoring.structureLookbackPeriod,
    }),
  });

const createOpportunityFilter = (config: EngineRuntimeConfig): OpportunityFilter =>
  new OpportunityFilter(opportunityRepository, {
    minimumScore: config.scoring.opportunityMinScore,
    duplicateWindowMinutes: config.scoring.duplicateWindowMinutes,
  });

const rankingService = new RankingService();
const riskService = new RiskService();

export const backtestEngine = new BacktestEngine({
  marketDataService,
  opportunityService: createOpportunityService(fallbackRuntimeConfig),
  riskService,
});

const createSignalContextService = (config: EngineRuntimeConfig): SignalContextService =>
  new SignalContextService(
    {
      historicalPerformanceProvider: new BacktestHistoricalPerformanceProvider(backtestEngine),
      forwardPerformanceProvider: new EmptyForwardPerformanceProvider(),
    },
    {
      backtestContextEnabled: config.signalIntelligence.backtestContextEnabled,
      backtestContextMonths: config.signalIntelligence.backtestContextMonths,
      historicalMinimumScore: config.scoring.telegramNotificationMinScore,
      forwardTestContextEnabled: config.signalIntelligence.forwardTestContextEnabled,
      performanceMinSampleSize: config.signalIntelligence.performanceMinSampleSize,
      tradePlan: config.tradePlan,
    },
  );

const createNotificationService = (config: EngineRuntimeConfig): NotificationService =>
  new NotificationService(telegramClient, {
    minimumScore: config.scoring.telegramNotificationMinScore,
    tradePlan: config.tradePlan,
  });

export const notificationService = createNotificationService(fallbackRuntimeConfig);

export const forwardSignalEvaluator = new ForwardSignalEvaluator({
  forwardSignalRepository,
  signalEvaluationRepository,
  marketDataService,
});

export const evidenceSignalEvaluator = new EvidenceSignalEvaluator({
  evidenceSignalRepository,
  evidenceSignalEvaluationRepository,
  marketDataService,
});

export const marketScanExecutor = new MarketScanExecutor({
  marketDataService,
  watchlistService,
  opportunityService: createOpportunityService(fallbackRuntimeConfig),
  rankingService,
  opportunityFilter: createOpportunityFilter(fallbackRuntimeConfig),
  riskService,
  opportunityRepository,
  signalRepository,
  forwardSignalRepository,
  evidenceSignalRepository,
  notificationService,
  signalContextService: createSignalContextService(fallbackRuntimeConfig),
  engineConfigService,
  marketUniverseService,
  marketSessionService,
  opportunityServiceFactory: createOpportunityService,
  opportunityFilterFactory: createOpportunityFilter,
  notificationServiceFactory: createNotificationService,
  signalContextServiceFactory: createSignalContextService,
  debug: env.marketScanDebug,
  marketDataMaxAgeMinutes: fallbackRuntimeConfig.marketDataMaxAgeMinutes,
  marketDataMaxConcurrency: fallbackRuntimeConfig.marketDataMaxConcurrency,
  marketDataBatchDelayMs: fallbackRuntimeConfig.marketDataBatchDelayMs,
  marketDataMaxRetries: fallbackRuntimeConfig.marketDataMaxRetries,
  marketDataRetryBaseDelayMs: fallbackRuntimeConfig.marketDataRetryBaseDelayMs,
  marketDataSequential: fallbackRuntimeConfig.marketDataSequential,
  tradePlan: fallbackRuntimeConfig.tradePlan,
  strategyVersion: fallbackRuntimeConfig.strategyVersion,
  defaultTimeframes: env.marketScanTimeframes,
});

export { forwardPerformanceReportProvider, strategyProfileProvider, researchSnapshotService };
