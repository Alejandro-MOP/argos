import type { Candle } from '../src/models/Candle';
import {
  ORB_FVG_EXPERIMENT_VERSION,
  ORB_FVG_EXPERIMENT_VERSION_V1,
  ORB_FVG_R_LEVELS,
  type OrbFvgSignalSnapshot,
} from '../src/models/OrbFvgSignal';
import { OrbFvgForwardMonitorService } from '../src/orbFvg/OrbFvgForwardMonitorService';
import { OrbFvgScannerService } from '../src/orbFvg/OrbFvgScannerService';
import { OrbFvgMemoryRepository } from '../src/repositories/OrbFvgMemoryRepository';

const candle = (
  timestamp: string,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle => ({
  timestamp: new Date(timestamp),
  open,
  high,
  low,
  close,
  volume: 100,
});

const logger = { log: jest.fn(), error: jest.fn() };

const stock = {
  symbol: 'NVDA',
  providerSymbol: 'NVDA',
  assetType: 'STOCK' as const,
  sector: 'Technology',
  industry: 'Semiconductors',
  market: 'US',
  exchange: 'NASDAQ',
  timezone: 'America/New_York',
  sessionType: 'US_REGULAR' as const,
  supportsIntraday: true,
  isActive: true,
  timeframes: ['1m'],
};

const etf = {
  ...stock,
  symbol: 'VOO',
  providerSymbol: 'VOO',
  assetType: 'ETF' as const,
  sector: 'Broad Market',
  industry: 'Large Blend ETF',
};
const crypto = {
  ...stock,
  symbol: 'BTC-USD',
  providerSymbol: 'BTC-USD',
  assetType: 'CRYPTO' as const,
  sessionType: 'TWENTY_FOUR_SEVEN' as const,
};

describe('ORB-FVG services', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scans STOCK and ETF universe, excludes CRYPTO, persists once and ignores duplicate reruns', async () => {
    const repository = new OrbFvgMemoryRepository();
    const sendMessage = jest.fn().mockResolvedValue(true);
    const marketDataService = {
      getHistoricalCandles: jest.fn(async (ticker: string, timeframe: string) => {
        if (timeframe === '15m') return [candle('2026-09-04T13:30:00.000Z', 100, 102, 99, 101)];
        return [
          candle('2026-09-04T13:45:00.000Z', 101, 101.5, 100.5, 101),
          candle('2026-09-04T13:50:00.000Z', 101, 103, 100.8, 102.5),
          candle('2026-09-04T13:55:00.000Z', 102.5, 104, 102.2, 103.5),
        ];
      }),
    };
    const service = new OrbFvgScannerService({
      marketUniverseService: {
        loadSnapshot: jest
          .fn()
          .mockResolvedValue({ source: 'postgres', symbols: [stock, etf, crypto] }),
      },
      marketDataService: marketDataService as never,
      repository,
      telegramClient: { sendMessage },
      now: () => new Date('2026-09-04T14:01:00.000Z'),
    });

    const first = await service.run(logger);
    const second = await service.run(logger);
    const stored = await repository.find();

    expect(first.eligible).toBe(2);
    expect(first.persisted).toBe(2);
    expect(second.persisted).toBe(0);
    expect(second.duplicates).toBe(0);
    expect(stored).toHaveLength(2);
    expect(stored[0].signal.experimentVersion).toBe(ORB_FVG_EXPERIMENT_VERSION);
    expect(stored[0].signal.setupTimeframe).toBe('5m');
    expect(stored[0].signal.telegramAlertSent).toBe(false);
    expect(stored[0].signal.orbFvgState).toBe('FVG_CREATED');
    expect(stored[0].signal.entryPrice).toBeUndefined();
    expect(stored[0].levels).toHaveLength(0);
    expect(stored[0].signal.scannerRunAt).toEqual(new Date('2026-09-04T14:01:00.000Z'));
    expect(stored[0].signal.detectedAt).toEqual(new Date('2026-09-04T14:01:00.000Z'));
    expect(stored[0].signal.detectionLagSeconds).toBe(660);
    expect(first.telegramAlertsSent).toBe(0);
    expect(second.telegramAlertsSent).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps ORB-FVG v0.1 detection LONG-only and does not persist bearish setups', async () => {
    const repository = new OrbFvgMemoryRepository();
    const sendMessage = jest.fn().mockResolvedValue(true);
    const service = new OrbFvgScannerService({
      marketUniverseService: {
        loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [stock] }),
      },
      marketDataService: {
        getHistoricalCandles: jest.fn(async (_ticker: string, timeframe: string) =>
          timeframe === '15m'
            ? [candle('2026-09-04T13:30:00.000Z', 100, 102, 99, 101)]
            : [
                candle('2026-09-04T13:45:00.000Z', 99.2, 99.4, 98.4, 98.5),
                candle('2026-09-04T13:50:00.000Z', 98.5, 98.8, 97.8, 98),
                candle('2026-09-04T13:55:00.000Z', 98, 98.3, 97, 97.5),
              ],
        ),
      } as never,
      repository,
      telegramClient: { sendMessage },
      now: () => new Date('2026-09-04T14:01:00.000Z'),
    });

    const first = await service.run(logger);
    const second = await service.run(logger);
    const stored = await repository.find({ direction: 'SHORT' });

    expect(first.breakoutsDetected).toBe(0);
    expect(first.fvgConfirmed).toBe(0);
    expect(first.persisted).toBe(0);
    expect(second.persisted).toBe(0);
    expect(stored).toHaveLength(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('logs that ORB-FVG Telegram is muted while research collection stays active', async () => {
    const service = new OrbFvgScannerService({
      marketUniverseService: {
        loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [] }),
      },
      marketDataService: { getHistoricalCandles: jest.fn() } as never,
      repository: new OrbFvgMemoryRepository(),
      now: () => new Date('2026-09-04T14:01:00.000Z'),
    });

    await service.run(logger);

    expect(logger.log).toHaveBeenCalledWith(
      '[ORB-FVG] telegramAlerts=DISABLED researchCollection=ACTIVE',
    );
  });

  it('does not scan before 09:45 ET', async () => {
    const service = new OrbFvgScannerService({
      marketUniverseService: { loadSnapshot: jest.fn() },
      marketDataService: { getHistoricalCandles: jest.fn() } as never,
      repository: new OrbFvgMemoryRepository(),
      now: () => new Date('2026-09-04T13:40:00.000Z'),
    });

    const result = await service.run(logger);

    expect(result.waitingForOpeningRange).toBe(1);
    expect(result.marketDataRequests).toBe(0);
  });

  it('keeps Opening Range boundaries on first 15m high/low instead of body boundaries', async () => {
    const repository = new OrbFvgMemoryRepository();
    const service = new OrbFvgScannerService({
      marketUniverseService: {
        loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [stock] }),
      },
      marketDataService: {
        getHistoricalCandles: jest.fn(async (_ticker: string, timeframe: string) =>
          timeframe === '15m'
            ? [candle('2026-09-04T13:30:00.000Z', 100, 110, 95, 101)]
            : [
                candle('2026-09-04T13:45:00.000Z', 101, 102, 100.5, 101),
                candle('2026-09-04T13:50:00.000Z', 101, 106, 100.8, 105),
                candle('2026-09-04T13:55:00.000Z', 105, 107, 102.2, 106),
              ],
        ),
      } as never,
      repository,
      now: () => new Date('2026-09-04T14:01:00.000Z'),
    });

    const result = await service.run(logger);

    expect(result.persisted).toBe(0);
    expect(await repository.find()).toHaveLength(0);
  });

  it('uses 5m candles only for automatic breakout and FVG detection', async () => {
    const repository = new OrbFvgMemoryRepository();
    const getHistoricalCandles = jest.fn(async (_ticker: string, timeframe: string) =>
      timeframe === '15m'
        ? [candle('2026-09-04T13:30:00.000Z', 100, 102, 99, 101)]
        : [
            candle('2026-09-04T13:45:00.000Z', 101, 101.5, 100.5, 101),
            candle('2026-09-04T13:50:00.000Z', 101, 103, 100.8, 102.5),
            candle('2026-09-04T13:55:00.000Z', 102.5, 104, 102.2, 103.5),
          ],
    );
    const service = new OrbFvgScannerService({
      marketUniverseService: {
        loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [stock] }),
      },
      marketDataService: { getHistoricalCandles } as never,
      repository,
      now: () => new Date('2026-09-04T14:01:00.000Z'),
    });

    await service.run(logger);

    expect(getHistoricalCandles).toHaveBeenCalledWith(
      'NVDA',
      '15m',
      expect.any(Date),
      expect.any(Date),
      { minimumCandles: 0 },
    );
    expect(getHistoricalCandles).toHaveBeenCalledWith(
      'NVDA',
      '5m',
      expect.any(Date),
      expect.any(Date),
      { minimumCandles: 0 },
    );
    expect(getHistoricalCandles).not.toHaveBeenCalledWith(
      'NVDA',
      '1m',
      expect.any(Date),
      expect.any(Date),
      expect.anything(),
    );
    expect((await repository.find())[0].signal.fvgCandle1.timestamp).toEqual(
      new Date('2026-09-04T13:45:00.000Z'),
    );
    expect((await repository.find())[0].signal.fvgCandle2.timestamp).toEqual(
      new Date('2026-09-04T13:50:00.000Z'),
    );
    expect((await repository.find())[0].signal.fvgCandle3.timestamp).toEqual(
      new Date('2026-09-04T13:55:00.000Z'),
    );
  });

  it('does not create a candidate for wick-only 5m breakouts', async () => {
    const repository = new OrbFvgMemoryRepository();
    const service = new OrbFvgScannerService({
      marketUniverseService: {
        loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [stock] }),
      },
      marketDataService: {
        getHistoricalCandles: jest.fn(async (_ticker: string, timeframe: string) =>
          timeframe === '15m'
            ? [candle('2026-09-04T13:30:00.000Z', 100, 102, 99, 101)]
            : [
                candle('2026-09-04T13:45:00.000Z', 100, 100.5, 99.8, 100.2),
                candle('2026-09-04T13:50:00.000Z', 100.2, 103, 100.1, 101.9),
                candle('2026-09-04T13:55:00.000Z', 101.9, 102, 100.8, 101.95),
              ],
        ),
      } as never,
      repository,
      now: () => new Date('2026-09-04T14:01:00.000Z'),
    });

    const result = await service.run(logger);

    expect(result.persisted).toBe(0);
    expect(await repository.find()).toHaveLength(0);
  });

  it('only processes the recent completed 5m structure and does not backfill stale patterns', async () => {
    const repository = new OrbFvgMemoryRepository();
    const service = new OrbFvgScannerService({
      marketUniverseService: {
        loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [stock] }),
      },
      marketDataService: {
        getHistoricalCandles: jest.fn(async (_ticker: string, timeframe: string) =>
          timeframe === '15m'
            ? [candle('2026-09-04T13:30:00.000Z', 100, 102, 99, 101)]
            : [
                candle('2026-09-04T13:45:00.000Z', 101, 101.5, 100.5, 101),
                candle('2026-09-04T13:50:00.000Z', 101, 103, 100.8, 102.5),
                candle('2026-09-04T13:55:00.000Z', 102.5, 104, 102.2, 103.5),
              ],
        ),
      } as never,
      repository,
      now: () => new Date('2026-09-04T14:06:00.000Z'),
    });

    const result = await service.run(logger);

    expect(result.persisted).toBe(0);
    expect(await repository.find()).toHaveLength(0);
  });

  it('monitors open signals, resolves a LONG win and triggers R levels once', async () => {
    const repository = new OrbFvgMemoryRepository();
    const signal = buildLongSignal();
    await repository.saveIfNotDuplicate(signal, ORB_FVG_R_LEVELS.map((rMultiple) => ({
      orbFvgSignalId: '',
      rMultiple,
      levelPrice: signal.entryPrice! + signal.risk! * rMultiple,
    })));

    const sendMessage = jest.fn().mockResolvedValue(true);
    const monitor = new OrbFvgForwardMonitorService({
      repository,
      marketDataService: {
        getHistoricalCandles: jest
          .fn()
          .mockResolvedValue([
            candle(
              '2026-09-04T14:00:00.000Z',
              signal.entryPrice!,
              signal.target2RPrice! + 0.5,
              signal.entryPrice!,
              signal.target2RPrice!,
            ),
          ]),
      } as never,
      telegramClient: { sendMessage },
      now: () => new Date('2026-09-04T14:10:00.000Z'),
    });

    const first = await monitor.run(logger);
    const second = await monitor.run(logger);
    const stored = await repository.find();

    expect(first.resolved).toBe(1);
    expect(first.wins).toBe(1);
    expect(first.levelsTriggered).toBeGreaterThan(0);
    expect(first.telegramResolutionAlertsSent).toBe(0);
    expect(second.openSignals).toBe(0);
    expect(stored[0].signal.status).toBe('WIN');
    expect(stored[0].signal.mfePct).toBeGreaterThan(0);
    expect(stored[0].signal.maePct).toBe(0);
    expect(stored[0].levels.filter((level) => level.triggeredAt)).toHaveLength(4);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps existing SHORT signals queryable and lets the monitor finish their forward evaluation', async () => {
    const repository = new OrbFvgMemoryRepository();
    const shortSignal = buildShortSignal();
    const levels = ORB_FVG_R_LEVELS.map((rMultiple) => ({
      orbFvgSignalId: '',
      rMultiple,
      levelPrice: shortSignal.entryPrice! - shortSignal.risk! * rMultiple,
    }));
    const saved = await repository.saveIfNotDuplicate(shortSignal, levels);
    const shortSignals = await repository.find({ direction: 'SHORT' });
    const sendMessage = jest.fn().mockResolvedValue(true);
    const monitor = new OrbFvgForwardMonitorService({
      repository,
      marketDataService: {
        getHistoricalCandles: jest
          .fn()
          .mockResolvedValue([candle('2026-09-04T13:52:00.000Z', 100, 100.2, 97.8, 98)]),
      } as never,
      telegramClient: { sendMessage },
      now: () => new Date('2026-09-04T14:10:00.000Z'),
    });

    const result = await monitor.run(logger);
    const stored = await repository.find({ direction: 'SHORT' });

    expect(saved.inserted).toBe(true);
    expect(shortSignals).toHaveLength(1);
    expect(result.resolved).toBe(1);
    expect(result.wins).toBe(1);
    expect(stored[0].signal.status).toBe('WIN');
    expect(result.telegramResolutionAlertsSent).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'LOSS',
      candles: [candle('2026-09-04T13:52:00.000Z', 100, 100.4, 98.8, 99)],
      now: new Date('2026-09-04T14:10:00.000Z'),
      expectedStatus: 'LOSS' as const,
    },
    {
      name: 'AMBIGUOUS',
      candles: [candle('2026-09-04T13:52:00.000Z', 100, 102.1, 98.8, 100)],
      now: new Date('2026-09-04T14:10:00.000Z'),
      expectedStatus: 'AMBIGUOUS' as const,
    },
    {
      name: 'EXPIRED',
      candles: [candle('2026-09-04T13:52:00.000Z', 100, 100.5, 99.5, 100.2)],
      now: new Date('2026-09-04T20:01:00.000Z'),
      expectedStatus: 'EXPIRED' as const,
    },
  ])(
    'persists $name ORB-FVG outcomes silently without Telegram RESULT alerts',
    async ({ candles, now, expectedStatus }) => {
      const repository = new OrbFvgMemoryRepository();
      const signal = buildLongSignal();
      const levels = ORB_FVG_R_LEVELS.map((rMultiple) => ({
        orbFvgSignalId: '',
        rMultiple,
        levelPrice: signal.entryPrice! + signal.risk! * rMultiple,
      }));
      await repository.saveIfNotDuplicate(signal, levels);
      const sendMessage = jest.fn().mockResolvedValue(true);
      const monitor = new OrbFvgForwardMonitorService({
        repository,
        marketDataService: { getHistoricalCandles: jest.fn().mockResolvedValue(candles) } as never,
        telegramClient: { sendMessage },
        now: () => now,
      });

      const result = await monitor.run(logger);
      const stored = await repository.find();

      expect(result.resolved).toBe(1);
      expect(result.telegramResolutionAlertsSent).toBe(0);
      expect(stored[0].signal.status).toBe(expectedStatus);
      expect(stored[0].signal.outcome).toBe(expectedStatus);
      expect(stored[0].signal.resolvedAt).toBeDefined();
      expect(sendMessage).not.toHaveBeenCalled();
    },
  );

  it('advances a TSLA-like setup through retest, structure break and continuation into TRADE_READY', async () => {
    const repository = new OrbFvgMemoryRepository();
    const service = buildStateMachineScanner(repository, [
      candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
      candle('2026-09-04T13:50:00.000Z', 102.5, 104, 102.4, 103.5),
      candle('2026-09-04T13:55:00.000Z', 103.5, 105, 103.3, 104),
      candle('2026-09-04T14:00:00.000Z', 104, 106, 104, 105.5),
      candle('2026-09-04T14:05:00.000Z', 105.5, 105.8, 103.1, 104),
      candle('2026-09-04T14:10:00.000Z', 104, 107, 104, 106.5),
      candle('2026-09-04T14:15:00.000Z', 106.5, 108, 106.4, 107.2),
    ]);

    await runScannerSequence(service, ['2026-09-04T14:01:00.000Z', '2026-09-04T14:06:00.000Z', '2026-09-04T14:11:00.000Z', '2026-09-04T14:16:00.000Z', '2026-09-04T14:21:00.000Z']);
    const stored = (await repository.find())[0].signal;

    expect(stored.orbFvgState).toBe('TRADE_READY');
    expect(stored.preRetraceHigh).toBe(106);
    expect(stored.retestCount).toBe(1);
    expect(stored.structureBreakCandleTimestamp).toEqual(new Date('2026-09-04T14:10:00.000Z'));
    expect(stored.continuationCandleTimestamp).toEqual(new Date('2026-09-04T14:15:00.000Z'));
    expect(stored.setupReadyAt).toEqual(new Date('2026-09-04T14:15:00.000Z'));
    expect(stored.entryPrice).toBeUndefined();
  });

  it('keeps a BA-like breakout without valid FVG away from TRADE_READY', async () => {
    const repository = new OrbFvgMemoryRepository();
    const service = buildStateMachineScanner(repository, [
      candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
      candle('2026-09-04T13:50:00.000Z', 102.5, 103.1, 101.8, 102.8),
      candle('2026-09-04T13:55:00.000Z', 102.8, 103.2, 102.6, 103),
    ]);

    await service.run(logger);

    expect(await repository.find()).toHaveLength(0);
  });

  it('keeps a PLD-like setup below TRADE_READY when price never closes above pre-retrace high', async () => {
    const repository = new OrbFvgMemoryRepository();
    const service = buildStateMachineScanner(repository, [
      candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
      candle('2026-09-04T13:50:00.000Z', 102.5, 104, 102.4, 103.5),
      candle('2026-09-04T13:55:00.000Z', 103.5, 105, 103.3, 104),
      candle('2026-09-04T14:00:00.000Z', 104, 106, 104, 105.5),
      candle('2026-09-04T14:05:00.000Z', 105.5, 105.8, 103.1, 104),
      candle('2026-09-04T14:10:00.000Z', 104, 106.4, 104, 105.9),
      candle('2026-09-04T14:15:00.000Z', 105.9, 106.6, 105, 105.8),
    ]);

    await runScannerSequence(service, ['2026-09-04T14:01:00.000Z', '2026-09-04T14:06:00.000Z', '2026-09-04T14:11:00.000Z', '2026-09-04T14:16:00.000Z', '2026-09-04T14:21:00.000Z']);
    const stored = (await repository.find())[0].signal;

    expect(stored.orbFvgState).toBe('FVG_RETESTED');
    expect(stored.setupReadyAt).toBeUndefined();
  });

  it('allows a GOOGL-like small mathematically valid FVG to reach TRADE_READY', async () => {
    const repository = new OrbFvgMemoryRepository();
    const service = buildStateMachineScanner(repository, [
      candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
      candle('2026-09-04T13:50:00.000Z', 102.5, 103.8, 102.6, 103.2),
      candle('2026-09-04T13:55:00.000Z', 103.2, 104.2, 103.01, 103.7),
      candle('2026-09-04T14:00:00.000Z', 103.7, 104.5, 103.8, 104.3),
      candle('2026-09-04T14:05:00.000Z', 104.3, 104.4, 102.99, 103.6),
      candle('2026-09-04T14:10:00.000Z', 103.6, 105, 103.5, 104.8),
      candle('2026-09-04T14:15:00.000Z', 104.8, 105.5, 104.7, 105.1),
    ]);

    await runScannerSequence(service, ['2026-09-04T14:01:00.000Z', '2026-09-04T14:06:00.000Z', '2026-09-04T14:11:00.000Z', '2026-09-04T14:16:00.000Z', '2026-09-04T14:21:00.000Z']);
    const stored = (await repository.find())[0].signal;

    expect(stored.fvgSizePct).toBeGreaterThan(0);
    expect(stored.orbFvgState).toBe('TRADE_READY');
  });

  it('tracks SO-like multiple retests without resetting pre-retrace high or reaching TRADE_READY', async () => {
    const repository = new OrbFvgMemoryRepository();
    const service = buildStateMachineScanner(repository, [
      candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
      candle('2026-09-04T13:50:00.000Z', 102.5, 104, 102.4, 103.5),
      candle('2026-09-04T13:55:00.000Z', 103.5, 105, 103.3, 104),
      candle('2026-09-04T14:00:00.000Z', 104, 106, 104, 105.5),
      candle('2026-09-04T14:05:00.000Z', 105.5, 105.8, 103.1, 104),
      candle('2026-09-04T14:10:00.000Z', 104, 105.7, 104, 105.2),
      candle('2026-09-04T14:15:00.000Z', 105.2, 105.5, 103.2, 104.1),
      candle('2026-09-04T14:20:00.000Z', 104.1, 105.9, 104, 105.6),
    ]);

    await runScannerSequence(service, ['2026-09-04T14:01:00.000Z', '2026-09-04T14:06:00.000Z', '2026-09-04T14:11:00.000Z', '2026-09-04T14:16:00.000Z', '2026-09-04T14:21:00.000Z', '2026-09-04T14:26:00.000Z']);
    const stored = (await repository.find())[0].signal;

    expect(stored.orbFvgState).toBe('FVG_RETESTED');
    expect(stored.retestCount).toBe(2);
    expect(stored.firstRetestAt).toEqual(new Date('2026-09-04T14:05:00.000Z'));
    expect(stored.latestRetestAt).toEqual(new Date('2026-09-04T14:15:00.000Z'));
    expect(stored.preRetraceHigh).toBe(106);
  });

  it('keeps a BAC-like sequence without complete FVG structure away from TRADE_READY', async () => {
    const repository = new OrbFvgMemoryRepository();
    const service = buildStateMachineScanner(repository, [
      candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
      candle('2026-09-04T13:50:00.000Z', 102.5, 103.5, 102.2, 103.2),
      candle('2026-09-04T13:55:00.000Z', 103.2, 103.8, 102.9, 103.4),
      candle('2026-09-04T14:00:00.000Z', 103.4, 104, 102.8, 103.1),
    ]);

    await runScannerSequence(service, ['2026-09-04T14:01:00.000Z', '2026-09-04T14:06:00.000Z']);

    expect(await repository.find()).toHaveLength(0);
  });


  it('sends exactly one TRADE_READY Telegram alert for TSLA-like setup when the flag is enabled', async () => {
    const repository = new OrbFvgMemoryRepository();
    const sendMessage = jest.fn().mockResolvedValue(true);
    const service = buildStateMachineScanner(repository, [
      candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
      candle('2026-09-04T13:50:00.000Z', 102.5, 104, 102.4, 103.5),
      candle('2026-09-04T13:55:00.000Z', 103.5, 105, 103.3, 104),
      candle('2026-09-04T14:00:00.000Z', 104, 106, 104, 105.5),
      candle('2026-09-04T14:05:00.000Z', 105.5, 105.8, 103.1, 104),
      candle('2026-09-04T14:10:00.000Z', 104, 107, 104, 106.5),
      candle('2026-09-04T14:15:00.000Z', 106.5, 108, 106.4, 107.2),
      candle('2026-09-04T14:20:00.000Z', 107.2, 109, 107, 108),
    ], { alertsEnabled: true, sendMessage });

    await runScannerSequence(service, ['2026-09-04T14:01:00.000Z', '2026-09-04T14:06:00.000Z', '2026-09-04T14:11:00.000Z', '2026-09-04T14:16:00.000Z', '2026-09-04T14:21:00.000Z', '2026-09-04T14:26:00.000Z']);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toContain('ORB-FVG TRADE READY');
    expect(sendMessage.mock.calls[0][0]).toContain('Setup confirmed. Review 1m for discretionary entry.');
    expect((await repository.find())[0].signal.telegramAlertSent).toBe(true);
  });

  it('sends exactly one TRADE_READY Telegram alert for GOOGL-like small FVG when the flag is enabled', async () => {
    const repository = new OrbFvgMemoryRepository();
    const sendMessage = jest.fn().mockResolvedValue(true);
    const service = buildStateMachineScanner(repository, [
      candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
      candle('2026-09-04T13:50:00.000Z', 102.5, 103.8, 102.6, 103.2),
      candle('2026-09-04T13:55:00.000Z', 103.2, 104.2, 103.01, 103.7),
      candle('2026-09-04T14:00:00.000Z', 103.7, 104.5, 103.8, 104.3),
      candle('2026-09-04T14:05:00.000Z', 104.3, 104.4, 102.99, 103.6),
      candle('2026-09-04T14:10:00.000Z', 103.6, 105, 103.5, 104.8),
      candle('2026-09-04T14:15:00.000Z', 104.8, 105.5, 104.7, 105.1),
    ], { alertsEnabled: true, sendMessage });

    await runScannerSequence(service, ['2026-09-04T14:01:00.000Z', '2026-09-04T14:06:00.000Z', '2026-09-04T14:11:00.000Z', '2026-09-04T14:16:00.000Z', '2026-09-04T14:21:00.000Z']);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect((await repository.find())[0].signal.orbFvgState).toBe('TRADE_READY');
  });

  it('does not send Telegram alerts for BA/PLD/SO/BAC-like incomplete setups', async () => {
    const cases = [
      [
        candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
        candle('2026-09-04T13:50:00.000Z', 102.5, 103.1, 101.8, 102.8),
        candle('2026-09-04T13:55:00.000Z', 102.8, 103.2, 102.6, 103),
      ],
      [
        candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
        candle('2026-09-04T13:50:00.000Z', 102.5, 104, 102.4, 103.5),
        candle('2026-09-04T13:55:00.000Z', 103.5, 105, 103.3, 104),
        candle('2026-09-04T14:00:00.000Z', 104, 106, 104, 105.5),
        candle('2026-09-04T14:05:00.000Z', 105.5, 105.8, 103.1, 104),
        candle('2026-09-04T14:10:00.000Z', 104, 106.4, 104, 105.9),
      ],
      [
        candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
        candle('2026-09-04T13:50:00.000Z', 102.5, 104, 102.4, 103.5),
        candle('2026-09-04T13:55:00.000Z', 103.5, 105, 103.3, 104),
        candle('2026-09-04T14:00:00.000Z', 104, 106, 104, 105.5),
        candle('2026-09-04T14:05:00.000Z', 105.5, 105.8, 103.1, 104),
        candle('2026-09-04T14:10:00.000Z', 104, 105.7, 104, 105.2),
        candle('2026-09-04T14:15:00.000Z', 105.2, 105.5, 103.2, 104.1),
      ],
      [
        candle('2026-09-04T13:45:00.000Z', 101, 103, 100.8, 102.5),
        candle('2026-09-04T13:50:00.000Z', 102.5, 103.5, 102.2, 103.2),
        candle('2026-09-04T13:55:00.000Z', 103.2, 103.8, 102.9, 103.4),
      ],
    ];

    for (const setupCandles of cases) {
      const repository = new OrbFvgMemoryRepository();
      const sendMessage = jest.fn().mockResolvedValue(true);
      const service = buildStateMachineScanner(repository, setupCandles, { alertsEnabled: true, sendMessage });
      await runScannerSequence(service, ['2026-09-04T14:01:00.000Z', '2026-09-04T14:06:00.000Z', '2026-09-04T14:11:00.000Z', '2026-09-04T14:16:00.000Z']);
      expect(sendMessage).not.toHaveBeenCalled();
    }
  });

});


