import type { QueryResult, QueryResultRow } from 'pg';
import type { ForwardPerformanceSummary } from '../src/models/EvidenceSignal';
import type { ResearchSnapshotAggregates } from '../src/models/ResearchSnapshot';
import type { StrategyProfile, StrategyProfileSummary } from '../src/models/StrategyProfile';
import { PostgresResearchSnapshotProvider } from '../src/research/PostgresResearchSnapshotProvider';
import {
  formatDateInTimeZone,
  ResearchSnapshotService,
  selectWatchProfiles,
} from '../src/services/ResearchSnapshotService';
import type { Queryable } from '../src/db/postgres';

const baseAggregates: ResearchSnapshotAggregates = {
  dataQuality: {
    evidenceCount: 201,
    evaluationCount: 198,
    evidenceWithoutEvaluationCount: 3,
    evaluatedEvidenceCount: 198,
    evidenceWithMfeMaeCount: 190,
  },
  evidenceSummary: {
    totalEvidence: 201,
    scoreBuckets: {
      '80-84': 60,
      '85-89': 52,
      '90-94': 64,
      '95-100': 25,
    },
    operationalOpportunities: 89,
    operationalThreshold: 90,
  },
  evaluationStatuses: {
    OPEN: 15,
    PARTIALLY_RESOLVED: 5,
    CLOSED: 156,
    EXPIRED: 19,
    AMBIGUOUS: 3,
  },
  profileSampleSizes: [
    {
      assetType: 'STOCK',
      timeframe: '1m',
      scoreBucket: '90-94',
      strategyVersion: 'v1',
      sampleSize: 20,
    },
  ],
  globalTargetLadder: [
    {
      targetPercent: 0.5,
      wins: 10,
      losses: 5,
      expired: 2,
      ambiguous: 1,
      unresolved: 3,
      resolvedSampleSize: 18,
      winRate: 66.67,
    },
  ],
  mfeMaeByProfile: [
    {
      assetType: 'STOCK',
      timeframe: '1m',
      scoreBucket: '90-94',
      strategyVersion: 'v1',
      sampleSize: 12,
      avgMfePercent: 1.2,
      medianMfePercent: 1,
      avgMaePercent: -0.8,
      medianMaePercent: -0.7,
    },
  ],
};

const forwardPerformance: ForwardPerformanceSummary = {
  filters: { strategyVersion: 'v1' },
  sampleSize: 198,
  smallSample: false,
  tp1: { wins: 100, losses: 50, expired: 20, ambiguous: 5, winRate: 66.67 },
  tp2: { wins: 70, losses: 80, expired: 20, ambiguous: 5, winRate: 46.67 },
  experimentalTargets: [],
  mfe: { average: 1.2, median: 1 },
  mae: { average: -0.8, median: -0.7 },
  expiredRate: 9.6,
  ambiguousRate: 1.5,
  scoreBuckets: [],
  byTimeframe: [],
  byTicker: [],
  byAssetType: [],
  bySector: [],
  byIndustry: [],
  byStrategyVersion: [],
};

const profile = (params: Partial<StrategyProfile>): StrategyProfile => ({
  assetType: 'STOCK',
  timeframe: '1m',
  scoreBucket: '90-94',
  strategyVersion: 'v1',
  sampleSize: 20,
  resolvedSignalSampleSize: 12,
  dataMaturity: 'EARLY',
  statusDistribution: { open: 1, partiallyResolved: 1, closed: 10, expired: 0, ambiguous: 0 },
  mfe: { average: 1, median: 1, p25: 0.5, p75: 1.5, p90: 2 },
  mae: { average: -1, median: -1, p25: -1.5, p75: -0.5, p90: -0.2 },
  experimentalTargets: [],
  sanity: { anomalyCount: 0, anomalies: [] },
  ...params,
});

const strategyProfileSummary: StrategyProfileSummary = {
  filters: { strategyVersion: 'v1' },
  semantics: {
    tradeOutcome: 'winRate = wins / (wins + losses).',
    marketReachability: 'reachRate = (wins + ambiguous) / resolved outcomes.',
    dataMaturity: 'MATURE is not validation.',
    maePercentiles: 'MAE keeps negative sign.',
  },
  profiles: [
    profile({ assetType: 'STOCK', timeframe: '1m', scoreBucket: '90-94' }),
    profile({ assetType: 'STOCK', timeframe: '5m', scoreBucket: '95-100' }),
    profile({ assetType: 'CRYPTO', timeframe: '5m', scoreBucket: '90-94' }),
    profile({ assetType: 'CRYPTO', timeframe: '15m', scoreBucket: '90-94' }),
    profile({ assetType: 'STOCK', timeframe: '1d', scoreBucket: '80-84' }),
  ],
};


