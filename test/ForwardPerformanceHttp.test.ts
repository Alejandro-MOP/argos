const getPerformance = jest.fn().mockResolvedValue({
  filters: {},
  sampleSize: 0,
  smallSample: true,
  tp1: { wins: 0, losses: 0, expired: 0, ambiguous: 0, winRate: null },
  tp2: { wins: 0, losses: 0, expired: 0, ambiguous: 0, winRate: null },
  experimentalTargets: [],
  mfe: { average: null, median: null },
  mae: { average: null, median: null },
  expiredRate: null,
  ambiguousRate: null,
  scoreBuckets: [],
  byTimeframe: [],
  byTicker: [],
  byAssetType: [],
  bySector: [],
  byIndustry: [],
  byStrategyVersion: [],
});

jest.mock('../src/config/container', () => ({
  forwardPerformanceReportProvider: { getPerformance },
}));

const buildRequest = (queryValues: Record<string, string>) => ({
  method: 'GET',
  query: {
    get: jest.fn((key: string) => queryValues[key] ?? null),
  },
});

describe('forwardPerformance endpoint', () => {
  beforeEach(() => {
    getPerformance.mockClear();
  });

  it('passes supported filters to the forward performance provider', async () => {
    const { forwardPerformance } = await import('../src/functions/forwardPerformance');

    const response = await forwardPerformance(
      buildRequest({
        ticker: 'nvda',
        timeframe: '15m',
        minimumScore: '90',
        maximumScore: '100',
        scoreBucket: '95-100',
        assetType: 'stock',
        sector: 'Technology',
        industry: 'Semiconductors',
        strategyVersion: 'v1',
        from: '2026-01-01',
        to: '2026-01-31',
      }) as never,
      { log: jest.fn(), error: jest.fn() } as never,
    );

    expect(getPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'NVDA',
        timeframe: '15m',
        minimumScore: 90,
        maximumScore: 100,
        scoreBucket: '95-100',
        assetType: 'STOCK',
        sector: 'Technology',
        industry: 'Semiconductors',
        strategyVersion: 'v1',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual(expect.objectContaining({ ok: true, sampleSize: 0 }));
  });
});

export {};
