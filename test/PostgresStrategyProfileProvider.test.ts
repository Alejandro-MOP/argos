import { PostgresStrategyProfileProvider } from '../src/research/PostgresStrategyProfileProvider';

describe('PostgresStrategyProfileProvider', () => {
  it('builds read-only strategy profiles separated by asset/timeframe/score bucket/strategy version', async () => {
    const stockSignalId = '00000000-0000-0000-0000-000000000001';
    const cryptoSignalId = '00000000-0000-0000-0000-000000000002';
    const rows = [
      row({
        id: stockSignalId,
        ticker: 'NVDA',
        asset_type: 'STOCK',
        timeframe: '15m',
        score: 95,
        status: 'CLOSED',
        max_favorable_excursion_percent: 2,
        max_adverse_excursion_percent: -0.5,
        target_percent: 1,
        target_outcome: 'WIN',
      }),
      row({
        id: stockSignalId,
        ticker: 'NVDA',
        asset_type: 'STOCK',
        timeframe: '15m',
        score: 95,
        status: 'CLOSED',
        max_favorable_excursion_percent: 2,
        max_adverse_excursion_percent: -0.5,
        target_percent: 2,
        target_outcome: 'LOSS',
      }),
      row({
        id: cryptoSignalId,
        ticker: 'BTC-USD',
        asset_type: 'CRYPTO',
        timeframe: '15m',
        score: 95,
        status: 'OPEN',
        max_favorable_excursion_percent: null,
        max_adverse_excursion_percent: null,
        target_percent: 1,
        target_outcome: null,
      }),
    ];
    const database = { query: jest.fn().mockResolvedValue({ rows }) };
    const provider = new PostgresStrategyProfileProvider(database);

    const result = await provider.getProfiles({ timeframe: '15m', strategyVersion: 'v1' });

    expect(database.query).toHaveBeenCalledTimes(1);
    const executedSql = database.query.mock.calls[0][0] as string;
    expect(executedSql.trim().toUpperCase().startsWith('WITH')).toBe(true);
    expect(executedSql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b/i);
    expect(result.profiles).toHaveLength(2);
    expect(result.profiles.map((profile) => profile.assetType)).toEqual(['CRYPTO', 'STOCK']);
    expect(result.profiles.find((profile) => profile.assetType === 'STOCK')).toEqual(
      expect.objectContaining({
        timeframe: '15m',
        scoreBucket: '95-100',
        strategyVersion: 'v1',
        sampleSize: 1,
        resolvedSignalSampleSize: 1,
      }),
    );
  });

  it('separates trade winRate from market reachRate for target outcomes', async () => {
    const rows = [
      targetRow('1', 'WIN'),
      targetRow('2', 'LOSS'),
      targetRow('3', 'EXPIRED'),
      targetRow('4', 'AMBIGUOUS'),
      targetRow('5', null),
    ];
    const provider = new PostgresStrategyProfileProvider({
      query: jest.fn().mockResolvedValue({ rows }),
    });

    const result = await provider.getProfiles();
    const target = result.profiles[0].experimentalTargets.find((item) => item.targetPercent === 1);

    expect(target).toEqual(
      expect.objectContaining({
        wins: 1,
        losses: 1,
        expired: 1,
        ambiguous: 1,
        unresolved: 1,
        resolvedTargetSampleSize: 4,
        winRate: 50,
        reachedCount: 2,
        eligibleSampleSize: 4,
        reachRate: 50,
      }),
    );
  });

  it('calculates MFE and MAE average, median and percentiles while preserving negative MAE', async () => {
    const rows = [
      signalRow('1', 1, -5),
      signalRow('2', 2, -4),
      signalRow('3', 3, -3),
      signalRow('4', 4, -2),
      signalRow('5', 5, -1),
    ];
    const provider = new PostgresStrategyProfileProvider({
      query: jest.fn().mockResolvedValue({ rows }),
    });

    const result = await provider.getProfiles();
    const profile = result.profiles[0];

    expect(profile.mfe).toEqual({ average: 3, median: 3, p25: 2, p75: 4, p90: 4.6 });
    expect(profile.mae).toEqual({ average: -3, median: -3, p25: -4, p75: -2, p90: -1.4 });
  });

  it('applies data maturity thresholds using profile-level resolved signals', async () => {
    const provider = new PostgresStrategyProfileProvider({
      query: jest.fn().mockResolvedValue({
        rows: Array.from({ length: 75 }, (_, index) =>
          row({
            id: String(index + 1),
            status: index < 30 ? 'CLOSED' : 'OPEN',
            target_percent: null,
            target_outcome: null,
          }),
        ),
      }),
    });

    const result = await provider.getProfiles();

    expect(result.profiles[0]).toEqual(
      expect.objectContaining({
        sampleSize: 75,
        resolvedSignalSampleSize: 30,
        dataMaturity: 'DEVELOPING',
      }),
    );
  });

  it('reports target ladder sanity anomalies when a higher target is reached but a lower target is not', async () => {
    const signalId = '00000000-0000-0000-0000-000000000123';
    const provider = new PostgresStrategyProfileProvider({
      query: jest.fn().mockResolvedValue({
        rows: [
          row({ id: signalId, target_percent: 1, target_outcome: 'LOSS' }),
          row({ id: signalId, target_percent: 2, target_outcome: 'WIN' }),
        ],
      }),
    });

    const result = await provider.getProfiles();

    expect(result.profiles[0].sanity).toEqual({
      anomalyCount: 1,
      anomalies: [
        expect.objectContaining({
          lowerTargetPercent: 1,
          lowerTargetOutcome: 'LOSS',
          higherTargetPercent: 2,
          higherTargetOutcome: 'WIN',
        }),
      ],
    });
  });

  it('does not flag lower ambiguous and higher loss as an anomaly', async () => {
    const signalId = '00000000-0000-0000-0000-000000000124';
    const provider = new PostgresStrategyProfileProvider({
      query: jest.fn().mockResolvedValue({
        rows: [
          row({ id: signalId, target_percent: 1, target_outcome: 'AMBIGUOUS' }),
          row({ id: signalId, target_percent: 2, target_outcome: 'LOSS' }),
        ],
      }),
    });

    const result = await provider.getProfiles();

    expect(result.profiles[0].sanity.anomalyCount).toBe(0);
  });

  it('filters profiles by minimum sample size after grouping', async () => {
    const provider = new PostgresStrategyProfileProvider({
      query: jest.fn().mockResolvedValue({ rows: [row({ id: '1' })] }),
    });

    const result = await provider.getProfiles({ minimumSampleSize: 2 });

    expect(result.profiles).toEqual([]);
  });
});

const row = (overrides: Record<string, unknown> = {}) => ({
  id: '00000000-0000-0000-0000-000000000001',
  ticker: 'NVDA',
  timeframe: '15m',
  score: 95,
  asset_type: 'STOCK',
  strategy_version: 'v1',
  status: 'CLOSED',
  max_favorable_excursion_percent: 1,
  max_adverse_excursion_percent: -1,
  target_percent: 1,
  target_outcome: 'WIN',
  ...overrides,
});

const targetRow = (id: string, outcome: string | null) =>
  row({
    id,
    target_percent: 1,
    target_outcome: outcome,
  });

const signalRow = (id: string, mfe: number, mae: number) =>
  row({
    id,
    max_favorable_excursion_percent: mfe,
    max_adverse_excursion_percent: mae,
    target_percent: null,
    target_outcome: null,
  });
