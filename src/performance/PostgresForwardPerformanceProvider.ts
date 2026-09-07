import type { BacktestOutcome } from '../models/BacktestTrade';
import {
  EXPERIMENTAL_TARGET_PERCENTS,
  type ForwardPerformanceFilters,
  type ForwardPerformanceSummary,
  type PerformanceOutcomeSummary,
  type PerformanceTargetLadderSummary,
  type ScoreBucketPerformanceSummary,
} from '../models/EvidenceSignal';
import type { Queryable } from '../db/postgres';

interface EvidencePerformanceRow {
  id: string;
  ticker: string;
  timeframe: string;
  score: string | number;
  financial_stop_percent: string | number;
  asset_type: string | null;
  sector: string | null;
  industry: string | null;
  strategy_version: string;
  detected_at: Date;
  outcome_tp1: BacktestOutcome | null;
  outcome_tp2: BacktestOutcome | null;
  max_favorable_excursion_percent: string | number | null;
  max_adverse_excursion_percent: string | number | null;
  status: string | null;
}

interface TargetPerformanceRow {
  evidence_signal_id: string;
  target_percent: string | number;
  outcome: BacktestOutcome | null;
}

type MinimumSampleSizeProvider = number | (() => Promise<number> | number);

export class PostgresForwardPerformanceProvider {
  public constructor(
    private readonly database: Queryable,
    private readonly minimumSampleSizeProvider: MinimumSampleSizeProvider,
  ) {}

  public async getPerformance(filters: ForwardPerformanceFilters = {}): Promise<ForwardPerformanceSummary> {
    const minimumSampleSize = await this.resolveMinimumSampleSize();
    const rows = await this.fetchRows(filters);
    const targetRows = rows.length > 0 ? await this.fetchTargetRows(rows.map((row) => row.id)) : [];
    const targetRowsBySignalId = groupTargetRows(targetRows);

    return {
      filters: serializeFilters(filters),
      sampleSize: rows.length,
      smallSample: rows.length < minimumSampleSize,
      tp1: summarizeOutcome(rows.map((row) => row.outcome_tp1)),
      tp2: summarizeOutcome(rows.map((row) => row.outcome_tp2)),
      experimentalTargets: EXPERIMENTAL_TARGET_PERCENTS.map((targetPercent) =>
        summarizeTarget(targetPercent, rows, targetRowsBySignalId),
      ),
      mfe: {
        average: average(rows.map((row) => toNullableNumber(row.max_favorable_excursion_percent))),
        median: median(rows.map((row) => toNullableNumber(row.max_favorable_excursion_percent))),
      },
      mae: {
        average: average(rows.map((row) => toNullableNumber(row.max_adverse_excursion_percent))),
        median: median(rows.map((row) => toNullableNumber(row.max_adverse_excursion_percent))),
      },
      expiredRate: rate(rows.filter((row) => row.status === 'EXPIRED').length, rows.length),
      ambiguousRate: rate(rows.filter((row) => row.status === 'AMBIGUOUS').length, rows.length),
      scoreBuckets: buildScoreBuckets(rows, minimumSampleSize),
      byTimeframe: summarizeDimension(rows, 'timeframe', minimumSampleSize, 'timeframe'),
      byTicker: summarizeDimension(rows, 'ticker', minimumSampleSize, 'ticker'),
      byAssetType: summarizeDimension(rows, 'asset_type', minimumSampleSize, 'assetType'),
      bySector: summarizeDimension(rows, 'sector', minimumSampleSize, 'sector'),
      byIndustry: summarizeDimension(rows, 'industry', minimumSampleSize, 'industry'),
      byStrategyVersion: summarizeDimension(rows, 'strategy_version', minimumSampleSize, 'strategyVersion'),
    };
  }

  private async resolveMinimumSampleSize(): Promise<number> {
    if (typeof this.minimumSampleSizeProvider === 'number') {
      return this.minimumSampleSizeProvider;
    }

    return this.minimumSampleSizeProvider();
  }

