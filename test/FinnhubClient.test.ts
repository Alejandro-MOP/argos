import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import {
  FinnhubClient,
  mapFinnhubResponseToCandles,
  parseFinnhubTimeframe,
} from '../src/clients/FinnhubClient';
import type {
  InsufficientCandlesError,
  MarketDataProviderError,
  MarketDataRateLimitError,
} from '../src/clients/PolygonClient';

const buildHttpClient = (response: unknown): AxiosInstance => {
  return {
    get: jest.fn().mockResolvedValue({ data: response }),
  } as unknown as AxiosInstance;
};

interface FinnhubTestResponse {
  closePrices: number[];
  highPrices: number[];
  lowPrices: number[];
  openPrices: number[];
  status: string;
  timestamps: number[];
  volumes: number[];
}

const buildFinnhubResponse = (count: number): FinnhubTestResponse => {
  const timestamps = Array.from({ length: count }, (_, index) => 1_700_000_000 + index * 60);

  return {
    status: 'ok',
    timestamps,
    openPrices: timestamps.map((_, index) => 100 + index),
    highPrices: timestamps.map((_, index) => 102 + index),
    lowPrices: timestamps.map((_, index) => 99 + index),
    closePrices: timestamps.map((_, index) => 101 + index),
    volumes: timestamps.map((_, index) => 1_000_000 + index),
  };
};

const buildFinnhubApiResponse = (response: FinnhubTestResponse): Record<string, unknown> => ({
  c: response.closePrices,
  h: response.highPrices,
  l: response.lowPrices,
  o: response.openPrices,
  s: response.status,
  t: response.timestamps,
  v: response.volumes,
});

