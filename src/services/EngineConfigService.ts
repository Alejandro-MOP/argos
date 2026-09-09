import type { EngineConfigEntry, EngineConfigSnapshot, EngineRuntimeConfig } from '../models/EngineConfig';
import type { EngineConfigRepository } from '../ports/EngineConfigRepository';

export interface EngineConfigLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

const SUPPORTED_TIMEFRAMES = new Set(['1m', '5m', '15m', '30m', '1h', '1d', '1w']);

const REQUIRED_ENGINE_CONFIG_KEYS = [
  'ENGINE_STRATEGY_VERSION',
  'MARKET_SCAN_CANDLE_LIMIT',
  'MARKET_DATA_MAX_AGE_MINUTES',
  'MARKET_DATA_REQUEST_DELAY_MS',
  'MARKET_DATA_MAX_CONCURRENCY',
  'MARKET_DATA_BATCH_DELAY_MS',
  'MARKET_DATA_MAX_RETRIES',
  'MARKET_DATA_RETRY_BASE_DELAY_MS',
  'MARKET_DATA_SEQUENTIAL',
  'TRADE_STOP_LOSS_PERCENT',
  'TRADE_TARGET_MIN_PERCENT',
  'TRADE_TARGET_MAX_PERCENT',
  'BACKTEST_CONTEXT_ENABLED',
  'BACKTEST_CONTEXT_MONTHS',
  'PERFORMANCE_MIN_SAMPLE_SIZE',
  'FORWARD_TEST_CONTEXT_ENABLED',
  'TELEGRAM_NOTIFICATION_TIMEFRAMES',
  'SCORING_MAX_ANALYZER_SCORE',
  'OPPORTUNITY_MIN_SCORE',
  'TELEGRAM_NOTIFICATION_MIN_SCORE',
  'EVIDENCE_MIN_SCORE',
  'OPPORTUNITY_DUPLICATE_WINDOW_MINUTES',
  'TREND_EMA_FAST_PERIOD',
  'TREND_EMA_SLOW_PERIOD',
  'VOLUME_LOOKBACK_PERIOD',
  'VOLUME_STRONG_RATIO',
  'VOLUME_MODERATE_RATIO',
  'VOLUME_WEAK_RATIO',
  'MOMENTUM_RSI_PERIOD',
  'MOMENTUM_RSI_IDEAL_MIN',
  'MOMENTUM_RSI_IDEAL_MAX',
  'MOMENTUM_RSI_NEUTRAL_MIN',
  'MOMENTUM_RSI_NEUTRAL_MAX',
  'MOMENTUM_RSI_EXTENDED_MAX',
  'STRUCTURE_LOOKBACK_PERIOD',
  'ORB_FVG_TRADE_READY_ALERTS_ENABLED',
] as const;

export class EngineConfigService {
  public constructor(private readonly repository: EngineConfigRepository) {}

  public async loadSnapshot(logger?: EngineConfigLogger): Promise<EngineConfigSnapshot> {
    const entries = await this.repository.findActive();

    if (entries.length === 0) {
      throw new Error('engine-config-unavailable: no active engine_config rows found');
    }

    const values = this.mergeConfig(entries);
    this.validate(values);
    logger?.log('configSource=postgres');

    return { source: 'postgres', values };
  }