const buildStateMachineScanner = (
  repository: OrbFvgMemoryRepository,
  setupCandles: Candle[],
  options: { alertsEnabled?: boolean; sendMessage?: jest.Mock } = {},
): OrbFvgScannerService => new OrbFvgScannerService({
  marketUniverseService: {
    loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [stock] }),
  },
  marketDataService: {
    getHistoricalCandles: jest.fn(async (_ticker: string, timeframe: string) =>
      timeframe === '15m'
        ? [candle('2026-09-04T13:30:00.000Z', 100, 102, 99, 101)]
        : setupCandles,
    ),
  } as never,
  repository,
  engineConfigService: {
    loadSnapshot: jest.fn().mockResolvedValue({
      source: 'postgres',
      values: { orbFvgTradeReadyAlertsEnabled: options.alertsEnabled ?? false },
    }),
  } as never,
  telegramClient: options.sendMessage ? { sendMessage: options.sendMessage } : undefined,
  now: () => currentScannerNow,
});

let currentScannerNow = new Date('2026-09-04T14:01:00.000Z');

const runScannerSequence = async (service: OrbFvgScannerService, timestamps: string[]): Promise<void> => {
  for (const timestamp of timestamps) {
    currentScannerNow = new Date(timestamp);
    await service.run(logger);
  }
};