describe('FinnhubClient', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-18T15:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('maps Finnhub candle arrays to Candle objects in chronological order', () => {
    const candles = mapFinnhubResponseToCandles({
      status: 'ok',
      timestamps: [1_700_000_120, 1_700_000_000, 1_700_000_060],
      openPrices: [102, 100, 101],
      highPrices: [104, 102, 103],
      lowPrices: [101, 99, 100],
      closePrices: [103, 101, 102],
      volumes: [1_000_002, 1_000_000, 1_000_001],
    });

    expect(candles).toEqual([
      {
        timestamp: new Date(1_700_000_000_000),
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 1_000_000,
      },
      {
        timestamp: new Date(1_700_000_060_000),
        open: 101,
        high: 103,
        low: 100,
        close: 102,
        volume: 1_000_001,
      },
      {
        timestamp: new Date(1_700_000_120_000),
        open: 102,
        high: 104,
        low: 101,
        close: 103,
        volume: 1_000_002,
      },
    ]);
  });

  it('converts supported engine timeframes to Finnhub resolutions', () => {
    expect(parseFinnhubTimeframe('1m').resolution).toBe('1');
    expect(parseFinnhubTimeframe('5m').resolution).toBe('5');
    expect(parseFinnhubTimeframe('15m').resolution).toBe('15');
    expect(parseFinnhubTimeframe('30m').resolution).toBe('30');
    expect(parseFinnhubTimeframe('1h').resolution).toBe('60');
    expect(parseFinnhubTimeframe('1d').resolution).toBe('D');
    expect(parseFinnhubTimeframe('1w').resolution).toBe('W');
    expect(() => parseFinnhubTimeframe('4h')).toThrow('Finnhub does not support 4h directly');
  });

  it('fetches Finnhub candles and returns the latest useful candles ascending', async () => {
    const response = buildFinnhubResponse(81);
    response.timestamps.reverse();
    response.openPrices.reverse();
    response.highPrices.reverse();
    response.lowPrices.reverse();
    response.closePrices.reverse();
    response.volumes.reverse();
    const httpClient = buildHttpClient(buildFinnhubApiResponse(response));
    const client = new FinnhubClient('test-api-key', httpClient);

    const candles = await client.getCandles('googl', '15m', 80);

    expect(httpClient.get).toHaveBeenCalledWith(
      '/api/v1/stock/candle',
      expect.objectContaining({
        params: expect.objectContaining({
          symbol: 'GOOGL',
          resolution: '15',
          token: 'test-api-key',
        }),
      }),
    );
    expect(candles).toHaveLength(80);
    expect(candles[0].timestamp.getTime()).toBeLessThan(candles.at(-1)!.timestamp.getTime());
    expect(candles[0].close).toBe(102);
    expect(candles.at(-1)?.close).toBe(181);
  });

  it('logs safe Finnhub debug details without the API key', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const httpClient = buildHttpClient(buildFinnhubApiResponse(buildFinnhubResponse(80)));
    const client = new FinnhubClient('secret-api-key', httpClient, true);

    await client.getCandles('SPY', '1d', 80);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('provider=finnhub'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ticker=SPY'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('endpoint=/api/v1/stock/candle'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('candlesReturned=80'));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('secret-api-key'));
  });

  it('throws insufficient-candles when Finnhub returns no_data', async () => {
    const client = new FinnhubClient('test-api-key', buildHttpClient({ s: 'no_data' }));

    await expect(client.getCandles('SPY', '15m', 80)).rejects.toMatchObject({
      message: 'insufficient-candles',
      ticker: 'SPY',
      candlesCount: 0,
    } satisfies Partial<InsufficientCandlesError>);
  });

  it('requires a Finnhub API key', async () => {
    const client = new FinnhubClient('', buildHttpClient({ s: 'ok' }));

    await expect(client.getCandles('SPY', '15m', 80)).rejects.toThrow(
      'FINNHUB_API_KEY is required to fetch real market data',
    );
  });

  it('throws MarketDataRateLimitError when Finnhub returns 429', async () => {
    const error = new AxiosError('Too many requests');
    Object.defineProperty(error, 'response', {
      value: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          'x-request-id': 'finnhub-request-123',
        },
      },
    });
    Object.defineProperty(error, 'config', {
      value: {
        url: '/api/v1/stock/candle?symbol=SPY&token=secret',
      },
    });
    const httpClient = {
      get: jest.fn().mockRejectedValue(error),
    } as unknown as AxiosInstance;
    const client = new FinnhubClient('secret', httpClient);

    await expect(client.getCandles('SPY', '15m', 80)).rejects.toMatchObject({
      message: 'rate-limit-exceeded',
      provider: 'finnhub',
      status: 429,
      statusText: 'Too Many Requests',
      endpoint: '/api/v1/stock/candle',
      requestId: 'finnhub-request-123',
    } satisfies Partial<MarketDataRateLimitError>);
  });

  it('throws clear sanitized provider errors for unauthorized, not found, and timeout failures', async () => {
    const unauthorized = new AxiosError('Request failed with token=secret');
    Object.defineProperty(unauthorized, 'response', {
      value: { status: 401, statusText: 'Unauthorized', headers: {} },
    });
    const notFound = new AxiosError('Not found');
    Object.defineProperty(notFound, 'response', {
      value: { status: 404, statusText: 'Not Found', headers: {} },
    });
    const timeout = new AxiosError('timeout of 10000ms exceeded');
    const httpClient = {
      get: jest
        .fn()
        .mockRejectedValueOnce(unauthorized)
        .mockRejectedValueOnce(notFound)
        .mockRejectedValueOnce(timeout),
    } as unknown as AxiosInstance;
    const client = new FinnhubClient('secret', httpClient);

    await expect(client.getCandles('SPY', '15m', 80)).rejects.toMatchObject({
      message: 'finnhub-unauthorized: Request failed with token=[redacted]',
    } satisfies Partial<MarketDataProviderError>);
    await expect(client.getCandles('SPY', '15m', 80)).rejects.toMatchObject({
      message: 'finnhub-not-found: Not found',
    } satisfies Partial<MarketDataProviderError>);
    await expect(client.getCandles('SPY', '15m', 80)).rejects.toMatchObject({
      message: 'finnhub-timeout: timeout of 10000ms exceeded',
    } satisfies Partial<MarketDataProviderError>);
  });
});