const engineConfigService = {
  loadSnapshot: jest.fn().mockResolvedValue({
    source: 'postgres',
    values: {
      strategyVersion: 'v1',
      scoring: { opportunityMinScore: 90 },
    },
  }),
};

describe('ResearchSnapshotService', () => {
  it('generates a self-contained read-only snapshot using existing providers once', async () => {
    const snapshotProvider = { getAggregates: jest.fn().mockResolvedValue(baseAggregates) };
    const strategyProvider = { getProfiles: jest.fn().mockResolvedValue(strategyProfileSummary) };
    const performanceProvider = { getPerformance: jest.fn().mockResolvedValue(forwardPerformance) };
    const service = new ResearchSnapshotService(snapshotProvider, strategyProvider, performanceProvider, {
      timeZone: 'America/Mexico_City',
      engineConfigService,
    });

    const snapshot = await service.generate(new Date('2026-08-29T04:30:00.000Z'));

    expect(snapshot.schemaVersion).toBe('1');
    expect(snapshot.snapshot).toEqual({
      snapshotDate: '2026-08-28',
      generatedAt: '2026-08-29T04:30:00.000Z',
      timeZone: 'America/Mexico_City',
      strategyVersion: 'v1',
    });
    expect(snapshot.dataQuality.evidenceCount).toBe(201);
    expect(snapshot.dataQuality.evaluationCount).toBe(198);
    expect(snapshot.dataQuality.evidenceWithoutEvaluationCount).toBe(3);
    expect(snapshot.evidenceSummary.operationalThreshold).toBe(90);
    expect(snapshot.evaluationStatuses.CLOSED).toBe(156);
    expect(snapshot.profileSampleSizes).toHaveLength(1);
    expect(snapshot.globalTargetLadder[0].winRate).toBe(66.67);
    expect(snapshot.mfeMaeByProfile[0].sampleSize).toBe(12);
    expect(snapshot.strategyProfiles).toHaveLength(5);
    expect(snapshot.watchProfiles).toHaveLength(4);
    expect(snapshot.forwardPerformance).toBe(forwardPerformance);
    expect(engineConfigService.loadSnapshot).toHaveBeenCalled();
    expect(snapshotProvider.getAggregates).toHaveBeenCalledTimes(1);
    expect(strategyProvider.getProfiles).toHaveBeenCalledWith({ strategyVersion: 'v1' });
    expect(performanceProvider.getPerformance).toHaveBeenCalledWith({ strategyVersion: 'v1' });
  });

  it('derives watch profiles from existing strategy profiles without recalculating them', () => {
    expect(selectWatchProfiles(strategyProfileSummary.profiles).map((candidate) => candidate.timeframe)).toEqual([
      '1m',
      '5m',
      '5m',
      '15m',
    ]);
  });

  it('formats snapshotDate in the configured timezone instead of UTC slicing', () => {
    expect(formatDateInTimeZone(new Date('2026-08-29T04:30:00.000Z'), 'America/Mexico_City')).toBe(
      '2026-08-28',
    );
  });
});

class FakeQueryable implements Queryable {
  public readonly calls: string[] = [];

  public async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    this.calls.push(text);
    expect(values).toContain('v1');

    const rows = this.resolveRows(text) as T[];

