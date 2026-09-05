import { ScorePerformanceResearchService } from '../src/research/ScorePerformanceResearchService';

describe('ScorePerformanceResearchService', () => {
  it('builds read-only score performance segments by STOCK, ETF and CRYPTO', async () => {
    const rows = [
      row({ id: 'stock-90-a', asset_type: 'STOCK', score: 90, status: 'CLOSED', mfe: 1, mae: -1, target: 0.5, outcome: 'WIN' }),
      row({ id: 'stock-90-b', asset_type: 'STOCK', score: 94, status: 'OPEN', mfe: 3, mae: -3, target: 0.5, outcome: null }),
      row({ id: 'stock-95-a', asset_type: 'STOCK', score: 95, status: 'CLOSED', mfe: 2, mae: -2, target: 0.5, outcome: 'LOSS' }),
      row({ id: 'stock-99-a', asset_type: 'STOCK', score: 99, status: 'EXPIRED', mfe: 4, mae: -4, target: 0.5, outcome: 'AMBIGUOUS' }),
      row({ id: 'stock-100-a', asset_type: 'STOCK', score: 100, status: 'CLOSED', mfe: 5, mae: -5, target: 0.5, outcome: 'WIN' }),
      row({ id: 'stock-100-b', asset_type: 'STOCK', score: 100, status: 'PARTIALLY_RESOLVED', mfe: 7, mae: -7, target: 0.5, outcome: 'AMBIGUOUS' }),
      row({ id: 'etf-100-a', asset_type: 'ETF', score: 100, status: 'AMBIGUOUS', mfe: 1.5, mae: -0.5, target: 1, outcome: 'AMBIGUOUS' }),
      row({ id: 'crypto-95-a', asset_type: 'CRYPTO', score: 95, status: null, mfe: null, mae: null, target: 2, outcome: null }),
    ];
    const database = { query: jest.fn().mockResolvedValue({ rows }) };
    const service = new ScorePerformanceResearchService(database);

    const result = await service.analyze({ strategyVersion: 'v1', timeframe: '15m' });

    expect(database.query).toHaveBeenCalledTimes(1);
    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('signal.excluded_from_research = false');
    expect(sql.trim().toUpperCase().startsWith('WITH')).toBe(true);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b/i);
    expect(values).toEqual(['v1', '15m']);
    expect(result.strategyVersion).toBe('v1');
    expect(result.timeframe).toBe('15m');
    expect(result.segments.map((segment) => segment.assetType)).toEqual(['STOCK', 'ETF', 'CRYPTO']);

    const stock = result.segments.find((segment) => segment.assetType === 'STOCK');
    expect(stock?.groups['90-94'].evidence).toEqual({
      sampleSize: 2,
      evaluatedCount: 2,
      withoutEvaluationCount: 0,
      evaluationCoveragePct: 100,
    });
    expect(stock?.groups['90-94'].mfe).toEqual({ sampleSize: 2, averagePct: 2, medianPct: 2 });
    expect(stock?.groups['90-94'].mae).toEqual({ sampleSize: 2, averagePct: -2, medianPct: -2 });
    expect(stock?.groups['100'].exactScore).toBe(100);
    expect(stock?.groups['100'].evidence.sampleSize).toBe(2);
    expect(stock?.groups['100'].status).toEqual({
      open: 0,
      partiallyResolved: 1,
      closed: 1,
      expired: 0,
      ambiguous: 0,
    });
    expect(stock?.groups['100'].mfe).toEqual({ sampleSize: 2, averagePct: 6, medianPct: 6 });
    expect(stock?.groups['100'].mae).toEqual({ sampleSize: 2, averagePct: -6, medianPct: -6 });

    const target05 = stock?.groups['100'].targetLadder.find((target) => target.targetPercent === 0.5);
    expect(target05).toEqual(
      expect.objectContaining({
        wins: 1,
        losses: 0,
        expired: 0,
        ambiguous: 1,
        unresolved: 0,
        resolvedSampleSize: 2,
        winRate: 100,
        reachRate: 100,
      }),
    );
    expect(stock?.comparison).toEqual(
      expect.objectContaining({
        mfeAvgDelta_100_vs_95_99: 3,
        mfeMedianDelta_100_vs_95_99: 3,
        maeAvgDelta_100_vs_95_99: -3,
        maeMedianDelta_100_vs_95_99: -3,
      }),
    );

    const comparison05 = stock?.comparison.targets.find((target) => target.targetPercent === 0.5);
    expect(comparison05).toEqual({
      targetPercent: 0.5,
      reachRateDelta_100_vs_95_99: 50,
      winRateDelta_100_vs_95_99: 100,
    });

    expect(result.segments.find((segment) => segment.assetType === 'ETF')?.groups['95-99'].evidence.sampleSize).toBe(0);
    expect(result.segments.find((segment) => segment.assetType === 'CRYPTO')?.groups['95-99'].evidence).toEqual({
      sampleSize: 1,
      evaluatedCount: 0,
      withoutEvaluationCount: 1,
      evaluationCoveragePct: 0,
    });
  });

  it('applies exactScore and score range filters to the read-only query', async () => {
    const database = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new ScorePerformanceResearchService(database);

    await service.analyze({
      strategyVersion: 'v1',
      timeframe: '15m',
      assetType: 'stock',
      exactScore: 100,
      scoreMin: 90,
      scoreMax: 99,
    } as never);

    const [, exactValues] = database.query.mock.calls[0] as [string, unknown[]];
    expect(exactValues).toEqual(['v1', '15m', 'STOCK', 100]);

    await service.analyze({
      strategyVersion: 'v1',
      timeframe: '15m',
      assetType: 'crypto',
      scoreMin: 90,
      scoreMax: 94,
    } as never);

    const [, rangeValues] = database.query.mock.calls[1] as [string, unknown[]];
    expect(rangeValues).toEqual(['v1', '15m', 'CRYPTO', 90, 94]);
  });

  it('returns empty groups and null rates when there is no sample', async () => {
    const service = new ScorePerformanceResearchService({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    });

    const result = await service.analyze({ strategyVersion: 'v1', timeframe: '15m' });
    const stock100 = result.segments[0].groups['100'];

    expect(stock100.evidence).toEqual({
      sampleSize: 0,
      evaluatedCount: 0,
      withoutEvaluationCount: 0,
      evaluationCoveragePct: null,
    });
    expect(stock100.mfe).toEqual({ sampleSize: 0, averagePct: null, medianPct: null });
    expect(stock100.mae).toEqual({ sampleSize: 0, averagePct: null, medianPct: null });
    expect(stock100.targetLadder[0]).toEqual(
      expect.objectContaining({
        unresolved: 0,
        resolvedSampleSize: 0,
        winRate: null,
        reachRate: null,
      }),
    );
    expect(result.segments[0].comparison.mfeAvgDelta_100_vs_95_99).toBeNull();
  });
});

type RowParams = {
  id: string;
  asset_type: 'STOCK' | 'ETF' | 'CRYPTO';
  score: number;
  status: 'OPEN' | 'PARTIALLY_RESOLVED' | 'CLOSED' | 'EXPIRED' | 'AMBIGUOUS' | null;
  mfe: number | null;
  mae: number | null;
  target: number | null;
  outcome: 'WIN' | 'LOSS' | 'EXPIRED' | 'AMBIGUOUS' | null;
};

const row = (params: RowParams) => ({
  id: params.id,
  ticker: params.asset_type === 'CRYPTO' ? 'BTC-USD' : 'NVDA',
  timeframe: '15m',
  score: params.score,
  asset_type: params.asset_type,
  strategy_version: 'v1',
  status: params.status,
  max_favorable_excursion_percent: params.mfe,
  max_adverse_excursion_percent: params.mae,
  target_percent: params.target,
  target_outcome: params.outcome,
});
