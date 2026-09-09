import { MomentumAnalyzer } from '../analyzers/MomentumAnalyzer';
import { StructureAnalyzer } from '../analyzers/StructureAnalyzer';
import { TrendAnalyzer } from '../analyzers/TrendAnalyzer';
import { VolumeAnalyzer } from '../analyzers/VolumeAnalyzer';
import { BacktestEngine } from '../backtesting/BacktestEngine';
import { ProcessCommandRunner } from '../adapters/CommandRunner';
import { TelegramClient } from '../clients/TelegramClient';
import { YahooFinanceClient } from '../clients/YahooFinanceClient';
import { TransactionCostCalculator } from '../transactionCosts/TransactionCostCalculator';
import type { EngineRuntimeConfig } from '../models/EngineConfig';
import {
  BacktestHistoricalPerformanceProvider,
  EmptyForwardPerformanceProvider,
} from '../performance/PerformanceProviders';
import { PostgresForwardPerformanceProvider } from '../performance/PostgresForwardPerformanceProvider';
import { PostgresStrategyProfileProvider } from '../research/PostgresStrategyProfileProvider';
import { PostgresResearchSnapshotProvider } from '../research/PostgresResearchSnapshotProvider';
import { createRepositories } from './repositories';
import { env } from './env';
import { AnalyzeSymbolService } from '../services/AnalyzeSymbolService';
import { ScorePerformanceResearchService } from '../research/ScorePerformanceResearchService';
import { EngineConfigService } from '../services/EngineConfigService';
import { EvidenceSignalEvaluator } from '../services/EvidenceSignalEvaluator';
import { ForwardSignalEvaluator } from '../services/ForwardSignalEvaluator';
import { MarketDataService } from '../services/MarketDataService';
import { MarketScanExecutor } from '../services/MarketScanExecutor';
import { MarketSessionService } from '../services/MarketSessionService';
import { MarketUniverseService } from '../services/MarketUniverseService';
import { NotificationService } from '../services/NotificationService';
import { PaperTradeMonitorService } from '../services/PaperTradeMonitorService';
import { PaperTradeService } from '../services/PaperTradeService';
import { OrbFvgForwardMonitorService } from '../orbFvg/OrbFvgForwardMonitorService';
import { OrbFvgScannerService } from '../orbFvg/OrbFvgScannerService';
import { OrbFvgSessionService } from '../orbFvg/OrbFvgSessionService';
import { OpportunityFilter } from '../services/OpportunityFilter';
import { OpportunityService } from '../services/OpportunityService';
import { RankingService } from '../services/RankingService';
import { RiskService } from '../services/RiskService';
import { PostgresBackupService } from '../services/PostgresBackupService';
import { ResearchSnapshotService } from '../services/ResearchSnapshotService';
import { TransactionCostService } from '../services/TransactionCostService';
import { TelegramAuthorizationService } from '../services/TelegramAuthorizationService';
import { TelegramCommandRouter } from '../services/TelegramCommandRouter';
import { TelegramConversationStateService } from '../services/TelegramConversationStateService';
import { TelegramMarketScanExecutionGuard } from '../services/TelegramMarketScanExecutionGuard';
import { TelegramControlPresenter } from '../services/TelegramControlPresenter';
import { TelegramControlReadOnlyQueryService } from '../services/TelegramControlReadOnlyQueryService';
import { SignalContextService } from '../services/SignalContextService';

const transactionCostCalculator = new TransactionCostCalculator();
const transactionCostService = new TransactionCostService(transactionCostCalculator);

const marketDataProvider = new YahooFinanceClient(undefined, env.marketScanDebug);
const marketDataService = new MarketDataService(marketDataProvider);
const telegramClient = new TelegramClient(
  env.telegramAlertsBotToken,
  env.telegramAlertsChatId,
  env.telegramAlertsEnabled,
);
const telegramControlAuthorizationService = new TelegramAuthorizationService(
  env.telegramControlAllowedUserIds,
);
const telegramConversationStateService = new TelegramConversationStateService();
const telegramControlPresenter = new TelegramControlPresenter();
const telegramMarketScanExecutionGuard = new TelegramMarketScanExecutionGuard();
const {
  opportunityRepository,
  signalRepository,
  forwardSignalRepository,
  signalEvaluationRepository,
  engineConfigRepository,
  marketSymbolRepository,
  evidenceSignalRepository,
  evidenceSignalEvaluationRepository,
  paperTradeRepository,
  orbFvgSignalRepository,
  database,
} = createRepositories(env.databaseUrl);