    return {
      rows,
      command: 'SELECT',
      rowCount: rows.length,
      oid: 0,
      fields: [],
    };
  }

  private resolveRows(text: string): QueryResultRow[] {
    if (text.includes('evidence_without_evaluation_count')) {
      return [
        {
          evidence_count: '4',
          evaluation_count: '3',
          evidence_without_evaluation_count: '1',
          evaluated_evidence_count: '3',
          evidence_with_mfe_mae_count: '2',
        },
      ];
    }

    if (text.includes('CASE') && text.includes('GROUP BY bucket')) {
      return [
        { bucket: '80-84', count: '1' },
        { bucket: '90-94', count: '2' },
        { bucket: '95-100', count: '1' },
      ];
    }

    if (text.includes('operational_opportunities')) {
      expect(text).toContain('score >= $2');
      return [{ operational_opportunities: '3' }];
    }

    if (text.includes('GROUP BY evaluation.status')) {
      return [
        { status: 'CLOSED', count: '2' },
        { status: 'OPEN', count: '1' },
        { status: 'CUSTOM_STATUS', count: '1' },
      ];
    }

    if (text.includes('sample_size') && text.includes('FROM evidence_signals') && !text.includes('percentile_cont')) {
      return [
        {
          asset_type: 'STOCK',
          timeframe: '1m',
          score_bucket: '90-94',
          strategy_version: 'v1',
          sample_size: '2',
        },
      ];
    }

    if (text.includes('SELECT COUNT(*) AS evidence_count') && text.includes('score >= 80')) {
      return [{ evidence_count: '4' }];
    }

    if (text.includes('FROM evidence_target_evaluations')) {
      return [
        { target_percent: '0.5', outcome: 'WIN', count: '2' },
        { target_percent: '0.5', outcome: 'LOSS', count: '1' },
        { target_percent: '0.5', outcome: 'EXPIRED', count: '1' },
        { target_percent: '0.75', outcome: 'AMBIGUOUS', count: '1' },
        { target_percent: '0.75', outcome: null, count: '1' },
      ];
    }

    if (text.includes('percentile_cont')) {
      return [
        {
          asset_type: 'STOCK',
          timeframe: '1m',
          score_bucket: '90-94',
          strategy_version: 'v1',
          sample_size: '2',
          avg_mfe_percent: '1.25',
          median_mfe_percent: '1.1',
          avg_mae_percent: '-0.75',
          median_mae_percent: '-0.8',
        },
      ];
    }

    throw new Error(`Unexpected SQL: ${text}`);
  }
}

describe('PostgresResearchSnapshotProvider', () => {
  it('aggregates Q1-Q5 with read-only SELECT queries and documented semantics', async () => {
    const database = new FakeQueryable();
    const provider = new PostgresResearchSnapshotProvider(database);

    const aggregates = await provider.getAggregates({ strategyVersion: 'v1', operationalThreshold: 90 });

    expect(aggregates.dataQuality).toEqual({
      evidenceCount: 4,
      evaluationCount: 3,
      evidenceWithoutEvaluationCount: 1,
      evaluatedEvidenceCount: 3,
      evidenceWithMfeMaeCount: 2,
    });
    expect(aggregates.evidenceSummary.scoreBuckets).toEqual({
      '80-84': 1,
      '85-89': 0,
      '90-94': 2,
      '95-100': 1,
    });
    expect(aggregates.evidenceSummary.operationalOpportunities).toBe(3);
    expect(aggregates.evaluationStatuses).toEqual(
      expect.objectContaining({ OPEN: 1, CLOSED: 2, CUSTOM_STATUS: 1 }),
    );
    expect(aggregates.profileSampleSizes).toEqual([
      { assetType: 'STOCK', timeframe: '1m', scoreBucket: '90-94', strategyVersion: 'v1', sampleSize: 2 },
    ]);
    expect(aggregates.globalTargetLadder[0]).toEqual({
      targetPercent: 0.5,
      wins: 2,
      losses: 1,
      expired: 1,
      ambiguous: 0,
      unresolved: 0,
      resolvedSampleSize: 4,
      winRate: 66.67,
    });
    expect(aggregates.globalTargetLadder[1]).toEqual(
      expect.objectContaining({
        targetPercent: 0.75,
        ambiguous: 1,
        unresolved: 3,
        resolvedSampleSize: 1,
        winRate: null,
      }),
    );
    expect(aggregates.mfeMaeByProfile[0]).toEqual({
      assetType: 'STOCK',
      timeframe: '1m',
      scoreBucket: '90-94',
      strategyVersion: 'v1',
      sampleSize: 2,
      avgMfePercent: 1.25,
      medianMfePercent: 1.1,
      avgMaePercent: -0.75,
      medianMaePercent: -0.8,
    });
    expect(database.calls).toHaveLength(8);
    expect(database.calls.every((sql) => /^SELECT|^\s*SELECT/.test(sql))).toBe(true);
    expect(database.calls.every((sql) => sql.includes('excluded_from_research = false'))).toBe(true);
    expect(database.calls.join('\n')).not.toMatch(/INSERT|UPDATE|DELETE|CREATE|ALTER|DROP/i);
  });
});