const buildLongSignal = (): OrbFvgSignalSnapshot => ({
  experimentVersion: ORB_FVG_EXPERIMENT_VERSION_V1,
  ticker: 'NVDA',
  providerSymbol: 'NVDA',
  assetType: 'STOCK',
  sector: 'Technology',
  industry: 'Semiconductors',
  market: 'US',
  exchange: 'NASDAQ',
  sessionDate: '2026-09-04',
  direction: 'LONG',
  openingRangeCandle: {
    timestamp: new Date('2026-09-04T13:30:00.000Z'),
    open: 100,
    high: 102,
    low: 99,
    close: 101,
  },
  openingRangeSizePct: 3.0303,
  breakoutAt: new Date('2026-09-04T13:46:00.000Z'),
  breakoutCandle: {
    timestamp: new Date('2026-09-04T13:46:00.000Z'),
    open: 101.5,
    high: 103,
    low: 99,
    close: 102.5,
  },
  breakoutDistancePct: 0.4902,
  wickBreakout: true,
  closeBreakout: true,
  fvgCandle1: {
    timestamp: new Date('2026-09-04T13:46:00.000Z'),
    open: 101.5,
    high: 103,
    low: 99,
    close: 102.5,
  },
  fvgCandle2: {
    timestamp: new Date('2026-09-04T13:47:00.000Z'),
    open: 102.5,
    high: 104,
    low: 102.2,
    close: 103.5,
  },
  fvgCandle3: {
    timestamp: new Date('2026-09-04T13:48:00.000Z'),
    open: 103.5,
    high: 105,
    low: 103.2,
    close: 100,
  },
  fvgLow: 103,
  fvgHigh: 103.2,
  fvgSizePct: 0.1942,
  candlesAfterBreakout: 2,
  signalAt: new Date('2026-09-04T13:48:00.000Z'),
  entryPrice: 100,
  stopPrice: 99,
  risk: 1,
  riskPct: 1,
  target2RPrice: 102,
  status: 'OPEN',
  highestPriceSeen: 100,
  lowestPriceSeen: 100,
  mfePct: 0,
  maePct: 0,
  maxR: 0,
  telegramAlertSent: true,
});

