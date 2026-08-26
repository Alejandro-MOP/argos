import { buildEnvRuntimeConfig } from '../src/config/env';
import { EngineConfigService } from '../src/services/EngineConfigService';

const buildLogger = () => ({ log: jest.fn(), error: jest.fn() });

describe('EngineConfigService', () => {
  it('loads active PostgreSQL config once and converts typed values', async () => {
    const repository = {
      findActive: jest.fn().mockResolvedValue([
        {
          key: 'ENGINE_STRATEGY_VERSION',
          value: 'v2',
          valueType: 'string',
          category: 'strategy',
          description: 'Version',
          isActive: true,
        },
        {
          key: 'OPPORTUNITY_MIN_SCORE',
          value: '90',
          valueType: 'number',
          category: 'scoring',
          description: 'Score mínimo',
          isActive: true,
        },
        {
          key: 'MARKET_DATA_SEQUENTIAL',
          value: 'false',
          valueType: 'boolean',
          category: 'market-data',
          description: 'Secuencial',
          isActive: true,
        },
      ]),
    };
    const logger = buildLogger();
    const service = new EngineConfigService(repository, buildEnvRuntimeConfig({}));

    const snapshot = await service.loadSnapshot(logger);

    expect(repository.findActive).toHaveBeenCalledTimes(1);
    expect(snapshot.source).toBe('postgres');
    expect(snapshot.values.strategyVersion).toBe('v2');
    expect(snapshot.values.scoring.opportunityMinScore).toBe(90);
    expect(snapshot.values.marketDataSequential).toBe(false);
    expect(logger.log).toHaveBeenCalledWith('configSource=postgres');
  });

  it('falls back to env defaults when PostgreSQL config fails', async () => {
    const fallback = buildEnvRuntimeConfig({ OPPORTUNITY_MIN_SCORE: '77' });
    const repository = {
      findActive: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const logger = buildLogger();
    const service = new EngineConfigService(repository, fallback);

    const snapshot = await service.loadSnapshot(logger);

    expect(snapshot.source).toBe('env-fallback');
    expect(snapshot.values.scoring.opportunityMinScore).toBe(77);
    expect(logger.error).toHaveBeenCalledWith(
      'configSource=env-fallback reason=engine-config-load-failed',
      expect.objectContaining({ message: 'db down' }),
    );
  });
});