  private async fetchRows(filters: ForwardPerformanceFilters): Promise<EvidencePerformanceRow[]> {
    const values: unknown[] = [];
    const conditions = ['evaluation.status IS NOT NULL', 'signal.excluded_from_research = false'];

    if (filters.ticker) {
      values.push(filters.ticker.toUpperCase());
      conditions.push(`signal.ticker = $${values.length}`);
    }

    if (filters.timeframe) {
      values.push(filters.timeframe.toLowerCase());
      conditions.push(`signal.timeframe = $${values.length}`);
    }

    const bucket = parseScoreBucket(filters.scoreBucket);
    const minimumScore = bucket?.min ?? filters.minimumScore;
    const maximumScore = bucket?.max ?? filters.maximumScore;

    if (minimumScore !== undefined) {
      values.push(minimumScore);
      conditions.push(`signal.score >= $${values.length}`);
    }

    if (maximumScore !== undefined) {
      values.push(maximumScore);
      conditions.push(`signal.score <= $${values.length}`);
    }

    if (filters.assetType) {
      values.push(filters.assetType.toUpperCase());
      conditions.push(`signal.asset_type = $${values.length}`);
    }

    if (filters.sector) {
      values.push(filters.sector);
      conditions.push(`signal.sector = $${values.length}`);
    }

    if (filters.industry) {
      values.push(filters.industry);
      conditions.push(`signal.industry = $${values.length}`);
    }

    if (filters.strategyVersion) {
      values.push(filters.strategyVersion);
      conditions.push(`signal.strategy_version = $${values.length}`);
    }

    if (filters.from) {
      values.push(filters.from);
      conditions.push(`signal.detected_at >= $${values.length}`);
    }

    if (filters.to) {
      values.push(filters.to);
      conditions.push(`signal.detected_at <= $${values.length}`);
    }

    const result = await this.database.query<EvidencePerformanceRow>(
      `SELECT
        signal.id,
        signal.ticker,
        signal.timeframe,
        signal.score,
        signal.financial_stop_percent,
        signal.asset_type,
        signal.sector,
        signal.industry,
        signal.strategy_version,
        signal.detected_at,
        evaluation.outcome_tp1,
        evaluation.outcome_tp2,
        evaluation.max_favorable_excursion_percent,
        evaluation.max_adverse_excursion_percent,
        evaluation.status
      FROM evidence_signals signal
      JOIN evidence_signal_evaluations evaluation ON evaluation.evidence_signal_id = signal.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY signal.detected_at DESC`,
      values,
    );

    return result.rows;
  }

  private async fetchTargetRows(signalIds: string[]): Promise<TargetPerformanceRow[]> {
    const result = await this.database.query<TargetPerformanceRow>(
      `SELECT evidence_signal_id, target_percent, outcome
       FROM evidence_target_evaluations
       WHERE evidence_signal_id = ANY($1::uuid[])`,
      [signalIds],
    );

    return result.rows;
  }
}

const summarizeOutcome = (outcomes: Array<BacktestOutcome | null>): PerformanceOutcomeSummary => {
  const wins = outcomes.filter((outcome) => outcome === 'WIN').length;
  const losses = outcomes.filter((outcome) => outcome === 'LOSS').length;
  const expired = outcomes.filter((outcome) => outcome === 'EXPIRED').length;
  const ambiguous = outcomes.filter((outcome) => outcome === 'AMBIGUOUS').length;

  return {
    wins,
    losses,
    expired,
    ambiguous,
    winRate: rate(wins, wins + losses),
  };
};

const summarizeTarget = (
  targetPercent: number,
  rows: EvidencePerformanceRow[],
  targetRowsBySignalId: Map<string, TargetPerformanceRow[]>,
): PerformanceTargetLadderSummary => {
  const outcomes = rows.map((row) =>
    targetRowsBySignalId
      .get(row.id)
      ?.find((target) => Number(target.target_percent) === targetPercent)
      ?.outcome ?? null,
  );
  const summary = summarizeOutcome(outcomes);
  const resolved = summary.wins + summary.losses;
  const pWin = resolved > 0 ? summary.wins / resolved : null;
  const averageStop = average(rows.map((row) => Number(row.financial_stop_percent)));

  return {
    targetPercent,
    ...summary,
    historicalForwardExpectancyPercent:
      pWin === null || averageStop === null
        ? null
        : round((pWin * targetPercent) - ((1 - pWin) * averageStop), 2),
    profitFactor:
      summary.losses > 0
        ? round((summary.wins * targetPercent) / (summary.losses * (averageStop ?? 0)), 2)
        : null,
  };
};

