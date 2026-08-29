import { EXPERIMENTAL_TARGET_PERCENTS } from '../models/EvidenceSignal';
import type {
  ResearchSnapshotAggregates,
  ResearchSnapshotEvaluationStatuses,
  ResearchSnapshotMfeMaeProfile,
  ResearchSnapshotProfileSampleSize,
  ResearchSnapshotProvider,
  ResearchSnapshotScoreBucket,
  ResearchSnapshotScoreBuckets,
  ResearchSnapshotTargetLadderItem,
} from '../models/ResearchSnapshot';
import type { Queryable } from '../db/postgres';

interface DataQualityRow {
  evidence_count: string | number;
  evaluation_count: string | number;
  evidence_without_evaluation_count: string | number;
  evaluated_evidence_count: string | number;
  evidence_with_mfe_mae_count: string | number;
}

interface ScoreBucketRow {
  bucket: ResearchSnapshotScoreBucket | null;
  count: string | number;
}

interface OperationalOpportunitiesRow {
  operational_opportunities: string | number;
}

interface EvaluationStatusRow {
  status: string | null;
  count: string | number;
}

interface ProfileSampleSizeRow {
  asset_type: string | null;
  timeframe: string;
  score_bucket: ResearchSnapshotScoreBucket;
  strategy_version: string;
  sample_size: string | number;
}

interface TargetOutcomeRow {
  target_percent: string | number;
  outcome: string | null;
  count: string | number;
}

interface MfeMaeProfileRow {
  asset_type: string | null;
  timeframe: string;
  score_bucket: ResearchSnapshotScoreBucket;
  strategy_version: string;
  sample_size: string | number;
  avg_mfe_percent: string | number | null;
  median_mfe_percent: string | number | null;
  avg_mae_percent: string | number | null;
  median_mae_percent: string | number | null;
}

const EMPTY_SCORE_BUCKETS: ResearchSnapshotScoreBuckets = {
  '80-84': 0,
  '85-89': 0,
  '90-94': 0,
  '95-100': 0,
};

const DEFAULT_EVALUATION_STATUSES: ResearchSnapshotEvaluationStatuses = {
  OPEN: 0,
  PARTIALLY_RESOLVED: 0,
  CLOSED: 0,
  EXPIRED: 0,
  AMBIGUOUS: 0,
};

export class PostgresResearchSnapshotProvider implements ResearchSnapshotProvider {
  public constructor(private readonly database: Queryable) {}

  public async getAggregates(params: {
    strategyVersion: string;
    operationalThreshold: number;
  }): Promise<ResearchSnapshotAggregates> {
    const [dataQuality, evidenceSummary, evaluationStatuses, profileSampleSizes, globalTargetLadder, mfeMaeByProfile] =
      await Promise.all([
        this.getDataQuality(params.strategyVersion),
        this.getEvidenceSummary(params.strategyVersion, params.operationalThreshold),
        this.getEvaluationStatuses(params.strategyVersion),
        this.getProfileSampleSizes(params.strategyVersion),
        this.getGlobalTargetLadder(params.strategyVersion),
        this.getMfeMaeByProfile(params.strategyVersion),
      ]);

    return {
      dataQuality,
      evidenceSummary,
      evaluationStatuses,
      profileSampleSizes,
      globalTargetLadder,
      mfeMaeByProfile,
    };
  }

  private async getDataQuality(strategyVersion: string): Promise<ResearchSnapshotAggregates['dataQuality']> {
    const result = await this.database.query<DataQualityRow>(
      `SELECT
        COUNT(signal.id) AS evidence_count,
        COUNT(evaluation.id) AS evaluation_count,
        COUNT(signal.id) FILTER (WHERE evaluation.id IS NULL) AS evidence_without_evaluation_count,
        COUNT(DISTINCT evaluation.evidence_signal_id) AS evaluated_evidence_count,
        COUNT(signal.id) FILTER (
          WHERE evaluation.max_favorable_excursion_percent IS NOT NULL
            AND evaluation.max_adverse_excursion_percent IS NOT NULL
        ) AS evidence_with_mfe_mae_count
      FROM evidence_signals signal
      LEFT JOIN evidence_signal_evaluations evaluation ON evaluation.evidence_signal_id = signal.id
      WHERE signal.strategy_version = $1`,
      [strategyVersion],
    );

    const row = result.rows[0];

    return {
      evidenceCount: toNumber(row?.evidence_count),
      evaluationCount: toNumber(row?.evaluation_count),
      evidenceWithoutEvaluationCount: toNumber(row?.evidence_without_evaluation_count),
      evaluatedEvidenceCount: toNumber(row?.evaluated_evidence_count),
      evidenceWithMfeMaeCount: toNumber(row?.evidence_with_mfe_mae_count),
    };
  }

