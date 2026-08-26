import type { EngineConfigEntry, EngineConfigSnapshot, EngineRuntimeConfig } from '../models/EngineConfig';
import type { EngineConfigRepository } from '../ports/EngineConfigRepository';

export interface EngineConfigLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export class EngineConfigService {
  public constructor(
    private readonly repository: EngineConfigRepository,
    private readonly fallbackConfig: EngineRuntimeConfig,
  ) {}

  public async loadSnapshot(logger?: EngineConfigLogger): Promise<EngineConfigSnapshot> {
    try {
      const entries = await this.repository.findActive();

      if (entries.length === 0) {
        logger?.log('configSource=env-fallback reason=no-active-engine-config');
        return { source: 'env-fallback', values: this.fallbackConfig };
      }

      const values = this.mergeConfig(entries);
      this.validate(values);
      logger?.log('configSource=postgres');

      return { source: 'postgres', values };
    } catch (error) {
      logger?.error('configSource=env-fallback reason=engine-config-load-failed', {
        message: error instanceof Error ? error.message : 'unknown-error',
      });
      return { source: 'env-fallback', values: this.fallbackConfig };
    }
  }

  private mergeConfig(entries: EngineConfigEntry[]): EngineRuntimeConfig {
    const parsedValues = new Map<string, unknown>();

    for (const entry of entries) {
      parsedValues.set(entry.key, this.parseValue(entry));
    }

    return {
      strategyVersion: this.getString(parsedValues, 'ENGINE_STRATEGY_VERSION', this.fallbackConfig.strategyVersion),
      marketScanCandleLimit: this.getNumber(parsedValues, 'MARKET_SCAN_CANDLE_LIMIT', this.fallbackConfig.marketScanCandleLimit),
      marketDataMaxAgeMinutes: this.getNumber(parsedValues, 'MARKET_DATA_MAX_AGE_MINUTES', this.fallbackConfig.marketDataMaxAgeMinutes),
      marketDataRequestDelayMs: this.getNumber(parsedValues, 'MARKET_DATA_REQUEST_DELAY_MS', this.fallbackConfig.marketDataRequestDelayMs),
      marketDataMaxConcurrency: this.getNumber(parsedValues, 'MARKET_DATA_MAX_CONCURRENCY', this.fallbackConfig.marketDataMaxConcurrency),
      marketDataBatchDelayMs: this.getNumber(parsedValues, 'MARKET_DATA_BATCH_DELAY_MS', this.fallbackConfig.marketDataBatchDelayMs),
      marketDataMaxRetries: this.getNumber(parsedValues, 'MARKET_DATA_MAX_RETRIES', this.fallbackConfig.marketDataMaxRetries),
      marketDataRetryBaseDelayMs: this.getNumber(parsedValues, 'MARKET_DATA_RETRY_BASE_DELAY_MS', this.fallbackConfig.marketDataRetryBaseDelayMs),
      marketDataSequential: this.getBoolean(parsedValues, 'MARKET_DATA_SEQUENTIAL', this.fallbackConfig.marketDataSequential),
      tradePlan: {
        stopLossPercent: this.getNumber(parsedValues, 'TRADE_STOP_LOSS_PERCENT', this.fallbackConfig.tradePlan.stopLossPercent),
        targetMinPercent: this.getNumber(parsedValues, 'TRADE_TARGET_MIN_PERCENT', this.fallbackConfig.tradePlan.targetMinPercent),
        targetMaxPercent: this.getNumber(parsedValues, 'TRADE_TARGET_MAX_PERCENT', this.fallbackConfig.tradePlan.targetMaxPercent),
      },
      signalIntelligence: {
        backtestContextEnabled: this.getBoolean(parsedValues, 'BACKTEST_CONTEXT_ENABLED', this.fallbackConfig.signalIntelligence.backtestContextEnabled),
        backtestContextMonths: this.getNumber(parsedValues, 'BACKTEST_CONTEXT_MONTHS', this.fallbackConfig.signalIntelligence.backtestContextMonths),
        performanceMinSampleSize: this.getNumber(parsedValues, 'PERFORMANCE_MIN_SAMPLE_SIZE', this.fallbackConfig.signalIntelligence.performanceMinSampleSize),
        forwardTestContextEnabled: this.getBoolean(parsedValues, 'FORWARD_TEST_CONTEXT_ENABLED', this.fallbackConfig.signalIntelligence.forwardTestContextEnabled),
      },
      scoring: {
        maxAnalyzerScore: this.getNumber(parsedValues, 'SCORING_MAX_ANALYZER_SCORE', this.fallbackConfig.scoring.maxAnalyzerScore),
        opportunityMinScore: this.getNumber(parsedValues, 'OPPORTUNITY_MIN_SCORE', this.fallbackConfig.scoring.opportunityMinScore),
        telegramNotificationMinScore: this.getNumber(parsedValues, 'TELEGRAM_NOTIFICATION_MIN_SCORE', this.fallbackConfig.scoring.telegramNotificationMinScore),
        evidenceMinScore: this.getNumber(parsedValues, 'EVIDENCE_MIN_SCORE', this.fallbackConfig.scoring.evidenceMinScore),
        duplicateWindowMinutes: this.getNumber(parsedValues, 'OPPORTUNITY_DUPLICATE_WINDOW_MINUTES', this.fallbackConfig.scoring.duplicateWindowMinutes),
        emaFastPeriod: this.getNumber(parsedValues, 'TREND_EMA_FAST_PERIOD', this.fallbackConfig.scoring.emaFastPeriod),
        emaSlowPeriod: this.getNumber(parsedValues, 'TREND_EMA_SLOW_PERIOD', this.fallbackConfig.scoring.emaSlowPeriod),
        volumeLookbackPeriod: this.getNumber(parsedValues, 'VOLUME_LOOKBACK_PERIOD', this.fallbackConfig.scoring.volumeLookbackPeriod),
        volumeStrongRatio: this.getNumber(parsedValues, 'VOLUME_STRONG_RATIO', this.fallbackConfig.scoring.volumeStrongRatio),
        volumeModerateRatio: this.getNumber(parsedValues, 'VOLUME_MODERATE_RATIO', this.fallbackConfig.scoring.volumeModerateRatio),
        volumeWeakRatio: this.getNumber(parsedValues, 'VOLUME_WEAK_RATIO', this.fallbackConfig.scoring.volumeWeakRatio),
        rsiPeriod: this.getNumber(parsedValues, 'MOMENTUM_RSI_PERIOD', this.fallbackConfig.scoring.rsiPeriod),
        rsiIdealMin: this.getNumber(parsedValues, 'MOMENTUM_RSI_IDEAL_MIN', this.fallbackConfig.scoring.rsiIdealMin),
        rsiIdealMax: this.getNumber(parsedValues, 'MOMENTUM_RSI_IDEAL_MAX', this.fallbackConfig.scoring.rsiIdealMax),
        rsiNeutralMin: this.getNumber(parsedValues, 'MOMENTUM_RSI_NEUTRAL_MIN', this.fallbackConfig.scoring.rsiNeutralMin),
        rsiNeutralMax: this.getNumber(parsedValues, 'MOMENTUM_RSI_NEUTRAL_MAX', this.fallbackConfig.scoring.rsiNeutralMax),
        rsiExtendedMax: this.getNumber(parsedValues, 'MOMENTUM_RSI_EXTENDED_MAX', this.fallbackConfig.scoring.rsiExtendedMax),
        structureLookbackPeriod: this.getNumber(parsedValues, 'STRUCTURE_LOOKBACK_PERIOD', this.fallbackConfig.scoring.structureLookbackPeriod),
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

  private getString(values: Map<string, unknown>, key: string, fallback: string): string {
    const value = values.get(key);
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private getNumber(values: Map<string, unknown>, key: string, fallback: number): number {
    const value = values.get(key);
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private getBoolean(values: Map<string, unknown>, key: string, fallback: boolean): boolean {
    const value = values.get(key);
    return typeof value === 'boolean' ? value : fallback;
  }

  private validate(config: EngineRuntimeConfig): void {
    const positiveKeys: Array<[string, number]> = [
      ['MARKET_SCAN_CANDLE_LIMIT', config.marketScanCandleLimit],
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
