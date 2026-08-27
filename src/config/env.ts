import dotenv from 'dotenv';
import type { WatchlistName } from '../services/WatchlistService';
import type { EngineRuntimeConfig } from '../models/EngineConfig';
import type { TradePlanConfig } from '../utils/tradeSizing.utils';

dotenv.config();

const parseInteger = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseRequiredPositiveNumber = (
  value: string | undefined,
  fallback: number,
  envName: string,
): number => {
  const parsed = parseNumber(value, fallback);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be greater than 0`);
  }

  return parsed;
};

const SUPPORTED_MARKET_SCAN_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '1d', '1w'];

export const parseMarketScanTimeframes = (values: NodeJS.ProcessEnv = process.env): string[] => {
  const configuredTimeframes = parseTimeframeList(values.MARKET_SCAN_TIMEFRAMES);

  if (configuredTimeframes.length > 0) {
    return configuredTimeframes;
  }

  return parseTimeframeList(values.MARKET_SCAN_TIMEFRAME ?? '15m');
};

const parseTimeframeList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  const timeframes = [
    ...new Set(
      value
        .split(',')
        .map((timeframe) => timeframe.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const invalidTimeframes = timeframes.filter(
    (timeframe) => !SUPPORTED_MARKET_SCAN_TIMEFRAMES.includes(timeframe),
  );

  if (invalidTimeframes.length > 0) {
    throw new Error(
      `Unsupported MARKET_SCAN_TIMEFRAMES value(s): ${invalidTimeframes.join(', ')}. Supported: ${SUPPORTED_MARKET_SCAN_TIMEFRAMES.join(', ')}`,
    );
  }

  return timeframes;
};

export const parseTradePlanConfig = (values: NodeJS.ProcessEnv = process.env): TradePlanConfig => {
  const stopLossPercent = parseRequiredPositiveNumber(
    values.TRADE_STOP_LOSS_PERCENT,
    1,
    'TRADE_STOP_LOSS_PERCENT',
  );
  const targetMinPercent = parseRequiredPositiveNumber(
    values.TRADE_TARGET_MIN_PERCENT,
    2,
    'TRADE_TARGET_MIN_PERCENT',
  );
  const targetMaxPercent = parseRequiredPositiveNumber(
    values.TRADE_TARGET_MAX_PERCENT,
    3,
    'TRADE_TARGET_MAX_PERCENT',
  );

  if (targetMaxPercent <= targetMinPercent) {
    throw new Error('TRADE_TARGET_MAX_PERCENT must be greater than TRADE_TARGET_MIN_PERCENT');
  }

  return {
    stopLossPercent,
    targetMinPercent,
    targetMaxPercent,
  };
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  return value.trim().toLowerCase() === 'true';
};

const parseTickers = (value: string | undefined): string[] => {
  const rawTickers = value ?? 'SPY,QQQ,AAPL,MSFT,NVDA';

  return rawTickers
    .split(',')
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
};

const parseWatchlistName = (value: string | undefined): WatchlistName => {
  const watchlist = value ?? 'custom';

  if (watchlist === 'etfs' || watchlist === 'growth' || watchlist === 'dividends') {
    return watchlist;
  }

  return 'custom';
};

export const buildEnvRuntimeConfig = (values: NodeJS.ProcessEnv = process.env): EngineRuntimeConfig => ({
  strategyVersion: values.ENGINE_STRATEGY_VERSION ?? 'v1',
  marketScanCandleLimit: parseInteger(values.MARKET_SCAN_CANDLE_LIMIT, 80),
  marketDataMaxAgeMinutes: parseInteger(values.MARKET_DATA_MAX_AGE_MINUTES, 30),
  marketDataRequestDelayMs: parseInteger(values.MARKET_DATA_REQUEST_DELAY_MS, 13_000),
  marketDataMaxConcurrency: parseInteger(values.MARKET_DATA_MAX_CONCURRENCY, 5),
  marketDataBatchDelayMs: parseInteger(values.MARKET_DATA_BATCH_DELAY_MS, 250),
  marketDataMaxRetries: parseInteger(values.MARKET_DATA_MAX_RETRIES, 3),
  marketDataRetryBaseDelayMs: parseInteger(values.MARKET_DATA_RETRY_BASE_DELAY_MS, 1_000),
  marketDataSequential: parseBoolean(values.MARKET_DATA_SEQUENTIAL, true),
  tradePlan: parseTradePlanConfig(values),
  signalIntelligence: {
    backtestContextEnabled: parseBoolean(values.BACKTEST_CONTEXT_ENABLED, true),
    backtestContextMonths: parseInteger(values.BACKTEST_CONTEXT_MONTHS, 24),
    performanceMinSampleSize: parseInteger(values.PERFORMANCE_MIN_SAMPLE_SIZE, 20),
    forwardTestContextEnabled: parseBoolean(values.FORWARD_TEST_CONTEXT_ENABLED, true),
  },
  scoring: {
    maxAnalyzerScore: parseInteger(values.SCORING_MAX_ANALYZER_SCORE, 25),
    opportunityMinScore: parseInteger(values.OPPORTUNITY_MIN_SCORE, 50),
    telegramNotificationMinScore: parseInteger(values.TELEGRAM_NOTIFICATION_MIN_SCORE, 80),
    evidenceMinScore: parseInteger(values.EVIDENCE_MIN_SCORE, 80),
    duplicateWindowMinutes: parseInteger(values.OPPORTUNITY_DUPLICATE_WINDOW_MINUTES, 60),
    emaFastPeriod: parseInteger(values.TREND_EMA_FAST_PERIOD, 20),
    emaSlowPeriod: parseInteger(values.TREND_EMA_SLOW_PERIOD, 50),
    volumeLookbackPeriod: parseInteger(values.VOLUME_LOOKBACK_PERIOD, 20),
    volumeStrongRatio: parseNumber(values.VOLUME_STRONG_RATIO, 1.5),
    volumeModerateRatio: parseNumber(values.VOLUME_MODERATE_RATIO, 1.3),
    volumeWeakRatio: parseNumber(values.VOLUME_WEAK_RATIO, 1.1),
    rsiPeriod: parseInteger(values.MOMENTUM_RSI_PERIOD, 14),
    rsiIdealMin: parseNumber(values.MOMENTUM_RSI_IDEAL_MIN, 55),
    rsiIdealMax: parseNumber(values.MOMENTUM_RSI_IDEAL_MAX, 70),
    rsiNeutralMin: parseNumber(values.MOMENTUM_RSI_NEUTRAL_MIN, 45),
    rsiNeutralMax: parseNumber(values.MOMENTUM_RSI_NEUTRAL_MAX, 55),
    rsiExtendedMax: parseNumber(values.MOMENTUM_RSI_EXTENDED_MAX, 80),
    structureLookbackPeriod: parseInteger(values.STRUCTURE_LOOKBACK_PERIOD, 20),
  },
});

const runtimeConfig = buildEnvRuntimeConfig();

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
  telegramEnabled: parseBoolean(process.env.TELEGRAM_ENABLED, true),
  marketScanSchedule: process.env.MARKET_SCAN_SCHEDULE ?? '0 */15 14-21 * * 1-5',
  forwardSignalEvaluationSchedule:
    process.env.FORWARD_SIGNAL_EVALUATION_SCHEDULE ?? '0 0 * * * *',
  databaseBackupEnabled: parseBoolean(process.env.DATABASE_BACKUP_ENABLED, false),
  databaseBackupSchedule: process.env.DATABASE_BACKUP_SCHEDULE ?? '0 50 5 * * *',
  databaseBackupBasePath: process.env.DATABASE_BACKUP_BASE_PATH ?? './backups',
  databaseBackupTimezone: process.env.DATABASE_BACKUP_TIMEZONE ?? 'America/Mexico_City',
  marketScanTickers: parseTickers(process.env.MARKET_SCAN_TICKERS),
  marketScanTimeframe: process.env.MARKET_SCAN_TIMEFRAME ?? '15m',
  marketScanTimeframes: parseMarketScanTimeframes(),
  marketScanCandleLimit: runtimeConfig.marketScanCandleLimit,
  marketScanWatchlist: parseWatchlistName(process.env.MARKET_SCAN_WATCHLIST),
  marketScanDebug: parseBoolean(process.env.MARKET_SCAN_DEBUG, false),
  marketDataMaxAgeMinutes: runtimeConfig.marketDataMaxAgeMinutes,
  marketDataRequestDelayMs: runtimeConfig.marketDataRequestDelayMs,
  marketDataMaxConcurrency: runtimeConfig.marketDataMaxConcurrency,
  marketDataBatchDelayMs: runtimeConfig.marketDataBatchDelayMs,
  marketDataMaxRetries: runtimeConfig.marketDataMaxRetries,
  marketDataRetryBaseDelayMs: runtimeConfig.marketDataRetryBaseDelayMs,
  marketDataSequential: runtimeConfig.marketDataSequential,
  tradePlan: runtimeConfig.tradePlan,
  signalIntelligence: runtimeConfig.signalIntelligence,
  scoring: runtimeConfig.scoring,
  strategyVersion: runtimeConfig.strategyVersion,
};
