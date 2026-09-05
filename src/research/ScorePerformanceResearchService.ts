import { EXPERIMENTAL_TARGET_PERCENTS } from '../models/EvidenceSignal';
import type { BacktestOutcome } from '../models/BacktestTrade';
import type { SignalEvaluationStatus } from '../models/ForwardSignal';
import type {
  ScorePerformanceAssetType,
  ScorePerformanceComparison,
  ScorePerformanceEvidenceSummary,
  ScorePerformanceExcursionSummary,
  ScorePerformanceGroupKey,
  ScorePerformanceGroupSummary,
  ScorePerformanceResearchFilters,
  ScorePerformanceResearchResult,
  ScorePerformanceResearchRow,
  ScorePerformanceSegment,
  ScorePerformanceStatusSummary,
  ScorePerformanceTargetSummary,
} from '../models/ScorePerformanceResearch';
import type { Queryable } from '../db/postgres';

interface ScorePerformanceSignal {
  id: string;
  timeframe: string;
  score: number;
  assetType: ScorePerformanceAssetType;
  strategyVersion: string;
  status: SignalEvaluationStatus | null;
  mfe: number | null;
  mae: number | null;
  targets: Map<number, BacktestOutcome | null>;
}

const ASSET_TYPES: ScorePerformanceAssetType[] = ['STOCK', 'ETF', 'CRYPTO'];

const SCORE_GROUPS: Array<{
  key: ScorePerformanceGroupKey;
  min?: number;
  max?: number;
  exactScore?: number;
}> = [
  { key: '90-94', min: 90, max: 94 },
  { key: '95-99', min: 95, max: 99 },
  { key: '100', exactScore: 100 },
];

export class ScorePerformanceResearchService {
  public constructor(private readonly database: Queryable) {}

  public async analyze(filters: ScorePerformanceResearchFilters): Promise<ScorePerformanceResearchResult> {
    const normalizedFilters = normalizeFilters(filters);
    const rows = await this.fetchRows(normalizedFilters);
    const signals = [...groupSignals(rows).values()];
    const assetTypes = normalizedFilters.assetType ? [normalizedFilters.assetType] : ASSET_TYPES;

    return {
      strategyVersion: normalizedFilters.strategyVersion,
      timeframe: normalizedFilters.timeframe,
      semantics: {
        researchOnly:
          'Read-only descriptive research. This endpoint does not change Strategy v1, scoring, thresholds, targets, stops, Evidence, Forward Evaluation, Market Scan, or Telegram.',
        evidenceEligibility:
          'Only Evidence with excluded_from_research = false is included. Legacy duplicate-repair exclusions remain respected.',
        winRate:
          'winRate = wins / (wins + losses). EXPIRED and AMBIGUOUS are reported separately and excluded from trade win/loss rate.',
        reachRate:
          'reachRate = (wins + ambiguous) / (wins + losses + expired + ambiguous). NULL outcomes are unresolved and excluded from the denominator.',
        unresolved:
          'Unresolved target outcomes remain outside rate denominators so recent signals are not penalized.',
        comparison:
          'Deltas compare score 100 against 95-99 only. They are descriptive and do not imply edge, profitability, or operational changes.',
      },
      segments: assetTypes.map((assetType) =>
        buildSegment(
          assetType,
          normalizedFilters.strategyVersion,
          normalizedFilters.timeframe,
          signals.filter((signal) => signal.assetType === assetType),
        ),
      ),
    };
  }

