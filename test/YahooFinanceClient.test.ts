import {
  mapYahooQuoteToCandle,
  parseYahooTimeframe,
  type YahooFinanceChartQuote,
  YahooFinanceClient,
} from '../src/clients/YahooFinanceClient';
import type {
  InsufficientCandlesError,
  MarketDataProviderError,
  MarketDataRateLimitError,
} from '../src/errors/MarketDataErrors';

interface YahooFinanceChartTestResult {
  quotes: YahooFinanceChartQuote[];
}

const buildQuote = (index: number, close = 100 + index): YahooFinanceChartQuote => ({
  date: new Date(1_700_000_000_000 + index * 60_000),
  open: close - 0.5,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1_000_000 + index,
});

const buildChartResponse = (count: number): YahooFinanceChartTestResult => ({
  quotes: Array.from({ length: count }, (_, index) => buildQuote(index, 100 + index)),
});

describe('YahooFinanceClient', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-18T15:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('maps Yahoo chart quotes to Candle objects', () => {
    expect(mapYahooQuoteToCandle(buildQuote(1, 123))).toEqual({
      timestamp: new Date(1_700_000_060_000),
      open: 122.5,
      high: 124,
      low: 122,
      close: 123,
      volume: 1_000_001,
    });
  });

  it('filters Yahoo quotes without valid OHLCV values', () => {
    expect(mapYahooQuoteToCandle({ ...buildQuote(1), close: null })).toBeNull();
    expect(mapYahooQuoteToCandle({ ...buildQuote(1), volume: 0 })).toBeNull();
    expect(mapYahooQuoteToCandle({ ...buildQuote(1), high: 99 })).toBeNull();
    expect(mapYahooQuoteToCandle({ ...buildQuote(1), low: 102 })).toBeNull();
  });

  it('converts supported engine timeframes to Yahoo Finance chart intervals', () => {
    expect(parseYahooTimeframe('1m').interval).toBe('1m');
    expect(parseYahooTimeframe('5m').interval).toBe('5m');
    expect(parseYahooTimeframe('15m').interval).toBe('15m');
    expect(parseYahooTimeframe('30m').interval).toBe('30m');
    expect(parseYahooTimeframe('1h').interval).toBe('1h');
    expect(parseYahooTimeframe('1d').interval).toBe('1d');
    expect(parseYahooTimeframe('1w').interval).toBe('1wk');
    expect(() => parseYahooTimeframe('4h')).toThrow('Yahoo Finance chart does not support 4h');
  });

  it('fetches Yahoo chart data and returns the latest useful candles ascending', async () => {
    const response = buildChartResponse(81);
    response.quotes.reverse();
    const yahooFinance = {
      chart: jest.fn().mockResolvedValue(response),
    };
    const client = new YahooFinanceClient(yahooFinance);

    const candles = await client.getCandles('googl', '15m', 80);

    expect(yahooFinance.chart).toHaveBeenCalledWith(
      'GOOGL',
      expect.objectContaining({
        interval: '15m',
        includePrePost: false,
        return: 'array',
      }),
    );
    expect(candles).toHaveLength(80);
    expect(candles[0].timestamp.getTime()).toBeLessThan(candles.at(-1)!.timestamp.getTime());
    expect(candles[0].close).toBe(101);
    expect(candles.at(-1)?.close).toBe(180);
  });

  it('logs safe Yahoo debug details', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const yahooFinance = {
      chart: jest.fn().mockResolvedValue(buildChartResponse(80)),
    };
    const client = new YahooFinanceClient(yahooFinance, true);

    await client.getCandles('SPY', '1d', 80);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('provider=yahoo'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ticker=SPY'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('endpoint=yahooFinance.chart'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('candlesReturned=80'));
  });

  it('throws insufficient-candles when fewer than 60 useful candles remain', async () => {
    const client = new YahooFinanceClient({
      chart: jest.fn().mockResolvedValue(buildChartResponse(59)),
    });

    await expect(client.getCandles('SPY', '15m', 80)).rejects.toMatchObject({
      message: 'insufficient-candles',
      ticker: 'SPY',
      candlesCount: 59,
    } satisfies Partial<InsufficientCandlesError>);
  });


  it('fetches historical Yahoo candles with requested date range in ascending order', async () => {
    const response = buildChartResponse(80);
    response.quotes.reverse();
    const yahooFinance = {
      chart: jest.fn().mockResolvedValue(response),
    };
    const client = new YahooFinanceClient(yahooFinance);
    const from = new Date('2024-01-01T00:00:00.000Z');
    const to = new Date('2024-06-01T00:00:00.000Z');

    const candles = await client.getHistoricalCandles('nvda', '1d', from, to);

    expect(yahooFinance.chart).toHaveBeenCalledWith('NVDA', {
      period1: from,
      period2: to,
      interval: '1d',
      includePrePost: false,
      return: 'array',
    });
    expect(candles).toHaveLength(80);
    expect(candles[0].timestamp.getTime()).toBeLessThan(candles.at(-1)!.timestamp.getTime());
  });

  it('throws insufficient-historical-data when Yahoo returns too few historical candles', async () => {
    const client = new YahooFinanceClient({
      chart: jest.fn().mockResolvedValue(buildChartResponse(10)),
    });

    await expect(
      client.getHistoricalCandles(
        'SPY',
        '1d',
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-02-01T00:00:00.000Z'),
      ),
    ).rejects.toMatchObject({
      message: 'insufficient-historical-data',
      ticker: 'SPY',
      timeframe: '1d',
      candlesReturned: 10,
    });
  });

  it('allows historical callers to disable provider candle count rejection', async () => {
    const client = new YahooFinanceClient({
      chart: jest.fn().mockResolvedValue(buildChartResponse(10)),
    });

    await expect(
      client.getHistoricalCandles(
        'SPY',
        '1d',
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-02-01T00:00:00.000Z'),
        { minimumCandles: 0 },
      ),
    ).resolves.toHaveLength(10);
  });

  it('throws MarketDataRateLimitError when Yahoo appears rate limited', async () => {
    const error = new Error('Yahoo Finance request failed with 429');
    const client = new YahooFinanceClient({
      chart: jest.fn().mockRejectedValue(error),
    });

    await expect(client.getCandles('SPY', '15m', 80)).rejects.toMatchObject({
      message: 'rate-limit-exceeded',
      provider: 'yahoo',
      status: 429,
      endpoint: 'yahooFinance.chart',
    } satisfies Partial<MarketDataRateLimitError>);
  });

  it('throws sanitized provider errors for Yahoo chart failures', async () => {
    const client = new YahooFinanceClient({
      chart: jest.fn().mockRejectedValue(new Error('No data found')),
    });

    await expect(client.getCandles('SPY', '15m', 80)).rejects.toMatchObject({
      message: 'No data found',
      details: {
        provider: 'yahoo',
        endpoint: 'yahooFinance.chart',
        ticker: 'SPY',
        message: 'No data found',
      },
    } satisfies Partial<MarketDataProviderError>);
  });
});
