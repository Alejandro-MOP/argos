import type { EngineConfigEntry } from '../src/models/EngineConfig';
import { EngineConfigService } from '../src/services/EngineConfigService';

const buildLogger = () => ({ log: jest.fn(), error: jest.fn() });

const activeConfigEntries = (overrides: Partial<Record<string, string>> = {}): EngineConfigEntry[] => {
  const values: Array<[string, string, EngineConfigEntry['valueType'], string]> = [
    ['ENGINE_STRATEGY_VERSION', 'v1', 'string', 'strategy'],
    ['MARKET_SCAN_CANDLE_LIMIT', '80', 'number', 'market-scan'],
    ['MARKET_DATA_MAX_AGE_MINUTES', '20', 'number', 'market-data'],
    ['MARKET_DATA_REQUEST_DELAY_MS', '0', 'number', 'market-data'],
    ['MARKET_DATA_MAX_CONCURRENCY', '5', 'number', 'market-data'],
    ['MARKET_DATA_BATCH_DELAY_MS', '250', 'number', 'market-data'],
    ['MARKET_DATA_MAX_RETRIES', '3', 'number', 'market-data'],
    ['MARKET_DATA_RETRY_BASE_DELAY_MS', '30000', 'number', 'market-data'],
    ['MARKET_DATA_SEQUENTIAL', 'false', 'boolean', 'market-data'],
    ['TRADE_STOP_LOSS_PERCENT', '1', 'number', 'trade-plan'],
    ['TRADE_TARGET_MIN_PERCENT', '2', 'number', 'trade-plan'],
    ['TRADE_TARGET_MAX_PERCENT', '5', 'number', 'trade-plan'],
    ['BACKTEST_CONTEXT_ENABLED', 'true', 'boolean', 'signal-intelligence'],
    ['BACKTEST_CONTEXT_MONTHS', '24', 'number', 'signal-intelligence'],
    ['PERFORMANCE_MIN_SAMPLE_SIZE', '20', 'number', 'signal-intelligence'],
    ['FORWARD_TEST_CONTEXT_ENABLED', 'true', 'boolean', 'signal-intelligence'],
    ['TELEGRAM_NOTIFICATION_TIMEFRAMES', '5m,15m', 'string', 'notification'],
    ['SCORING_MAX_ANALYZER_SCORE', '25', 'number', 'scoring'],
    ['OPPORTUNITY_MIN_SCORE', '90', 'number', 'scoring'],
    ['TELEGRAM_NOTIFICATION_MIN_SCORE', '100', 'number', 'notification'],
    ['EVIDENCE_MIN_SCORE', '80', 'number', 'scoring'],
    ['OPPORTUNITY_DUPLICATE_WINDOW_MINUTES', '60', 'number', 'scoring'],
    ['TREND_EMA_FAST_PERIOD', '20', 'number', 'trend'],
    ['TREND_EMA_SLOW_PERIOD', '50', 'number', 'trend'],
    ['VOLUME_LOOKBACK_PERIOD', '20', 'number', 'volume'],
    ['VOLUME_STRONG_RATIO', '1.5', 'number', 'volume'],
    ['VOLUME_MODERATE_RATIO', '1.3', 'number', 'volume'],
    ['VOLUME_WEAK_RATIO', '1.1', 'number', 'volume'],
    ['MOMENTUM_RSI_PERIOD', '14', 'number', 'momentum'],
    ['MOMENTUM_RSI_IDEAL_MIN', '55', 'number', 'momentum'],
    ['MOMENTUM_RSI_IDEAL_MAX', '70', 'number', 'momentum'],
    ['MOMENTUM_RSI_NEUTRAL_MIN', '45', 'number', 'momentum'],
    ['MOMENTUM_RSI_NEUTRAL_MAX', '55', 'number', 'momentum'],
    ['MOMENTUM_RSI_EXTENDED_MAX', '80', 'number', 'momentum'],
    ['STRUCTURE_LOOKBACK_PERIOD', '20', 'number', 'structure'],
  ];

  return values.map(([key, value, valueType, category]) => ({
    key,
    value: overrides[key] ?? value,
    valueType,
    category,
    description: key,
    isActive: true,
  }));
};

describe('EngineConfigService', () => {
  it('loads active PostgreSQL config once and converts typed values', async () => {
    const repository = {
      findActive: jest.fn().mockResolvedValue(activeConfigEntries({
        ENGINE_STRATEGY_VERSION: 'v2',
        OPPORTUNITY_MIN_SCORE: '90',
        MARKET_DATA_SEQUENTIAL: 'false',
      })),
    };
    const logger = buildLogger();
    const service = new EngineConfigService(repository);

    const snapshot = await service.loadSnapshot(logger);

    expect(repository.findActive).toHaveBeenCalledTimes(1);
    expect(snapshot.source).toBe('postgres');
    expect(snapshot.values.strategyVersion).toBe('v2');
    expect(snapshot.values.scoring.opportunityMinScore).toBe(90);
    expect(snapshot.values.scoring.telegramNotificationMinScore).toBe(100);
    expect(snapshot.values.telegramNotificationTimeframes).toEqual(['5m', '15m']);
    expect(snapshot.values.tradePlan.targetMaxPercent).toBe(5);
    expect(snapshot.values.marketDataSequential).toBe(false);
    expect(logger.log).toHaveBeenCalledWith('configSource=postgres');
  });

  it('fails explicitly when PostgreSQL config is unavailable instead of falling back to env', async () => {
    const repository = {
      findActive: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const logger = buildLogger();
    const service = new EngineConfigService(repository);

    await expect(service.loadSnapshot(logger)).rejects.toThrow('db down');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('fails explicitly when required active keys are missing', async () => {
    const repository = {
      findActive: jest.fn().mockResolvedValue(
        activeConfigEntries().filter((entry) => entry.key !== 'TELEGRAM_NOTIFICATION_TIMEFRAMES'),
      ),
    };
    const service = new EngineConfigService(repository);

    await expect(service.loadSnapshot()).rejects.toThrow(
      'engine-config-incomplete: missing active key(s): TELEGRAM_NOTIFICATION_TIMEFRAMES',
    );
  });
});
