const run = jest.fn().mockResolvedValue({
  scannedTickers: ['NVDA'],
  scanned: [],
  opportunities: [],
  opportunitySignals: [],
  notifiedSignals: [],
  skipped: [],
  errors: [],
});

jest.mock('../src/config/container', () => ({
  marketScanExecutor: { run },
}));

jest.mock('../src/config/env', () => ({
  env: {
    marketScanTimeframe: '15m',
    marketScanTimeframes: ['1m', '5m'],
    marketScanCandleLimit: 80,
    tradePlan: { stopLossPercent: 1, targetMinPercent: 2, targetMaxPercent: 3 },
    scoring: { opportunityMinScore: 50, telegramNotificationMinScore: 80 },
  },
}));

const buildRequest = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { get: jest.fn().mockReturnValue('application/json') },
  query: { get: jest.fn().mockReturnValue(null) },
  json: jest.fn().mockResolvedValue(body),
});

describe('marketScanHttp', () => {
  beforeEach(() => {
    run.mockClear();
    run.mockResolvedValue({
      scannedTickers: ['NVDA'],
      scanned: [],
      opportunities: [],
      opportunitySignals: [],
      notifiedSignals: [],
      skipped: [],
      errors: [],
    });
  });

  it('keeps accepting a single explicit timeframe', async () => {
    const { marketScanHttp } = await import('../src/functions/marketScanHttp');
    const context = { log: jest.fn(), error: jest.fn() };

    await marketScanHttp(buildRequest({ tickers: ['NVDA'], timeframe: '15m' }) as never, context as never);

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ timeframe: '15m', timeframes: ['15m'] }),
      context,
    );
  });

  it('uses timeframes over timeframe when both are provided', async () => {
    const { marketScanHttp } = await import('../src/functions/marketScanHttp');
    const context = { log: jest.fn(), error: jest.fn() };

    const response = await marketScanHttp(
      buildRequest({ tickers: ['NVDA'], timeframe: '15m', timeframes: ['1m', '5m'] }) as never,
      context as never,
    );

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ timeframe: '1m', timeframes: ['1m', '5m'] }),
      context,
    );
    expect(response.jsonBody).toEqual(expect.objectContaining({ timeframes: ['1m', '5m'] }));
  });
});

export {};