  private async getEvidenceSummary(
    strategyVersion: string,
    operationalThreshold: number,
  ): Promise<ResearchSnapshotAggregates['evidenceSummary']> {
    const [bucketResult, operationalResult] = await Promise.all([
      this.database.query<ScoreBucketRow>(
        `SELECT
          CASE
            WHEN score >= 80 AND score < 85 THEN '80-84'
            WHEN score >= 85 AND score < 90 THEN '85-89'
            WHEN score >= 90 AND score < 95 THEN '90-94'
            WHEN score >= 95 AND score <= 100 THEN '95-100'
            ELSE NULL
          END AS bucket,
          COUNT(*) AS count
        FROM evidence_signals
        WHERE strategy_version = $1
          AND score >= 80
          AND score <= 100
        GROUP BY bucket`,
        [strategyVersion],
      ),
      this.database.query<OperationalOpportunitiesRow>(
        `SELECT COUNT(*) AS operational_opportunities
         FROM evidence_signals
         WHERE strategy_version = $1
           AND score >= $2`,
        [strategyVersion, operationalThreshold],
      ),
    ]);

    const scoreBuckets = { ...EMPTY_SCORE_BUCKETS };
    for (const row of bucketResult.rows) {
      if (row.bucket) {
        scoreBuckets[row.bucket] = toNumber(row.count);
      }
    }

    return {
      totalEvidence: Object.values(scoreBuckets).reduce((sum, count) => sum + count, 0),
      scoreBuckets,
      operationalOpportunities: toNumber(operationalResult.rows[0]?.operational_opportunities),
      operationalThreshold,
    };
  }

  private async getEvaluationStatuses(strategyVersion: string): Promise<ResearchSnapshotEvaluationStatuses> {
    const result = await this.database.query<EvaluationStatusRow>(
      `SELECT evaluation.status, COUNT(*) AS count
       FROM evidence_signal_evaluations evaluation
       JOIN evidence_signals signal ON signal.id = evaluation.evidence_signal_id
       WHERE signal.strategy_version = $1
       GROUP BY evaluation.status`,
      [strategyVersion],
    );

    const statuses = { ...DEFAULT_EVALUATION_STATUSES };
    for (const row of result.rows) {
      if (row.status) {
        statuses[row.status] = toNumber(row.count);
      }
    }

    return statuses;
  }

  private async getProfileSampleSizes(strategyVersion: string): Promise<ResearchSnapshotProfileSampleSize[]> {
    const result = await this.database.query<ProfileSampleSizeRow>(
      `SELECT
        COALESCE(asset_type, 'UNKNOWN') AS asset_type,
        timeframe,
        CASE
          WHEN score >= 80 AND score < 85 THEN '80-84'
          WHEN score >= 85 AND score < 90 THEN '85-89'
          WHEN score >= 90 AND score < 95 THEN '90-94'
          WHEN score >= 95 AND score <= 100 THEN '95-100'
        END AS score_bucket,
        strategy_version,
        COUNT(*) AS sample_size
       FROM evidence_signals
       WHERE strategy_version = $1
         AND score >= 80
         AND score <= 100
       GROUP BY asset_type, timeframe, score_bucket, strategy_version
       ORDER BY asset_type, timeframe, score_bucket, strategy_version`,
      [strategyVersion],
    );

    return result.rows.map((row) => ({
      assetType: row.asset_type ?? 'UNKNOWN',
      timeframe: row.timeframe,
      scoreBucket: row.score_bucket,
      strategyVersion: row.strategy_version,
      sampleSize: toNumber(row.sample_size),
    }));
  }

