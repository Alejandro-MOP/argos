import type { Candle } from '../src/models/Candle';
import { ORB_FVG_EXPERIMENT_VERSION, ORB_FVG_R_LEVELS, type OrbFvgSignalSnapshot } from '../src/models/OrbFvgSignal';
import { OrbFvgForwardMonitorService } from '../src/orbFvg/OrbFvgForwardMonitorService';
import { OrbFvgScannerService } from '../src/orbFvg/OrbFvgScannerService';
import { OrbFvgMemoryRepository } from '../src/repositories/OrbFvgMemoryRepository';

const candle = (timestamp: string, open: number, high: number, low: number, close: number): Candle => ({
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

const etf = { ...stock, symbol: 'VOO', providerSymbol: 'VOO', assetType: 'ETF' as const, sector: 'Broad Market', industry: 'Large Blend ETF' };
const crypto = { ...stock, symbol: 'BTC-USD', providerSymbol: 'BTC-USD', assetType: 'CRYPTO' as const, sessionType: 'TWENTY_FOUR_SEVEN' as const };

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
          candle('2026-09-04T13:46:00.000Z', 101, 103, 100.8, 102.5),
          candle('2026-09-04T13:47:00.000Z', 102.5, 104, 102.2, 103.5),
          candle('2026-09-04T13:48:00.000Z', 103.5, 105, 103.2, 104.5),
        ];
      }),
    };
    const service = new OrbFvgScannerService({
      marketUniverseService: { loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [stock, etf, crypto] }) },
      marketDataService: marketDataService as never,
      repository,
      telegramClient: { sendMessage },
      now: () => new Date('2026-09-04T14:00:00.000Z'),
    });

    const first = await service.run(logger);
    const second = await service.run(logger);
    const stored = await repository.find();

    expect(first.eligible).toBe(2);
    expect(first.persisted).toBe(2);
    expect(second.persisted).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(stored).toHaveLength(2);
    expect(stored[0].signal.experimentVersion).toBe(ORB_FVG_EXPERIMENT_VERSION);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('keeps ORB-FVG v0.1 detection LONG-only and does not persist bearish setups', async () => {
    const repository = new OrbFvgMemoryRepository();
    const sendMessage = jest.fn().mockResolvedValue(true);
    const service = new OrbFvgScannerService({
      marketUniverseService: { loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [stock] }) },
      marketDataService: {
        getHistoricalCandles: jest.fn(async (_ticker: string, timeframe: string) => timeframe === '15m'
          ? [candle('2026-09-04T13:30:00.000Z', 100, 102, 99, 101)]
          : [
              candle('2026-09-04T13:46:00.000Z', 99.2, 99.4, 98.4, 98.5),
              candle('2026-09-04T13:47:00.000Z', 98.5, 98.8, 97.8, 98),
              candle('2026-09-04T13:48:00.000Z', 98, 98.3, 97, 97.5),
            ]),
      } as never,
      repository,
      telegramClient: { sendMessage },
      now: () => new Date('2026-09-04T14:00:00.000Z'),
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

  it('monitors open signals, resolves a LONG win and triggers R levels once', async () => {
    const repository = new OrbFvgMemoryRepository();
    const scanner = new OrbFvgScannerService({
      marketUniverseService: { loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [stock] }) },
      marketDataService: {
        getHistoricalCandles: jest.fn(async (_ticker: string, timeframe: string) => timeframe === '15m'
          ? [candle('2026-09-04T13:30:00.000Z', 100, 102, 99, 101)]
          : [
              candle('2026-09-04T13:46:00.000Z', 101, 103, 100.8, 102.5),
              candle('2026-09-04T13:47:00.000Z', 102.5, 104, 102.2, 103.5),
              candle('2026-09-04T13:48:00.000Z', 103.5, 105, 103.2, 104.5),
            ]),
      } as never,
      repository,
      now: () => new Date('2026-09-04T14:00:00.000Z'),
    });
    await scanner.run(logger);
    const signal = (await repository.find())[0].signal;
    const monitor = new OrbFvgForwardMonitorService({
      repository,
      marketDataService: {
        getHistoricalCandles: jest.fn().mockResolvedValue([
          candle('2026-09-04T13:49:00.000Z', signal.entryPrice, signal.target2RPrice + 0.5, signal.entryPrice, signal.target2RPrice),
        ]),
      } as never,
      now: () => new Date('2026-09-04T14:10:00.000Z'),
    });

    const first = await monitor.run(logger);
    const second = await monitor.run(logger);
    const stored = await repository.find();

    expect(first.resolved).toBe(1);
    expect(first.wins).toBe(1);
    expect(first.levelsTriggered).toBeGreaterThan(0);
    expect(second.openSignals).toBe(0);
    expect(stored[0].signal.status).toBe('WIN');
    expect(stored[0].levels.filter((level) => level.triggeredAt)).toHaveLength(4);
  });

  it('keeps existing SHORT signals queryable and lets the monitor finish their forward evaluation', async () => {
    const repository = new OrbFvgMemoryRepository();
    const shortSignal = buildShortSignal();
    const levels = ORB_FVG_R_LEVELS.map((rMultiple) => ({
      orbFvgSignalId: '',
      rMultiple,
      levelPrice: shortSignal.entryPrice - shortSignal.risk * rMultiple,
    }));
    const saved = await repository.saveIfNotDuplicate(shortSignal, levels);
    const shortSignals = await repository.find({ direction: 'SHORT' });
    const sendMessage = jest.fn().mockResolvedValue(true);
    const monitor = new OrbFvgForwardMonitorService({
      repository,
      marketDataService: {
        getHistoricalCandles: jest.fn().mockResolvedValue([
          candle('2026-09-04T13:52:00.000Z', 100, 100.2, 97.8, 98),
        ]),
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
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

const buildShortSignal = (): OrbFvgSignalSnapshot => ({
  experimentVersion: ORB_FVG_EXPERIMENT_VERSION,
  ticker: 'NVDA',
  providerSymbol: 'NVDA',
  assetType: 'STOCK',
  sector: 'Technology',
  industry: 'Semiconductors',
  market: 'US',
  exchange: 'NASDAQ',
  sessionDate: '2026-09-04',
  direction: 'SHORT',
  openingRangeCandle: { timestamp: new Date('2026-09-04T13:30:00.000Z'), open: 100, high: 102, low: 99, close: 101 },
  openingRangeSizePct: 3.0303,
  breakoutAt: new Date('2026-09-04T13:46:00.000Z'),
  breakoutCandle: { timestamp: new Date('2026-09-04T13:46:00.000Z'), open: 99.2, high: 100.4, low: 98.4, close: 98.5 },
  breakoutDistancePct: 0.5051,
  wickBreakout: true,
  closeBreakout: true,
  fvgCandle1: { timestamp: new Date('2026-09-04T13:46:00.000Z'), open: 99.2, high: 100.4, low: 98.4, close: 98.5 },
  fvgCandle2: { timestamp: new Date('2026-09-04T13:47:00.000Z'), open: 98.5, high: 98.8, low: 97.8, close: 98 },
  fvgCandle3: { timestamp: new Date('2026-09-04T13:48:00.000Z'), open: 98, high: 98.3, low: 97, close: 97.5 },
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