const buildShortSignal = (): OrbFvgSignalSnapshot => ({
  experimentVersion: ORB_FVG_EXPERIMENT_VERSION_V1,
  ticker: 'NVDA',
  providerSymbol: 'NVDA',
  assetType: 'STOCK',
  sector: 'Technology',
  industry: 'Semiconductors',
  market: 'US',
  exchange: 'NASDAQ',
  sessionDate: '2026-09-04',
  direction: 'SHORT',
  openingRangeCandle: {
    timestamp: new Date('2026-09-04T13:30:00.000Z'),
    open: 100,
    high: 102,
    low: 99,
    close: 101,
  },
  openingRangeSizePct: 3.0303,
  breakoutAt: new Date('2026-09-04T13:46:00.000Z'),
  breakoutCandle: {
    timestamp: new Date('2026-09-04T13:46:00.000Z'),
    open: 99.2,
    high: 100.4,
    low: 98.4,
    close: 98.5,
  },
  breakoutDistancePct: 0.5051,
  wickBreakout: true,
  closeBreakout: true,
  fvgCandle1: {
    timestamp: new Date('2026-09-04T13:46:00.000Z'),
    open: 99.2,
    high: 100.4,
    low: 98.4,
    close: 98.5,
  },
  fvgCandle2: {
    timestamp: new Date('2026-09-04T13:47:00.000Z'),
    open: 98.5,
    high: 98.8,
    low: 97.8,
    close: 98,
  },
  fvgCandle3: {
    timestamp: new Date('2026-09-04T13:48:00.000Z'),
    open: 98,
    high: 98.3,
    low: 97,
    close: 97.5,
  },
  fvgLow: 98.3,
  fvgHigh: 98.4,
  fvgSizePct: 0.1016,
  candlesAfterBreakout: 2,
  signalAt: new Date('2026-09-04T13:48:00.000Z'),
  entryPrice: 100,
  stopPrice: 101,
  risk: 1,
  riskPct: 1,
  target2RPrice: 98,
  status: 'OPEN',
  highestPriceSeen: 100,
  lowestPriceSeen: 100,
  mfePct: 0,
  maePct: 0,
  maxR: 0,
  telegramAlertSent: true,
});