  private async fetchRows(filters: ScorePerformanceResearchFilters): Promise<ScorePerformanceResearchRow[]> {
    const values: unknown[] = [];
    const conditions = ['signal.excluded_from_research = false'];

    values.push(filters.strategyVersion);
    conditions.push(`signal.strategy_version = $${values.length}`);

    values.push(filters.timeframe);
    conditions.push(`signal.timeframe = $${values.length}`);

    if (filters.assetType) {
      values.push(filters.assetType);
      conditions.push(`signal.asset_type = $${values.length}`);
    }

    if (filters.exactScore !== undefined) {
      values.push(filters.exactScore);
      conditions.push(`signal.score = $${values.length}`);
    } else {
      if (filters.scoreMin !== undefined) {
        values.push(filters.scoreMin);
        conditions.push(`signal.score >= $${values.length}`);
      }

      if (filters.scoreMax !== undefined) {
        values.push(filters.scoreMax);
        conditions.push(`signal.score <= $${values.length}`);
      }
    }

    const result = await this.database.query<ScorePerformanceResearchRow>(
      `WITH filtered_signals AS (
        SELECT
          signal.id,
          signal.ticker,
          signal.timeframe,
          signal.score,
          signal.asset_type,
          signal.strategy_version
        FROM evidence_signals signal
        WHERE ${conditions.join(' AND ')}
      )
      SELECT
        signal.id,
        signal.ticker,
        signal.timeframe,
        signal.score,
        signal.asset_type,
        signal.strategy_version,
        evaluation.status,
        evaluation.max_favorable_excursion_percent,
        evaluation.max_adverse_excursion_percent,
        target.target_percent,
        target.outcome AS target_outcome
      FROM filtered_signals signal
      LEFT JOIN evidence_signal_evaluations evaluation ON evaluation.evidence_signal_id = signal.id
      LEFT JOIN evidence_target_evaluations target ON target.evidence_signal_id = signal.id
      ORDER BY signal.asset_type, signal.score DESC, signal.id`,
      values,
    );

    return result.rows;
  }
}

const normalizeFilters = (filters: ScorePerformanceResearchFilters): ScorePerformanceResearchFilters => ({
  ...filters,
  strategyVersion: filters.strategyVersion.trim() || 'v1',
  timeframe: filters.timeframe.trim().toLowerCase() || '15m',
  assetType: filters.assetType?.toUpperCase() as ScorePerformanceAssetType | undefined,
});

const buildSegment = (
  assetType: ScorePerformanceAssetType,
  strategyVersion: string,
  timeframe: string,
  signals: ScorePerformanceSignal[],
): ScorePerformanceSegment => {
  const groups = SCORE_GROUPS.reduce(
    (accumulator, group) => ({
      ...accumulator,
      [group.key]: summarizeGroup(
        strategyVersion,
        assetType,
        timeframe,
        group,
        filterSignalsForGroup(signals, group),
      ),
    }),
    {} as Record<ScorePerformanceGroupKey, ScorePerformanceGroupSummary>,
  );

  return {
    assetType,
    groups,
    comparison: compareGroups(groups['100'], groups['95-99']),
  };
};

const filterSignalsForGroup = (
  signals: ScorePerformanceSignal[],
  group: typeof SCORE_GROUPS[number],
): ScorePerformanceSignal[] => {
  if (group.exactScore !== undefined) {
    return signals.filter((signal) => signal.score === group.exactScore);
  }

  return signals.filter((signal) => signal.score >= (group.min ?? 0) && signal.score <= (group.max ?? 100));
};

const summarizeGroup = (
  strategyVersion: string,
  assetType: ScorePerformanceAssetType,
  timeframe: string,
  group: typeof SCORE_GROUPS[number],
  signals: ScorePerformanceSignal[],
): ScorePerformanceGroupSummary => ({
  strategyVersion,
  assetType,
  timeframe,
  ...(group.exactScore !== undefined
    ? { exactScore: group.exactScore }
    : { scoreRange: { min: group.min ?? 0, max: group.max ?? 0 } }),
  evidence: summarizeEvidence(signals),
  status: summarizeStatuses(signals),
  mfe: summarizeExcursions(signals.map((signal) => signal.mfe)),
  mae: summarizeExcursions(signals.map((signal) => signal.mae)),
  targetLadder: EXPERIMENTAL_TARGET_PERCENTS.map((targetPercent) => summarizeTarget(targetPercent, signals)),
});

const groupSignals = (rows: ScorePerformanceResearchRow[]): Map<string, ScorePerformanceSignal> => {
  const grouped = new Map<string, ScorePerformanceSignal>();

  for (const row of rows) {
    const assetType = row.asset_type;
    if (!assetType || !isSupportedAssetType(assetType)) {
      continue;
    }

    const existing = grouped.get(row.id) ?? {
      id: row.id,
      timeframe: row.timeframe,
      score: Number(row.score),
      assetType,
      strategyVersion: row.strategy_version,
      status: row.status,
      mfe: toNullableNumber(row.max_favorable_excursion_percent),
      mae: toNullableNumber(row.max_adverse_excursion_percent),
      targets: new Map<number, BacktestOutcome | null>(),
    };

    if (row.target_percent !== null) {
      existing.targets.set(Number(row.target_percent), row.target_outcome);
    }

    grouped.set(row.id, existing);
  }

  return grouped;
};