  private mergeConfig(entries: EngineConfigEntry[]): EngineRuntimeConfig {
    const parsedValues = new Map<string, unknown>();

    for (const entry of entries) {
      parsedValues.set(entry.key, this.parseValue(entry));
    }

    this.assertRequiredKeys(parsedValues);

    return {
      strategyVersion: this.getString(parsedValues, 'ENGINE_STRATEGY_VERSION'),
      marketScanCandleLimit: this.getNumber(parsedValues, 'MARKET_SCAN_CANDLE_LIMIT'),
      marketDataMaxAgeMinutes: this.getNumber(parsedValues, 'MARKET_DATA_MAX_AGE_MINUTES'),
      marketDataRequestDelayMs: this.getNumber(parsedValues, 'MARKET_DATA_REQUEST_DELAY_MS'),
      marketDataMaxConcurrency: this.getNumber(parsedValues, 'MARKET_DATA_MAX_CONCURRENCY'),
      marketDataBatchDelayMs: this.getNumber(parsedValues, 'MARKET_DATA_BATCH_DELAY_MS'),
      marketDataMaxRetries: this.getNumber(parsedValues, 'MARKET_DATA_MAX_RETRIES'),
      marketDataRetryBaseDelayMs: this.getNumber(parsedValues, 'MARKET_DATA_RETRY_BASE_DELAY_MS'),
      marketDataSequential: this.getBoolean(parsedValues, 'MARKET_DATA_SEQUENTIAL'),
      tradePlan: {
        stopLossPercent: this.getNumber(parsedValues, 'TRADE_STOP_LOSS_PERCENT'),
        targetMinPercent: this.getNumber(parsedValues, 'TRADE_TARGET_MIN_PERCENT'),
        targetMaxPercent: this.getNumber(parsedValues, 'TRADE_TARGET_MAX_PERCENT'),
      },
      signalIntelligence: {
        backtestContextEnabled: this.getBoolean(parsedValues, 'BACKTEST_CONTEXT_ENABLED'),
        backtestContextMonths: this.getNumber(parsedValues, 'BACKTEST_CONTEXT_MONTHS'),
        performanceMinSampleSize: this.getNumber(parsedValues, 'PERFORMANCE_MIN_SAMPLE_SIZE'),
        forwardTestContextEnabled: this.getBoolean(parsedValues, 'FORWARD_TEST_CONTEXT_ENABLED'),
      },
      telegramNotificationTimeframes: this.getStringList(parsedValues, 'TELEGRAM_NOTIFICATION_TIMEFRAMES'),
      orbFvgTradeReadyAlertsEnabled: this.getBoolean(parsedValues, 'ORB_FVG_TRADE_READY_ALERTS_ENABLED'),
      scoring: {
        maxAnalyzerScore: this.getNumber(parsedValues, 'SCORING_MAX_ANALYZER_SCORE'),
        opportunityMinScore: this.getNumber(parsedValues, 'OPPORTUNITY_MIN_SCORE'),
        telegramNotificationMinScore: this.getNumber(parsedValues, 'TELEGRAM_NOTIFICATION_MIN_SCORE'),
        evidenceMinScore: this.getNumber(parsedValues, 'EVIDENCE_MIN_SCORE'),
        duplicateWindowMinutes: this.getNumber(parsedValues, 'OPPORTUNITY_DUPLICATE_WINDOW_MINUTES'),
        emaFastPeriod: this.getNumber(parsedValues, 'TREND_EMA_FAST_PERIOD'),
        emaSlowPeriod: this.getNumber(parsedValues, 'TREND_EMA_SLOW_PERIOD'),
        volumeLookbackPeriod: this.getNumber(parsedValues, 'VOLUME_LOOKBACK_PERIOD'),
        volumeStrongRatio: this.getNumber(parsedValues, 'VOLUME_STRONG_RATIO'),
        volumeModerateRatio: this.getNumber(parsedValues, 'VOLUME_MODERATE_RATIO'),
        volumeWeakRatio: this.getNumber(parsedValues, 'VOLUME_WEAK_RATIO'),
        rsiPeriod: this.getNumber(parsedValues, 'MOMENTUM_RSI_PERIOD'),
        rsiIdealMin: this.getNumber(parsedValues, 'MOMENTUM_RSI_IDEAL_MIN'),
        rsiIdealMax: this.getNumber(parsedValues, 'MOMENTUM_RSI_IDEAL_MAX'),
        rsiNeutralMin: this.getNumber(parsedValues, 'MOMENTUM_RSI_NEUTRAL_MIN'),
        rsiNeutralMax: this.getNumber(parsedValues, 'MOMENTUM_RSI_NEUTRAL_MAX'),
        rsiExtendedMax: this.getNumber(parsedValues, 'MOMENTUM_RSI_EXTENDED_MAX'),
        structureLookbackPeriod: this.getNumber(parsedValues, 'STRUCTURE_LOOKBACK_PERIOD'),
      },
    };
  }

  private parseValue(entry: EngineConfigEntry): unknown {
    switch (entry.valueType) {
      case 'string':
        return entry.value;
      case 'number': {
        const value = Number(entry.value);
        if (!Number.isFinite(value)) {
          throw new Error(`engine_config ${entry.key} must be a valid number`);
        }
        return value;
      }
      case 'boolean':
        return entry.value.trim().toLowerCase() === 'true';
      case 'json':
        return JSON.parse(entry.value) as unknown;
    }
  }