const buildScoreBuckets = (
  rows: EvidencePerformanceRow[],
  minimumSampleSize: number,
): ScoreBucketPerformanceSummary[] => [
  { minScore: 80, maxScore: 84 },
  { minScore: 85, maxScore: 89 },
  { minScore: 90, maxScore: 94 },
  { minScore: 95, maxScore: 100 },
].map((bucket) => {
  const bucketRows = rows.filter((row) => Number(row.score) >= bucket.minScore && Number(row.score) <= bucket.maxScore);
  const statuses = bucketRows.map((row) => row.status);
  return {
    ...bucket,
    sampleSize: bucketRows.length,
    smallSample: bucketRows.length < minimumSampleSize,
    tp1: summarizeOutcome(bucketRows.map((row) => row.outcome_tp1)),
    tp2: summarizeOutcome(bucketRows.map((row) => row.outcome_tp2)),
    averageMfePercent: average(bucketRows.map((row) => toNullableNumber(row.max_favorable_excursion_percent))),
    medianMfePercent: median(bucketRows.map((row) => toNullableNumber(row.max_favorable_excursion_percent))),
    averageMaePercent: average(bucketRows.map((row) => toNullableNumber(row.max_adverse_excursion_percent))),
    medianMaePercent: median(bucketRows.map((row) => toNullableNumber(row.max_adverse_excursion_percent))),
    expiredRate: rate(statuses.filter((status) => status === 'EXPIRED').length, bucketRows.length) ?? 0,
    ambiguousRate: rate(statuses.filter((status) => status === 'AMBIGUOUS').length, bucketRows.length) ?? 0,
  };
});

const summarizeDimension = <Key extends keyof EvidencePerformanceRow, OutputKey extends string>(
  rows: EvidencePerformanceRow[],
  rowKey: Key,
  minimumSampleSize: number,
  outputKey: OutputKey,
): Array<Record<OutputKey, string | null> & { sampleSize: number; smallSample: boolean; tp1WinRate: number | null; tp2WinRate: number | null }> => {
  const grouped = new Map<string, EvidencePerformanceRow[]>();

  for (const row of rows) {
    const value = row[rowKey] === null ? 'null' : String(row[rowKey]);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }

  return [...grouped.entries()]
    .map(([value, groupRows]) => ({
      [outputKey]: value === 'null' ? null : value,
      sampleSize: groupRows.length,
      smallSample: groupRows.length < minimumSampleSize,
      tp1WinRate: summarizeOutcome(groupRows.map((row) => row.outcome_tp1)).winRate,
      tp2WinRate: summarizeOutcome(groupRows.map((row) => row.outcome_tp2)).winRate,
    }) as Record<OutputKey, string | null> & { sampleSize: number; smallSample: boolean; tp1WinRate: number | null; tp2WinRate: number | null })
    .sort((left, right) => right.sampleSize - left.sampleSize);
};

const groupTargetRows = (rows: TargetPerformanceRow[]): Map<string, TargetPerformanceRow[]> => {
  const grouped = new Map<string, TargetPerformanceRow[]>();

  for (const row of rows) {
    grouped.set(row.evidence_signal_id, [...(grouped.get(row.evidence_signal_id) ?? []), row]);
  }

  return grouped;
};

const average = (values: Array<number | null>): number | null => {
  const numericValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (numericValues.length === 0) {
    return null;
  }
  return round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length, 2);
};

const median = (values: Array<number | null>): number | null => {
  const numericValues = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right);

  if (numericValues.length === 0) {
    return null;
  }

  const middle = Math.floor(numericValues.length / 2);
  if (numericValues.length % 2 === 0) {
    return round((numericValues[middle - 1] + numericValues[middle]) / 2, 2);
  }

  return round(numericValues[middle], 2);
};

const rate = (count: number, total: number): number | null =>
  total > 0 ? round((count / total) * 100, 2) : null;

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const toNullableNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

const parseScoreBucket = (bucket: string | undefined): { min: number; max: number } | undefined => {
  switch (bucket) {
    case '80-84':
      return { min: 80, max: 84 };
    case '85-89':
      return { min: 85, max: 89 };
    case '90-94':
      return { min: 90, max: 94 };
    case '95-100':
      return { min: 95, max: 100 };
    default:
      return undefined;
  }
};

const serializeFilters = (filters: ForwardPerformanceFilters): Record<string, unknown> => ({
  ...filters,
  from: filters.from?.toISOString(),
  to: filters.to?.toISOString(),
});