const summarizeEvidence = (signals: ScorePerformanceSignal[]): ScorePerformanceEvidenceSummary => {
  const evaluatedCount = signals.filter((signal) => signal.status !== null).length;
  const withoutEvaluationCount = signals.length - evaluatedCount;

  return {
    sampleSize: signals.length,
    evaluatedCount,
    withoutEvaluationCount,
    evaluationCoveragePct: rate(evaluatedCount, signals.length),
  };
};

const summarizeStatuses = (signals: ScorePerformanceSignal[]): ScorePerformanceStatusSummary => ({
  open: countStatuses(signals, 'OPEN'),
  partiallyResolved: countStatuses(signals, 'PARTIALLY_RESOLVED'),
  closed: countStatuses(signals, 'CLOSED'),
  expired: countStatuses(signals, 'EXPIRED'),
  ambiguous: countStatuses(signals, 'AMBIGUOUS'),
});

const summarizeExcursions = (values: Array<number | null>): ScorePerformanceExcursionSummary => {
  const numericValues = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right);

  return {
    sampleSize: numericValues.length,
    averagePct: average(numericValues),
    medianPct: percentile(numericValues, 0.5),
  };
};

const summarizeTarget = (
  targetPercent: number,
  signals: ScorePerformanceSignal[],
): ScorePerformanceTargetSummary => {
  const outcomes = signals.map((signal) => signal.targets.get(targetPercent) ?? null);
  const wins = countOutcomes(outcomes, 'WIN');
  const losses = countOutcomes(outcomes, 'LOSS');
  const expired = countOutcomes(outcomes, 'EXPIRED');
  const ambiguous = countOutcomes(outcomes, 'AMBIGUOUS');
  const unresolved = outcomes.filter((outcome) => outcome === null).length;
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
    reachRate: rate(wins + ambiguous, resolvedSampleSize),
  };
};

const compareGroups = (
  exactScoreGroup: ScorePerformanceGroupSummary,
  referenceGroup: ScorePerformanceGroupSummary,
): ScorePerformanceComparison => ({
  mfeAvgDelta_100_vs_95_99: delta(exactScoreGroup.mfe.averagePct, referenceGroup.mfe.averagePct),
  mfeMedianDelta_100_vs_95_99: delta(exactScoreGroup.mfe.medianPct, referenceGroup.mfe.medianPct),
  maeAvgDelta_100_vs_95_99: delta(exactScoreGroup.mae.averagePct, referenceGroup.mae.averagePct),
  maeMedianDelta_100_vs_95_99: delta(exactScoreGroup.mae.medianPct, referenceGroup.mae.medianPct),
  targets: exactScoreGroup.targetLadder.map((target) => {
    const referenceTarget = referenceGroup.targetLadder.find((item) => item.targetPercent === target.targetPercent);

    return {
      targetPercent: target.targetPercent,
      reachRateDelta_100_vs_95_99: delta(target.reachRate, referenceTarget?.reachRate ?? null),
      winRateDelta_100_vs_95_99: delta(target.winRate, referenceTarget?.winRate ?? null),
    };
  }),
});

const countStatuses = (signals: ScorePerformanceSignal[], status: SignalEvaluationStatus): number =>
  signals.filter((signal) => signal.status === status).length;

const countOutcomes = (outcomes: Array<BacktestOutcome | null>, outcome: BacktestOutcome): number =>
  outcomes.filter((value) => value === outcome).length;

const average = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
};

const percentile = (values: number[], percentileValue: number): number | null => {
  if (values.length === 0) {
    return null;
  }

  if (values.length === 1) {
    return round(values[0], 2);
  }

  const index = (values.length - 1) * percentileValue;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const weight = index - lowerIndex;
  const value = values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * weight;

  return round(value, 2);
};

const rate = (count: number, total: number): number | null =>
  total > 0 ? round((count / total) * 100, 2) : null;

const delta = (left: number | null, right: number | null): number | null =>
  left === null || right === null ? null : round(left - right, 2);

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const toNullableNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

const isSupportedAssetType = (value: string): value is ScorePerformanceAssetType =>
  ASSET_TYPES.includes(value as ScorePerformanceAssetType);