  private assertRequiredKeys(values: Map<string, unknown>): void {
    const missing = REQUIRED_ENGINE_CONFIG_KEYS.filter((key) => !values.has(key));

    if (missing.length > 0) {
      throw new Error(`engine-config-incomplete: missing active key(s): ${missing.join(', ')}`);
    }
  }

  private getString(values: Map<string, unknown>, key: string): string {
    const value = values.get(key);
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    throw new Error(`engine_config ${key} must be a non-empty string`);
  }

  private getNumber(values: Map<string, unknown>, key: string): number {
    const value = values.get(key);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    throw new Error(`engine_config ${key} must be a valid number`);
  }

  private getBoolean(values: Map<string, unknown>, key: string): boolean {
    const value = values.get(key);
    if (typeof value === 'boolean') {
      return value;
    }
    throw new Error(`engine_config ${key} must be a boolean`);
  }

  private getStringList(values: Map<string, unknown>, key: string): string[] {
    const value = this.getString(values, key);
    const items = [
      ...new Set(
        value
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];

    if (items.length === 0) {
      throw new Error(`engine_config ${key} must include at least one value`);
    }

    const invalid = items.filter((item) => !SUPPORTED_TIMEFRAMES.has(item));
    if (invalid.length > 0) {
      throw new Error(`engine_config ${key} has unsupported timeframe(s): ${invalid.join(', ')}`);
    }

    return items;
  }

  private validate(config: EngineRuntimeConfig): void {
    const positiveKeys: Array<[string, number]> = [
      ['MARKET_SCAN_CANDLE_LIMIT', config.marketScanCandleLimit],
      ['MARKET_DATA_MAX_AGE_MINUTES', config.marketDataMaxAgeMinutes],
      ['MARKET_DATA_MAX_CONCURRENCY', config.marketDataMaxConcurrency],
      ['MARKET_DATA_MAX_RETRIES', config.marketDataMaxRetries],
      ['MARKET_DATA_RETRY_BASE_DELAY_MS', config.marketDataRetryBaseDelayMs],
      ['SCORING_MAX_ANALYZER_SCORE', config.scoring.maxAnalyzerScore],
      ['EVIDENCE_MIN_SCORE', config.scoring.evidenceMinScore],
      ['TREND_EMA_FAST_PERIOD', config.scoring.emaFastPeriod],
      ['TREND_EMA_SLOW_PERIOD', config.scoring.emaSlowPeriod],
      ['VOLUME_LOOKBACK_PERIOD', config.scoring.volumeLookbackPeriod],
      ['MOMENTUM_RSI_PERIOD', config.scoring.rsiPeriod],
      ['STRUCTURE_LOOKBACK_PERIOD', config.scoring.structureLookbackPeriod],
      ['TRADE_STOP_LOSS_PERCENT', config.tradePlan.stopLossPercent],
      ['TRADE_TARGET_MIN_PERCENT', config.tradePlan.targetMinPercent],
      ['TRADE_TARGET_MAX_PERCENT', config.tradePlan.targetMaxPercent],
      ['BACKTEST_CONTEXT_MONTHS', config.signalIntelligence.backtestContextMonths],
      ['PERFORMANCE_MIN_SAMPLE_SIZE', config.signalIntelligence.performanceMinSampleSize],
    ];

    if (!Number.isFinite(config.marketDataRequestDelayMs) || config.marketDataRequestDelayMs < 0) {
      throw new Error('MARKET_DATA_REQUEST_DELAY_MS must be greater than or equal to 0');
    }

    if (!Number.isFinite(config.marketDataBatchDelayMs) || config.marketDataBatchDelayMs < 0) {
      throw new Error('MARKET_DATA_BATCH_DELAY_MS must be greater than or equal to 0');
    }

    for (const [key, value] of positiveKeys) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${key} must be greater than 0`);
      }
    }

    if (config.tradePlan.targetMaxPercent <= config.tradePlan.targetMinPercent) {
      throw new Error('TRADE_TARGET_MAX_PERCENT must be greater than TRADE_TARGET_MIN_PERCENT');
    }
  }
}
