const analyze = jest.fn().mockResolvedValue({
  strategyVersion: 'v1',
  timeframe: '15m',
  semantics: {
    researchOnly: 'read-only',
    evidenceEligibility: 'eligible evidence only',
    winRate: 'winRate = wins / (wins + losses).',
    reachRate: 'reachRate = (wins + ambiguous) / resolved outcomes.',
    unresolved: 'unresolved excluded',
    comparison: 'descriptive deltas',
  },
  segments: [],
});

jest.mock('../src/config/container', () => ({
  scorePerformanceResearchService: { analyze },
}));

const buildRequest = (queryValues: Record<string, string>, method = 'GET') => ({
  method,
  query: {
    get: jest.fn((key: string) => queryValues[key] ?? null),
  },
});

describe('scorePerformance endpoint', () => {
  beforeEach(() => {
    analyze.mockClear();
  });

  it('passes supported filters to ScorePerformanceResearchService', async () => {
    const { scorePerformance } = await import('../src/functions/scorePerformance');

    const response = await scorePerformance(
      buildRequest({
        strategyVersion: 'v1',
        timeframe: '15m',
        assetType: 'stock',
        scoreMin: '90',
        scoreMax: '94',
        exactScore: '100',
      }) as never,
      { log: jest.fn(), error: jest.fn() } as never,
    );

    expect(analyze).toHaveBeenCalledWith({
      strategyVersion: 'v1',
      timeframe: '15m',
      assetType: 'STOCK',
      scoreMin: 90,
      scoreMax: 94,
      exactScore: 100,
    });
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual(expect.objectContaining({ ok: true, segments: [] }));
  });

  it('defaults to v1 and 15m', async () => {
    const { scorePerformance } = await import('../src/functions/scorePerformance');

    await scorePerformance(
      buildRequest({}) as never,
      { log: jest.fn(), error: jest.fn() } as never,
    );

    expect(analyze).toHaveBeenCalledWith({
      strategyVersion: 'v1',
      timeframe: '15m',
      assetType: undefined,
      scoreMin: undefined,
      scoreMax: undefined,
      exactScore: undefined,
    });
  });

  it('rejects non-GET requests', async () => {
    const { scorePerformance } = await import('../src/functions/scorePerformance');

    const response = await scorePerformance(
      buildRequest({}, 'POST') as never,
      { log: jest.fn(), error: jest.fn() } as never,
    );

    expect(response.status).toBe(405);
    expect(analyze).not.toHaveBeenCalled();
  });
});

export {};
