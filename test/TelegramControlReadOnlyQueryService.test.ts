import { TelegramControlReadOnlyQueryService } from '../src/services/TelegramControlReadOnlyQueryService';

describe('TelegramControlReadOnlyQueryService', () => {
  it('calls the real research snapshot dependency once', async () => {
    const snapshot = { schemaVersion: '1' };
    const researchSnapshotService = { generate: jest.fn().mockResolvedValue(snapshot) };
    const service = new TelegramControlReadOnlyQueryService({ researchSnapshotService });

    await expect(service.getResearchSnapshot()).resolves.toBe(snapshot);

    expect(researchSnapshotService.generate).toHaveBeenCalledTimes(1);
  });

  it('calls the strategy profile provider without duplicating provider filters', async () => {
    const summary = { profiles: [] };
    const strategyProfileProvider = { getProfiles: jest.fn().mockResolvedValue(summary) };
    const service = new TelegramControlReadOnlyQueryService({ strategyProfileProvider });

    await expect(service.getStrategyProfiles()).resolves.toBe(summary);

    expect(strategyProfileProvider.getProfiles).toHaveBeenCalledWith();
  });

  it('calls the forward performance provider without recalculating metrics', async () => {
    const summary = { sampleSize: 12 };
    const forwardPerformanceProvider = { getPerformance: jest.fn().mockResolvedValue(summary) };
    const service = new TelegramControlReadOnlyQueryService({ forwardPerformanceProvider });

    await expect(service.getForwardPerformance()).resolves.toBe(summary);

    expect(forwardPerformanceProvider.getPerformance).toHaveBeenCalledWith();
  });

  it('reports system status with SELECT-only database health check', async () => {
    const database = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
    const service = new TelegramControlReadOnlyQueryService({
      database,
      researchSnapshotService: { generate: jest.fn() },
      strategyProfileProvider: { getProfiles: jest.fn() },
      forwardPerformanceProvider: { getPerformance: jest.fn() },
    });

    await expect(service.getSystemStatus()).resolves.toEqual({
      controlBot: 'ONLINE',
      database: 'CONNECTED',
      researchServices: 'AVAILABLE',
      mode: 'Local Development',
      controlTransport: 'Telegram Long Polling',
    });
    expect(database.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('reports database unavailable without exposing credentials', async () => {
    const database = { query: jest.fn().mockRejectedValue(new Error('postgres://user:secret@localhost/db failed')) };
    const service = new TelegramControlReadOnlyQueryService({ database });

    await expect(service.getSystemStatus()).resolves.toMatchObject({
      database: 'UNAVAILABLE',
      researchServices: 'UNAVAILABLE',
    });
  });
});
