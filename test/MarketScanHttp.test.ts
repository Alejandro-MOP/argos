
const runtimeConfig = {
  strategyVersion: 'v1',
  marketScanCandleLimit: 80,
  marketDataMaxAgeMinutes: 20,
  marketDataRequestDelayMs: 0,
  marketDataMaxConcurrency: 5,
  marketDataBatchDelayMs: 250,
  marketDataMaxRetries: 3,
  marketDataRetryBaseDelayMs: 30000,
  marketDataSequential: false,
  orbFvgTradeReadyAlertsEnabled: false,
  tradePlan: { stopLossPercent: 1, targetMinPercent: 2, targetMaxPercent: 5 },
  signalIntelligence: {
    backtestContextEnabled: true,
    backtestContextMonths: 24,
    performanceMinSampleSize: 20,
    forwardTestContextEnabled: true,
  },
  telegramNotificationTimeframes: ['5m', '15m'],
  scoring: {
    maxAnalyzerScore: 25,
    opportunityMinScore: 90,
    telegramNotificationMinScore: 100,
    evidenceMinScore: 80,
    duplicateWindowMinutes: 60,
    emaFastPeriod: 20,
    emaSlowPeriod: 50,
    volumeLookbackPeriod: 20,
    volumeStrongRatio: 1.5,
    volumeModerateRatio: 1.3,
    volumeWeakRatio: 1.1,
    rsiPeriod: 14,
    rsiIdealMin: 55,
    rsiIdealMax: 70,
    rsiNeutralMin: 45,
    rsiNeutralMax: 55,
    rsiExtendedMax: 80,
    structureLookbackPeriod: 20,
  },
};

const defaultMetrics = {
  totalCombinations: 0,
  marketClosed: 0,
  marketDataRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  rateLimitedRequests: 0,
  retryAttempts: 0,
  durationMs: 0,
};

const run = jest.fn().mockResolvedValue({
  scannedTickers: ['NVDA'],
  scanned: [],
  opportunities: [],
  opportunitySignals: [],
  notifiedSignals: [],
  skipped: [],
  errors: [],
  metrics: defaultMetrics,
  runtimeConfig,
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
      metrics: defaultMetrics,
      runtimeConfig,
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

  it('includes market scan throughput metrics in the manual response', async () => {
    const { marketScanHttp } = await import('../src/functions/marketScanHttp');
    const context = { log: jest.fn(), error: jest.fn() };

    run.mockResolvedValue({
      scannedTickers: ['NVDA'],
      scanned: [{ ticker: 'NVDA', timeframe: '15m' }],
      opportunities: [],
      opportunitySignals: [],
      notifiedSignals: [],
      skipped: [],
      errors: [],
      metrics: {
        totalCombinations: 1,
        marketClosed: 0,
        marketDataRequests: 1,
        successfulRequests: 1,
        failedRequests: 0,
        rateLimitedRequests: 0,
        retryAttempts: 0,
        durationMs: 123,
      },
      runtimeConfig,
    });

    const response = await marketScanHttp(buildRequest({ tickers: ['NVDA'] }) as never, context as never);

    expect(response.jsonBody).toEqual(
      expect.objectContaining({
        metrics: expect.objectContaining({
          totalCombinations: 1,
          marketDataRequests: 1,
          successfulRequests: 1,
          durationMs: 123,
        }),
      }),
    );
  });
});

export {};
