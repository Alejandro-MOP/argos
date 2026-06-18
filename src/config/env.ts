import dotenv from 'dotenv';
import type { WatchlistName } from '../services/WatchlistService';

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

export const env = {
  polygonApiKey: process.env.POLYGON_API_KEY ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
  telegramEnabled: parseBoolean(process.env.TELEGRAM_ENABLED, true),
  marketScanSchedule: process.env.MARKET_SCAN_SCHEDULE ?? '0 */15 14-21 * * 1-5',
  marketScanTickers: parseTickers(process.env.MARKET_SCAN_TICKERS),
  marketScanTimeframe: process.env.MARKET_SCAN_TIMEFRAME ?? '15m',
  marketScanCandleLimit: parseInteger(process.env.MARKET_SCAN_CANDLE_LIMIT, 80),
  marketScanWatchlist: parseWatchlistName(process.env.MARKET_SCAN_WATCHLIST),
  marketScanDebug: parseBoolean(process.env.MARKET_SCAN_DEBUG, false),
  marketDataMaxAgeMinutes: parseInteger(process.env.MARKET_DATA_MAX_AGE_MINUTES, 30),
  marketDataRequestDelayMs: parseInteger(process.env.MARKET_DATA_REQUEST_DELAY_MS, 13_000),
  marketDataMaxRetries: parseInteger(process.env.MARKET_DATA_MAX_RETRIES, 3),
  marketDataRetryBaseDelayMs: parseInteger(process.env.MARKET_DATA_RETRY_BASE_DELAY_MS, 30_000),
  marketDataSequential: parseBoolean(process.env.MARKET_DATA_SEQUENTIAL, true),
  scoring: {
    maxAnalyzerScore: parseInteger(process.env.SCORING_MAX_ANALYZER_SCORE, 25),
    opportunityNotifyThreshold: parseInteger(process.env.OPPORTUNITY_NOTIFY_THRESHOLD, 80),
    duplicateWindowMinutes: parseInteger(process.env.OPPORTUNITY_DUPLICATE_WINDOW_MINUTES, 60),
    emaFastPeriod: parseInteger(process.env.TREND_EMA_FAST_PERIOD, 20),
    emaSlowPeriod: parseInteger(process.env.TREND_EMA_SLOW_PERIOD, 50),
    volumeLookbackPeriod: parseInteger(process.env.VOLUME_LOOKBACK_PERIOD, 20),
    volumeStrongRatio: parseNumber(process.env.VOLUME_STRONG_RATIO, 1.5),
    volumeModerateRatio: parseNumber(process.env.VOLUME_MODERATE_RATIO, 1.3),
    volumeWeakRatio: parseNumber(process.env.VOLUME_WEAK_RATIO, 1.1),
    rsiPeriod: parseInteger(process.env.MOMENTUM_RSI_PERIOD, 14),
    rsiIdealMin: parseNumber(process.env.MOMENTUM_RSI_IDEAL_MIN, 55),
    rsiIdealMax: parseNumber(process.env.MOMENTUM_RSI_IDEAL_MAX, 70),
    rsiNeutralMin: parseNumber(process.env.MOMENTUM_RSI_NEUTRAL_MIN, 45),
    rsiNeutralMax: parseNumber(process.env.MOMENTUM_RSI_NEUTRAL_MAX, 55),
    rsiExtendedMax: parseNumber(process.env.MOMENTUM_RSI_EXTENDED_MAX, 80),
    structureLookbackPeriod: parseInteger(process.env.STRUCTURE_LOOKBACK_PERIOD, 20),
  },
};
