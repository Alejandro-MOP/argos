import { BacktestEngine, type BacktestRunRequest } from '../src/backtesting/BacktestEngine';
import type { Candle } from '../src/models/Candle';
import type { Opportunity } from '../src/models/Opportunity';
import { RiskService } from '../src/services/RiskService';

const DAY = 86_400_000;
const START = new Date('2026-01-01T00:00:00.000Z');

const buildCandle = (index: number, overrides: Partial<Candle> = {}): Candle => ({
  timestamp: new Date(START.getTime() + index * DAY),
  open: 90,
  high: 91,
  low: 89,
  close: 90,
  volume: 1_000_000,
  ...overrides,
});

const buildSignalCandle = (index: number, overrides: Partial<Candle> = {}): Candle =>
  buildCandle(index, {
    open: 999,
    high: 100.5,
    low: 99.5,
    close: 100,
    ...overrides,
  });

const buildHistoricalCandles = (count = 60): Candle[] =>
  Array.from({ length: count }, (_, index) => buildCandle(index));

const defaultRequest = (overrides: Partial<BacktestRunRequest> = {}): BacktestRunRequest => ({
  tickers: ['SPY'],
  timeframe: '1d',
  from: new Date('2026-01-01T00:00:00.000Z'),
  to: new Date('2026-03-31T00:00:00.000Z'),
  minimumScore: 80,
  stopLossPercent: 1,
  takeProfitMinPercent: 2,
  takeProfitMaxPercent: 3,
  includeTrades: true,
  ...overrides,
});

const buildOpportunityService = () => ({
  analyze: jest.fn((ticker: string, timeframe: string, candles: Candle[]): Opportunity => {
    const lastCandle = candles.at(-1)!;

    return {
      ticker,
      timeframe,
      score: lastCandle.open === 999 ? 85 : 20,
      trendScore: lastCandle.open === 999 ? 25 : 5,
      volumeScore: lastCandle.open === 999 ? 25 : 5,
      momentumScore: lastCandle.open === 999 ? 20 : 5,
      structureScore: lastCandle.open === 999 ? 15 : 5,
      reasons: [],
      detectedAt: new Date('1999-01-01T00:00:00.000Z'),
    };
  }),
});

const buildEngine = (candles: Candle[], expirationDays = 45) => {
  const opportunityService = buildOpportunityService();
  const engine = new BacktestEngine({
    marketDataService: {
      getHistoricalCandles: jest.fn().mockResolvedValue(candles),
    },
    opportunityService,
    riskService: new RiskService(),
    expirationWindows: {
      '1d': expirationDays,
    },
  });

  return { engine, opportunityService };
};

