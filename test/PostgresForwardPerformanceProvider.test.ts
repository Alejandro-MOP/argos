import { PostgresForwardPerformanceProvider } from '../src/performance/PostgresForwardPerformanceProvider';

describe('PostgresForwardPerformanceProvider', () => {
  it('builds filtered forward/evidence performance summaries with buckets and expectancy', async () => {
    const rows = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        ticker: 'NVDA',
        timeframe: '15m',
        score: 95,
        financial_stop_percent: 1,
        asset_type: 'STOCK',
        sector: 'Technology',
        industry: 'Semiconductors',
        strategy_version: 'v1',
        detected_at: new Date('2026-01-01T14:00:00.000Z'),
        outcome_tp1: 'WIN',
        outcome_tp2: 'LOSS',
        max_favorable_excursion_percent: 1.5,
        max_adverse_excursion_percent: -0.4,
        status: 'CLOSED',
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        ticker: 'AMD',
        timeframe: '15m',
        score: 90,
        financial_stop_percent: 1,
        asset_type: 'STOCK',
        sector: 'Technology',
        industry: 'Semiconductors',
        strategy_version: 'v1',
        detected_at: new Date('2026-01-02T14:00:00.000Z'),
        outcome_tp1: 'LOSS',
        outcome_tp2: 'LOSS',
        max_favorable_excursion_percent: 0.6,
        max_adverse_excursion_percent: -1.1,
        status: 'CLOSED',
      },
    ];
    const targetRows = [
      { evidence_signal_id: rows[0].id, target_percent: 1, outcome: 'WIN' },
      { evidence_signal_id: rows[1].id, target_percent: 1, outcome: 'LOSS' },
      { evidence_signal_id: rows[0].id, target_percent: 2, outcome: 'LOSS' },
      { evidence_signal_id: rows[1].id, target_percent: 2, outcome: 'LOSS' },
    ];
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows: targetRows }),
    };
    const provider = new PostgresForwardPerformanceProvider(database, 3);

    const result = await provider.getPerformance({ timeframe: '15m', minimumScore: 90, strategyVersion: 'v1' });

    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('signal.timeframe'), expect.arrayContaining(['15m', 90, 'v1']));
    expect(result.sampleSize).toBe(2);
    expect(result.smallSample).toBe(true);
    expect(result.tp1).toEqual({ wins: 1, losses: 1, expired: 0, ambiguous: 0, winRate: 50 });
    expect(result.mfe).toEqual({ average: 1.05, median: 1.05 });
    expect(result.mae).toEqual({ average: -0.75, median: -0.75 });
    expect(result.scoreBuckets.find((bucket) => bucket.minScore === 90)).toEqual(
      expect.objectContaining({ sampleSize: 1 }),
    );
    expect(result.scoreBuckets.find((bucket) => bucket.minScore === 95)).toEqual(
      expect.objectContaining({ sampleSize: 1 }),
    );
    expect(result.byTimeframe).toEqual([
      expect.objectContaining({ timeframe: '15m', sampleSize: 2, tp1WinRate: 50 }),
    ]);
    expect(result.bySector).toEqual([
      expect.objectContaining({ sector: 'Technology', sampleSize: 2, tp1WinRate: 50 }),
    ]);
    expect(result.experimentalTargets.find((target) => target.targetPercent === 1)).toEqual(
      expect.objectContaining({ wins: 1, losses: 1, winRate: 50, historicalForwardExpectancyPercent: 0 }),
    );
  });
});
