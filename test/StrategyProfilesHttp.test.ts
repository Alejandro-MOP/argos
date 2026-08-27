const getProfiles = jest.fn().mockResolvedValue({
  filters: {},
  semantics: {
    tradeOutcome: 'winRate = wins / (wins + losses).',
    marketReachability: 'reachRate = (wins + ambiguous) / resolved outcomes.',
    dataMaturity: 'MATURE is not validation.',
    maePercentiles: 'MAE keeps negative sign.',
  },
  profiles: [],
});

jest.mock('../src/config/container', () => ({
  strategyProfileProvider: { getProfiles },
}));

const buildRequest = (queryValues: Record<string, string>, method = 'GET') => ({
  method,
  query: {
    get: jest.fn((key: string) => queryValues[key] ?? null),
  },
});

describe('strategyProfiles endpoint', () => {
  beforeEach(() => {
    getProfiles.mockClear();
  });

  it('passes supported filters to the strategy profile provider', async () => {
    const { strategyProfiles } = await import('../src/functions/strategyProfiles');

    const response = await strategyProfiles(
      buildRequest({
        assetType: 'crypto',
        timeframe: '1m',
        scoreBucket: '95-100',
        strategyVersion: 'v1',
        minimumSampleSize: '30',
      }) as never,
      { log: jest.fn(), error: jest.fn() } as never,
    );

    expect(getProfiles).toHaveBeenCalledWith({
      assetType: 'CRYPTO',
      timeframe: '1m',
      scoreBucket: '95-100',
      strategyVersion: 'v1',
      minimumSampleSize: 30,
    });
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual(expect.objectContaining({ ok: true, profiles: [] }));
  });

  it('rejects non-GET requests', async () => {
    const { strategyProfiles } = await import('../src/functions/strategyProfiles');

    const response = await strategyProfiles(
      buildRequest({}, 'POST') as never,
      { log: jest.fn(), error: jest.fn() } as never,
    );

    expect(response.status).toBe(405);
    expect(getProfiles).not.toHaveBeenCalled();
  });
});

export {};