  private async getGlobalTargetLadder(strategyVersion: string): Promise<ResearchSnapshotTargetLadderItem[]> {
    const [evidenceCountResult, targetResult] = await Promise.all([
      this.database.query<{ evidence_count: string | number }>(
        `SELECT COUNT(*) AS evidence_count
         FROM evidence_signals
         WHERE strategy_version = $1
           AND score >= 80
           AND score <= 100`,
        [strategyVersion],
      ),
      this.database.query<TargetOutcomeRow>(
        `SELECT target.target_percent, target.outcome, COUNT(*) AS count
         FROM evidence_target_evaluations target
         JOIN evidence_signals signal ON signal.id = target.evidence_signal_id
         WHERE signal.strategy_version = $1
           AND signal.score >= 80
           AND signal.score <= 100
         GROUP BY target.target_percent, target.outcome
         ORDER BY target.target_percent`,
        [strategyVersion],
      ),
    ]);

    const evidenceCount = toNumber(evidenceCountResult.rows[0]?.evidence_count);

    return EXPERIMENTAL_TARGET_PERCENTS.map((targetPercent) => {
      const rows = targetResult.rows.filter((row) => Number(row.target_percent) === targetPercent);
      const wins = countOutcome(rows, 'WIN');
      const losses = countOutcome(rows, 'LOSS');
      const expired = countOutcome(rows, 'EXPIRED');
      const ambiguous = countOutcome(rows, 'AMBIGUOUS');
      const explicitUnresolved = countOutcome(rows, null);
      const rowsForTarget = rows.reduce((sum, row) => sum + toNumber(row.count), 0);
      const missingTargetRows = Math.max(evidenceCount - rowsForTarget, 0);
      const unresolved = explicitUnresolved + missingTargetRows;
      const resolvedSampleSize = wins + losses + expired + ambiguous;

      return {
        targetPercent,
        wins,
        losses,
        expired,
        ambiguous,
        unresolved,
        resolvedSampleSize,
        winRate: rate(wins, wins + losses),
      };
    });
  }

  private async getMfeMaeByProfile(strategyVersion: string): Promise<ResearchSnapshotMfeMaeProfile[]> {
    const result = await this.database.query<MfeMaeProfileRow>(
      `SELECT
        COALESCE(signal.asset_type, 'UNKNOWN') AS asset_type,
        signal.timeframe,
        CASE
          WHEN signal.score >= 80 AND signal.score < 85 THEN '80-84'
          WHEN signal.score >= 85 AND signal.score < 90 THEN '85-89'
          WHEN signal.score >= 90 AND signal.score < 95 THEN '90-94'
          WHEN signal.score >= 95 AND signal.score <= 100 THEN '95-100'
        END AS score_bucket,
        signal.strategy_version,
        COUNT(*) AS sample_size,
        AVG(evaluation.max_favorable_excursion_percent)::numeric AS avg_mfe_percent,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY evaluation.max_favorable_excursion_percent)::numeric AS median_mfe_percent,
        AVG(evaluation.max_adverse_excursion_percent)::numeric AS avg_mae_percent,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY evaluation.max_adverse_excursion_percent)::numeric AS median_mae_percent
       FROM evidence_signals signal
       JOIN evidence_signal_evaluations evaluation ON evaluation.evidence_signal_id = signal.id
       WHERE signal.strategy_version = $1
         AND signal.score >= 80
         AND signal.score <= 100
         AND evaluation.max_favorable_excursion_percent IS NOT NULL
         AND evaluation.max_adverse_excursion_percent IS NOT NULL
       GROUP BY signal.asset_type, signal.timeframe, score_bucket, signal.strategy_version
       ORDER BY signal.asset_type, signal.timeframe, score_bucket, signal.strategy_version`,
      [strategyVersion],
    );

    return result.rows.map((row) => ({
      assetType: row.asset_type ?? 'UNKNOWN',
      timeframe: row.timeframe,
      scoreBucket: row.score_bucket,
      strategyVersion: row.strategy_version,
      sampleSize: toNumber(row.sample_size),
      avgMfePercent: toNullableRoundedNumber(row.avg_mfe_percent),
      medianMfePercent: toNullableRoundedNumber(row.median_mfe_percent),
      avgMaePercent: toNullableRoundedNumber(row.avg_mae_percent),
      medianMaePercent: toNullableRoundedNumber(row.median_mae_percent),
    }));
  }
}

const countOutcome = (rows: TargetOutcomeRow[], outcome: string | null): number =>
  rows
    .filter((row) => row.outcome === outcome)
    .reduce((sum, row) => sum + toNumber(row.count), 0);

const rate = (count: number, total: number): number | null =>
  total > 0 ? round((count / total) * 100, 2) : null;

const toNumber = (value: number | string | undefined): number =>
  value === undefined ? 0 : Number(value);

const toNullableRoundedNumber = (value: number | string | null): number | null =>
  value === null ? null : round(Number(value), 2);

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
