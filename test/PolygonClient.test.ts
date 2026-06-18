import type { AxiosInstance } from 'axios';
import type { InsufficientCandlesError } from '../src/clients/PolygonClient';
import { mapPolygonAggregateToCandle, PolygonClient } from '../src/clients/PolygonClient';

const buildHttpClient = (response: unknown): AxiosInstance => {
  return {
    get: jest.fn().mockResolvedValue({ data: response }),
  } as unknown as AxiosInstance;
};

const buildAggregate = (index: number, close = 100 + index): Record<string, number> => ({
  t: 1_700_000_000_000 + index * 60_000,
  o: close - 0.5,
  h: close + 1,
  l: close - 1,
  c: close,
  v: 1_000_000 + index,
});

describe('PolygonClient', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-18T15:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('maps Polygon aggregate tags to descriptive candle fields', () => {
    expect(mapPolygonAggregateToCandle(buildAggregate(1, 123))).toEqual({
      timestamp: new Date(1_700_000_060_000),
      open: 122.5,
      high: 124,
      low: 122,
      close: 123,
      volume: 1_000_001,
    });
  });

  it('filters aggregates without volume or valid OHLC values', () => {
    expect(mapPolygonAggregateToCandle({ ...buildAggregate(1), v: 0 })).toBeNull();
    expect(mapPolygonAggregateToCandle({ ...buildAggregate(1), h: 99 })).toBeNull();
    expect(mapPolygonAggregateToCandle({ ...buildAggregate(1), l: 102 })).toBeNull();
  });

  it('fetches Polygon aggregates with a high API limit and returns the latest useful candles ascending', async () => {
    const oldAmdLikePrice = buildAggregate(0, 497);
    const validAggregates = Array.from({ length: 81 }, (_, index) =>
      buildAggregate(index + 1, 100 + index),
    );
    const httpClient = buildHttpClient({
      results: [oldAmdLikePrice, { ...buildAggregate(999), v: 0 }, ...validAggregates.reverse()],
    });
    const client = new PolygonClient('test-api-key', httpClient);

    const candles = await client.getCandles('amd', '15m', 80);

    expect(httpClient.get).toHaveBeenCalledWith(
      '/v2/aggs/ticker/AMD/range/15/minute/2026-06-08/2026-06-18',
      expect.objectContaining({
        params: expect.objectContaining({
          adjusted: true,
          apiKey: 'test-api-key',
          limit: 5_000,
          sort: 'asc',
        }),
      }),
    );
    expect(candles).toHaveLength(80);
    expect(candles[0].timestamp.getTime()).toBeLessThan(candles.at(-1)!.timestamp.getTime());
    expect(candles[0].close).toBe(101);
    expect(candles.at(-1)?.close).toBe(180);
    expect(candles.some((candle) => candle.close === 497)).toBe(false);
  });

  it('uses minimum intraday calendar windows by timeframe', async () => {
    const httpClient = buildHttpClient({
      results: Array.from({ length: 80 }, (_, index) => buildAggregate(index)),
    });
    const client = new PolygonClient('test-api-key', httpClient);

    await client.getCandles('SPY', '1m', 80);
    await client.getCandles('SPY', '5m', 80);
    await client.getCandles('SPY', '30m', 80);
    await client.getCandles('SPY', '1h', 80);
    await client.getCandles('SPY', '4h', 80);

    expect(httpClient.get).toHaveBeenNthCalledWith(
      1,
      '/v2/aggs/ticker/SPY/range/1/minute/2026-06-13/2026-06-18',
      expect.any(Object),
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(
      2,
      '/v2/aggs/ticker/SPY/range/5/minute/2026-06-11/2026-06-18',
      expect.any(Object),
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(
      3,
      '/v2/aggs/ticker/SPY/range/30/minute/2026-05-29/2026-06-18',
      expect.any(Object),
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(
      4,
      '/v2/aggs/ticker/SPY/range/1/hour/2026-05-22/2026-06-18',
      expect.any(Object),
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(
      5,
      '/v2/aggs/ticker/SPY/range/4/hour/2026-03-03/2026-06-18',
      expect.any(Object),
    );
  });

  it('logs safe debug details without the API key', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const httpClient = buildHttpClient({
      results: Array.from({ length: 80 }, (_, index) => buildAggregate(index)),
    });
    const client = new PolygonClient('secret-api-key', httpClient, true);

    await client.getCandles('SPY', '15m', 80);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('endpoint=/v2/aggs/ticker/SPY'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('rawResultsCount=80'));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('secret-api-key'));
  });

  it('throws insufficient-candles with request metadata when fewer than 60 useful candles remain', async () => {
    const client = new PolygonClient(
      'test-api-key',
      buildHttpClient({
        results: Array.from({ length: 59 }, (_, index) => buildAggregate(index)),
      }),
    );

    await expect(client.getCandles('SPY', '15m', 80)).rejects.toMatchObject({
      message: 'insufficient-candles',
      ticker: 'SPY',
      candlesCount: 59,
      requestedFrom: '2026-06-08',
      requestedTo: '2026-06-18',
    } satisfies Partial<InsufficientCandlesError>);
  });

  it('requires an API key instead of falling back to mocked candles', async () => {
    const client = new PolygonClient('', buildHttpClient({ results: [] }));

    await expect(client.getCandles('SPY', '15m', 80)).rejects.toThrow(
      'POLYGON_API_KEY is required to fetch real market data',
    );
  });
});
