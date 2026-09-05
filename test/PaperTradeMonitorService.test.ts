import { PaperTradeMemoryRepository } from '../src/repositories/PaperTradeMemoryRepository';
import { PaperTradeMonitorService, percentMove } from '../src/services/PaperTradeMonitorService';
import { PaperTradeService } from '../src/services/PaperTradeService';

describe('PaperTradeMonitorService', () => {
  const logger = { log: jest.fn(), error: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('updates MFE/MAE and sends exactly one alert per crossed level', async () => {
    const repository = new PaperTradeMemoryRepository();
    const service = new PaperTradeService(repository, { getCandles: jest.fn() });
    const trade = await service.createOpenTrade({
      ticker: 'NVDA',
      assetType: 'STOCK',
      timeframe: '5m',
      score: 100,
      strategyVersion: 'v1',
      entryPrice: 100,
      entryAt: new Date('2026-09-05T15:00:00.000Z'),
    });
    const getCandles = jest.fn().mockResolvedValue([
      { timestamp: new Date('2026-09-05T15:05:00.000Z'), open: 100, high: 102, low: 99, close: 101.6, volume: 1000 },
    ]);
    const telegramClient = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    const monitor = new PaperTradeMonitorService(repository, { getCandles }, telegramClient);

    const firstRun = await monitor.run(logger);
    const secondRun = await monitor.run(logger);
    const stored = await repository.findById(trade.id ?? '');

    expect(getCandles).toHaveBeenCalledWith('NVDA', '5m', 1);
    expect(firstRun.levelsTriggered).toBe(2);
    expect(firstRun.telegramAlertsSent).toBe(2);
    expect(secondRun.levelsTriggered).toBe(0);
    expect(secondRun.telegramAlertsSent).toBe(0);
    expect(telegramClient.sendMessage).toHaveBeenCalledTimes(2);
    expect(stored?.currentMfePct).toBe(1.6);
    expect(stored?.currentMaePct).toBe(0);
    expect(stored?.levels?.filter((level) => level.triggeredAt)).toHaveLength(2);
  });

  it('ignores closed trades', async () => {
    const repository = new PaperTradeMemoryRepository();
    const service = new PaperTradeService(repository, { getCandles: jest.fn() });
    const trade = await service.createOpenTrade({
      ticker: 'NVDA',
      assetType: 'STOCK',
      timeframe: '5m',
      score: 100,
      strategyVersion: 'v1',
      entryPrice: 100,
    });
    await service.closeTrade(trade.id ?? '', 101);
    const getCandles = jest.fn();
    const monitor = new PaperTradeMonitorService(repository, { getCandles }, { sendMessage: jest.fn() });

    const metrics = await monitor.run(logger);

    expect(metrics.openTrades).toBe(0);
    expect(getCandles).not.toHaveBeenCalled();
  });


  it('does not throw when the repository is unavailable', async () => {
    const repository = {
      findOpen: jest.fn().mockRejectedValue(new Error('relation "paper_trades" does not exist')),
      findOpenByTicker: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateExtremes: jest.fn(),
      claimLevelTrigger: jest.fn(),
      recordLevelAction: jest.fn(),
      close: jest.fn(),
    };
    const monitor = new PaperTradeMonitorService(repository, { getCandles: jest.fn() }, { sendMessage: jest.fn() });

    await expect(monitor.run(logger)).resolves.toEqual(expect.objectContaining({ errors: 1 }));
    expect(logger.error).toHaveBeenCalledWith(
      '[PaperTradeMonitor] repository unavailable; skipping paper trade monitor cycle',
      expect.any(Error),
    );
  });

  it('calculates signed percent moves preserving adverse values', () => {
    expect(percentMove(101.234, 100)).toBe(1.23);
    expect(percentMove(98.95, 100)).toBe(-1.05);
  });
});