const engineConfigService = new EngineConfigService(engineConfigRepository);
const marketUniverseService = new MarketUniverseService(marketSymbolRepository);
const marketSessionService = new MarketSessionService();
const orbFvgSessionService = new OrbFvgSessionService();
const forwardPerformanceReportProvider = database
  ? new PostgresForwardPerformanceProvider(
      database,
      async () => (await engineConfigService.loadSnapshot()).values.signalIntelligence.performanceMinSampleSize,
    )
  : undefined;
const strategyProfileProvider = database
  ? new PostgresStrategyProfileProvider(database)
  : undefined;
const researchSnapshotProvider = database
  ? new PostgresResearchSnapshotProvider(database)
  : undefined;
const scorePerformanceResearchService = database
  ? new ScorePerformanceResearchService(database)
  : undefined;
const researchSnapshotService =
  researchSnapshotProvider && strategyProfileProvider && forwardPerformanceReportProvider
    ? new ResearchSnapshotService(
        researchSnapshotProvider,
        strategyProfileProvider,
        forwardPerformanceReportProvider,
        {
          timeZone: env.databaseBackupTimezone,
          engineConfigService,
        },
      )
    : undefined;

const telegramControlReadOnlyQueryService = new TelegramControlReadOnlyQueryService({
  researchSnapshotService,
  strategyProfileProvider,
  forwardPerformanceProvider: forwardPerformanceReportProvider,
  database,
});
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

const paperTradeService = new PaperTradeService(paperTradeRepository, marketDataService);
const paperTradeMonitorService = new PaperTradeMonitorService(paperTradeRepository, marketDataService, telegramClient);
const orbFvgScannerService = new OrbFvgScannerService({
  marketUniverseService,
  marketDataService,
  repository: orbFvgSignalRepository,
  engineConfigService,
  telegramClient,
  sessionService: orbFvgSessionService,
});
const orbFvgForwardMonitorService = new OrbFvgForwardMonitorService({
  repository: orbFvgSignalRepository,
  marketDataService,
  telegramClient,
  sessionService: orbFvgSessionService,
});

const analyzeSymbolService = new AnalyzeSymbolService({
  marketDataService,
  engineConfigService,
  opportunityServiceFactory: createOpportunityService,
  marketUniverseService,
});

const rankingService = new RankingService();
const riskService = new RiskService();

export const createBacktestEngine = (config: EngineRuntimeConfig): BacktestEngine => new BacktestEngine({
  marketDataService,
  opportunityService: createOpportunityService(config),
  riskService,
});

const createSignalContextService = (config: EngineRuntimeConfig): SignalContextService =>
  new SignalContextService(
    {
      historicalPerformanceProvider: new BacktestHistoricalPerformanceProvider(createBacktestEngine(config)),
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
    notificationTimeframes: config.telegramNotificationTimeframes,
    tradePlan: config.tradePlan,
  });

export const notificationService = new NotificationService(telegramClient);

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

  rankingService,

  riskService,
  opportunityRepository,
  signalRepository,
  forwardSignalRepository,
  evidenceSignalRepository,

  engineConfigService,
  marketUniverseService,
  marketSessionService,
  opportunityServiceFactory: createOpportunityService,
  opportunityFilterFactory: createOpportunityFilter,
  notificationServiceFactory: createNotificationService,
  signalContextServiceFactory: createSignalContextService,
  debug: env.marketScanDebug,
});

const telegramCommandRouter = new TelegramCommandRouter(
  telegramControlAuthorizationService,
  telegramControlPresenter,
  telegramConversationStateService,
  telegramControlReadOnlyQueryService,
  transactionCostService,
  analyzeSymbolService,
  marketScanExecutor,
  telegramMarketScanExecutionGuard,
  console,
  marketUniverseService,
  paperTradeService,
);

export {
  engineConfigService,
  forwardPerformanceReportProvider,
  strategyProfileProvider,
  researchSnapshotService,
  scorePerformanceResearchService,
  transactionCostService,
  telegramControlAuthorizationService,
  telegramConversationStateService,
  telegramControlPresenter,
  telegramControlReadOnlyQueryService,
  telegramCommandRouter,
  analyzeSymbolService,
  paperTradeService,
  paperTradeMonitorService,
  orbFvgScannerService,
  orbFvgForwardMonitorService,
  orbFvgSignalRepository,
  telegramMarketScanExecutionGuard,
};