describe('BacktestEngine', () => {
  it('generates a historical signal when score reaches the minimum', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildCandle(61, { high: 102.5, low: 100, close: 101 }),
      buildCandle(62, { high: 103.5, low: 101, close: 102 }),
    ];
    const { engine } = buildEngine(candles);

    const result = await engine.run(defaultRequest());

    expect(result.results[0].trades).toHaveLength(1);
    expect(result.results[0].trades?.[0]).toMatchObject({
      ticker: 'SPY',
      timeframe: '1d',
      score: 85,
      trendScore: 25,
      volumeScore: 25,
      momentumScore: 20,
      structureScore: 15,
      entry: 100,
      stopLoss: { percent: 1, price: 99 },
      takeProfit1: { percent: 2, price: 102 },
      takeProfit2: { percent: 3, price: 103 },
      outcomeTp1: 'WIN',
      outcomeTp2: 'WIN',
    });
    expect(result.results[0].trades?.[0].signalAt).toEqual(candles[60].timestamp);
  });

  it('does not use future candles to create historical signals', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildCandle(61, { open: 777, high: 200, low: 80, close: 150 }),
    ];
    const { engine, opportunityService } = buildEngine(candles);

    await engine.run(defaultRequest());

    const analyzedWindows = opportunityService.analyze.mock.calls.map((call) => call[2] as Candle[]);
    expect(analyzedWindows.at(-1)).toHaveLength(61);
    expect(analyzedWindows.at(-1)?.some((candle) => candle.open === 777)).toBe(false);
  });

  it('marks TP1 as WIN when target is reached before stop', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildCandle(61, { high: 102.1, low: 99.5, close: 101 }),
    ];
    const { engine } = buildEngine(candles);

    const trade = (await engine.run(defaultRequest())).results[0].trades?.[0];

    expect(trade?.outcomeTp1).toBe('WIN');
    expect(trade?.exitAtTp1).toEqual(candles[61].timestamp);
    expect(trade?.candlesUntilTp1).toBe(1);
  });

  it('marks TP2 as WIN independently', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildCandle(61, { high: 102.1, low: 99.5, close: 101 }),
      buildCandle(62, { high: 103.1, low: 100, close: 102 }),
    ];
    const { engine } = buildEngine(candles);

    const trade = (await engine.run(defaultRequest())).results[0].trades?.[0];

    expect(trade?.outcomeTp1).toBe('WIN');
    expect(trade?.outcomeTp2).toBe('WIN');
    expect(trade?.exitAtTp2).toEqual(candles[62].timestamp);
    expect(trade?.candlesUntilTp2).toBe(2);
  });

  it('marks targets as LOSS when stop is reached first', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildCandle(61, { high: 100.5, low: 98.9, close: 99 }),
    ];
    const { engine } = buildEngine(candles);

    const trade = (await engine.run(defaultRequest())).results[0].trades?.[0];

    expect(trade?.outcomeTp1).toBe('LOSS');
    expect(trade?.outcomeTp2).toBe('LOSS');
    expect(trade?.exitAtTp1).toEqual(candles[61].timestamp);
  });

  it('marks targets as EXPIRED when neither stop nor target is reached in the max window', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildCandle(61, { high: 101, low: 99.5, close: 100.5 }),
      buildCandle(62, { high: 101.5, low: 99.2, close: 100.8 }),
      buildCandle(63, { high: 150, low: 50, close: 120 }),
    ];
    const { engine } = buildEngine(candles, 2);

    const trade = (await engine.run(defaultRequest())).results[0].trades?.[0];

    expect(trade?.outcomeTp1).toBe('EXPIRED');
    expect(trade?.outcomeTp2).toBe('EXPIRED');
    expect(trade?.exitAtTp1).toBeUndefined();
    expect(trade?.candlesUntilTp1).toBe(2);
  });

  it('marks a target as AMBIGUOUS when one candle hits stop and target', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildCandle(61, { high: 103.5, low: 98.5, close: 100 }),
    ];
    const { engine } = buildEngine(candles);

    const trade = (await engine.run(defaultRequest())).results[0].trades?.[0];

    expect(trade?.outcomeTp1).toBe('AMBIGUOUS');
    expect(trade?.outcomeTp2).toBe('AMBIGUOUS');
    expect(trade?.exitAtTp1).toEqual(candles[61].timestamp);
  });

  it('can evaluate TP1 as WIN and TP2 as LOSS for the same trade', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildCandle(61, { high: 102.2, low: 99.5, close: 101 }),
      buildCandle(62, { high: 102.5, low: 98.5, close: 99 }),
    ];
    const { engine } = buildEngine(candles);

    const trade = (await engine.run(defaultRequest())).results[0].trades?.[0];

    expect(trade?.outcomeTp1).toBe('WIN');
    expect(trade?.outcomeTp2).toBe('LOSS');
  });

  it('calculates MFE and MAE while the trade is active', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildCandle(61, { high: 101, low: 99.5, close: 100.5 }),
      buildCandle(62, { high: 104, low: 98.8, close: 101 }),
    ];
    const { engine } = buildEngine(candles, 2);

    const trade = (await engine.run(defaultRequest())).results[0].trades?.[0];

    expect(trade?.maxFavorableExcursionPercent).toBe(4);
    expect(trade?.maxAdverseExcursionPercent).toBe(-1.2);
  });

  it('does not open overlapping trades for the same ticker and timeframe', async () => {
    const candles = [
      ...buildHistoricalCandles(),
      buildSignalCandle(60),
      buildSignalCandle(61),
      buildCandle(62, { high: 103.5, low: 100, close: 102 }),
      buildSignalCandle(63),
      buildCandle(64, { high: 103.5, low: 100, close: 102 }),
    ];
    const { engine } = buildEngine(candles);

    const trades = (await engine.run(defaultRequest())).results[0].trades;

    expect(trades).toHaveLength(2);
    expect(trades?.[0].signalAt).toEqual(candles[60].timestamp);
    expect(trades?.[1].signalAt).toEqual(candles[63].timestamp);
  });

  it('builds summary metrics and recent windows', async () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const signalDates = new Set(['2025-01-15', '2025-10-01', '2026-07-10', '2026-07-28']);
    const candles = Array.from({ length: 578 }, (_, index) => {
      const timestamp = new Date(start.getTime() + index * DAY);
      const day = timestamp.toISOString().slice(0, 10);

      if (signalDates.has(day)) {
        return { ...buildSignalCandle(index), timestamp };
      }

      return buildCandle(index, {
        timestamp,
        high: 103.5,
        low: 100,
        close: 101,
      });
    });
    const { engine } = buildEngine(candles);

    const result = await engine.run(
      defaultRequest({
        from: new Date('2025-01-01T00:00:00.000Z'),
        to: new Date('2026-08-01T00:00:00.000Z'),
        includeTrades: false,
      }),
    );

    expect(result.results[0].trades).toBeUndefined();
    expect(result.results[0].fullPeriod).toMatchObject({
      totalSignals: 4,
      tp1: { wins: 4, losses: 0, resolvedTrades: 4, winRate: 100 },
      tp2: { wins: 4, losses: 0, resolvedTrades: 4, winRate: 100 },
      averageScore: 85,
    });
    expect(result.results[0].windows).toMatchObject({
      fullPeriod: { signals: 4, tp1WinRate: 100, tp2WinRate: 100 },
      last12Months: { signals: 3, tp1WinRate: 100, tp2WinRate: 100 },
      last6Months: { signals: 2, tp1WinRate: 100, tp2WinRate: 100 },
      last30Days: { signals: 2, tp1WinRate: 100, tp2WinRate: 100 },
      last7Days: { signals: 1, tp1WinRate: 100, tp2WinRate: 100 },
    });
  });

  it('returns insufficient historical data errors per ticker', async () => {
    const { engine } = buildEngine(buildHistoricalCandles(10));

    const result = await engine.run(defaultRequest({ tickers: ['SPY'] }));

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        ticker: 'SPY',
        timeframe: '1d',
        message: 'insufficient-historical-data',
        candlesReturned: 10,
      }),
    ]);
  });
});
