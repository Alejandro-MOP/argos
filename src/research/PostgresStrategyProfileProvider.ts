import { EXPERIMENTAL_TARGET_PERCENTS } from '../models/EvidenceSignal';
import type { BacktestOutcome } from '../models/BacktestTrade';
import type { SignalEvaluationStatus } from '../models/ForwardSignal';
import type {
  StrategyProfile,
  StrategyProfileDataMaturity,
  StrategyProfileEvidenceRow,
  StrategyProfileExcursionStats,
  StrategyProfileFilters,
  StrategyProfileSanityAnomaly,
  StrategyProfileScoreBucket,
  StrategyProfileStatusDistribution,
  StrategyProfileSummary,
  StrategyProfileTargetSummary,
} from '../models/StrategyProfile';
import type { Queryable } from '../db/postgres';

interface ProfileSignal {
  id: string;
  ticker: string;
  timeframe: string;
  score: number;
  assetType: string;
  strategyVersion: string;
  status: SignalEvaluationStatus | null;
  mfe: number | null;
  mae: number | null;
  targets: Map<number, BacktestOutcome | null>;
}

const SCORE_BUCKETS: Array<{ label: StrategyProfileScoreBucket; min: number; max: number }> = [
  { label: '80-84', min: 80, max: 85 },
  { label: '85-89', min: 85, max: 90 },
  { label: '90-94', min: 90, max: 95 },
  { label: '95-100', min: 95, max: 100.0000001 },
];

const TERMINAL_SIGNAL_STATUSES = new Set<SignalEvaluationStatus>(['CLOSED', 'EXPIRED', 'AMBIGUOUS']);
const REACHED_OUTCOMES = new Set<BacktestOutcome>(['WIN', 'AMBIGUOUS']);

export class PostgresStrategyProfileProvider {
  public constructor(private readonly database: Queryable) {}

  public async getProfiles(filters: StrategyProfileFilters = {}): Promise<StrategyProfileSummary> {
    const rows = await this.fetchRows(filters);
    const signals = groupSignals(rows);
    const profiles = buildProfiles([...signals.values()], filters.minimumSampleSize);

    return {
      filters: serializeFilters(filters),
      semantics: {
        tradeOutcome:
          'winRate = wins / (wins + losses). EXPIRED and AMBIGUOUS are reported separately and excluded from trade win/loss rate.',
        marketReachability:
          'reachRate = (wins + ambiguous) / (wins + losses + expired + ambiguous). NULL outcomes are unresolved and excluded from the denominator.',
        dataMaturity:
          'MATURE means there is enough data for more serious analysis; it does not mean statistically validated, profitable, or ready for real trading.',
        maePercentiles:
          'MAE keeps its real negative sign. Percentiles are calculated over negative values, so p25/p75 can look visually inverted compared with positive MFE.',
      },
      profiles,
    };
  }

  private async fetchRows(filters: StrategyProfileFilters): Promise<StrategyProfileEvidenceRow[]> {
    const values: unknown[] = [];
    const conditions = ['signal.score >= 80', 'signal.excluded_from_research = false'];

    if (filters.assetType) {
      values.push(filters.assetType.toUpperCase());
      conditions.push(`signal.asset_type = $${values.length}`);
    }

    if (filters.timeframe) {
      values.push(filters.timeframe.toLowerCase());
      conditions.push(`signal.timeframe = $${values.length}`);
    }

    if (filters.strategyVersion) {
      values.push(filters.strategyVersion);
      conditions.push(`signal.strategy_version = $${values.length}`);
    }

    const bucket = filters.scoreBucket ? findScoreBucket(filters.scoreBucket) : undefined;
    if (bucket) {
      values.push(bucket.min);
      conditions.push(`signal.score >= $${values.length}`);
      values.push(bucket.max);
      const operator = bucket.label === '95-100' ? '<=' : '<';
      conditions.push(`signal.score ${operator} $${values.length}`);
    }

    const result = await this.database.query<StrategyProfileEvidenceRow>(
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
      ORDER BY signal.asset_type, signal.timeframe, signal.strategy_version, signal.score DESC`,
      values,
    );

    return result.rows;
  }
}

const buildProfiles = (
  signals: ProfileSignal[],
  minimumSampleSize: number | undefined,
): StrategyProfile[] => {
  const grouped = new Map<string, ProfileSignal[]>();

  for (const signal of signals) {
    const bucket = scoreBucketFor(signal.score);
    if (!bucket) {
      continue;
    }

    const key = [signal.assetType, signal.timeframe, bucket, signal.strategyVersion].join('|');
    grouped.set(key, [...(grouped.get(key) ?? []), signal]);
  }

  return [...grouped.entries()]
    .map(([key, profileSignals]) => {
      const [assetType, timeframe, scoreBucket, strategyVersion] = key.split('|') as [
        string,
        string,
        StrategyProfileScoreBucket,
        string,
      ];
      const resolvedSignalSampleSize = profileSignals.filter((signal) =>
        signal.status ? TERMINAL_SIGNAL_STATUSES.has(signal.status) : false,
      ).length;

      return {
        assetType,
        timeframe,
        scoreBucket,
        strategyVersion,
        sampleSize: profileSignals.length,
        resolvedSignalSampleSize,
        dataMaturity: resolveDataMaturity(profileSignals.length, resolvedSignalSampleSize),
        statusDistribution: summarizeStatuses(profileSignals),
        mfe: summarizeExcursions(profileSignals.map((signal) => signal.mfe)),
        mae: summarizeExcursions(profileSignals.map((signal) => signal.mae)),
        experimentalTargets: EXPERIMENTAL_TARGET_PERCENTS.map((targetPercent) =>
          summarizeTarget(targetPercent, profileSignals),
        ),
        sanity: summarizeSanity(profileSignals),
      };
    })
    .filter((profile) => profile.sampleSize >= (minimumSampleSize ?? 0))
    .sort(sortProfiles);
};

const groupSignals = (rows: StrategyProfileEvidenceRow[]): Map<string, ProfileSignal> => {
  const grouped = new Map<string, ProfileSignal>();

  for (const row of rows) {
    const existing = grouped.get(row.id) ?? {
      id: row.id,
      ticker: row.ticker,
      timeframe: row.timeframe,
      score: Number(row.score),
      assetType: row.asset_type ?? 'UNKNOWN',
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

const summarizeStatuses = (signals: ProfileSignal[]): StrategyProfileStatusDistribution => ({
  open: countStatuses(signals, 'OPEN'),
  partiallyResolved: countStatuses(signals, 'PARTIALLY_RESOLVED'),
  closed: countStatuses(signals, 'CLOSED'),
  expired: countStatuses(signals, 'EXPIRED'),
  ambiguous: countStatuses(signals, 'AMBIGUOUS'),
});

const summarizeExcursions = (values: Array<number | null>): StrategyProfileExcursionStats => {
  const numericValues = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right);

  return {
    average: average(numericValues),
    median: percentile(numericValues, 0.5),
    p25: percentile(numericValues, 0.25),
    p75: percentile(numericValues, 0.75),
    p90: percentile(numericValues, 0.9),
  };
};

const summarizeTarget = (
  targetPercent: number,
  signals: ProfileSignal[],
): StrategyProfileTargetSummary => {
  const outcomes = signals.map((signal) => signal.targets.get(targetPercent) ?? null);
  const wins = countOutcomes(outcomes, 'WIN');
  const losses = countOutcomes(outcomes, 'LOSS');
  const expired = countOutcomes(outcomes, 'EXPIRED');
  const ambiguous = countOutcomes(outcomes, 'AMBIGUOUS');
  const unresolved = outcomes.filter((outcome) => outcome === null).length;
  const resolvedTargetSampleSize = wins + losses + expired + ambiguous;
  const reachedCount = wins + ambiguous;

  return {
    targetPercent,
    wins,
    losses,
    expired,
    ambiguous,
    unresolved,
    resolvedTargetSampleSize,
    winRate: rate(wins, wins + losses),
    reachedCount,
    eligibleSampleSize: resolvedTargetSampleSize,
    reachRate: rate(reachedCount, resolvedTargetSampleSize),
  };
};

const summarizeSanity = (signals: ProfileSignal[]): StrategyProfile['sanity'] => {
  const anomalies = signals.flatMap(findSignalTargetAnomalies).slice(0, 20);
  const anomalyCount = signals.reduce((count, signal) => count + findSignalTargetAnomalies(signal).length, 0);

  return {
    anomalyCount,
    anomalies,
  };
};

const findSignalTargetAnomalies = (signal: ProfileSignal): StrategyProfileSanityAnomaly[] => {
  const anomalies: StrategyProfileSanityAnomaly[] = [];
  const targets = [...signal.targets.entries()]
    .filter(([, outcome]) => outcome !== null)
    .sort(([left], [right]) => left - right);

  for (const [higherTargetPercent, higherTargetOutcome] of targets) {
    if (!higherTargetOutcome || !REACHED_OUTCOMES.has(higherTargetOutcome)) {
      continue;
    }

    for (const [lowerTargetPercent, lowerTargetOutcome] of targets) {
      if (lowerTargetPercent >= higherTargetPercent) {
        break;
      }

      if (!lowerTargetOutcome || !REACHED_OUTCOMES.has(lowerTargetOutcome)) {
        anomalies.push({
          evidenceSignalId: signal.id,
          ticker: signal.ticker,
          timeframe: signal.timeframe,
          strategyVersion: signal.strategyVersion,
          lowerTargetPercent,
          lowerTargetOutcome,
          higherTargetPercent,
          higherTargetOutcome,
          reason: 'higher-target-reached-before-lower-target',
        });
      }
    }
  }

  return anomalies;
};

const resolveDataMaturity = (
  sampleSize: number,
  resolvedSignalSampleSize: number,
): StrategyProfileDataMaturity => {
  if (sampleSize >= 150 && resolvedSignalSampleSize >= 60) {
    return 'MATURE';
  }

  if (sampleSize >= 75 && resolvedSignalSampleSize >= 30) {
    return 'DEVELOPING';
  }

  if (sampleSize >= 30 && resolvedSignalSampleSize >= 10) {
    return 'EARLY';
  }

  return 'INSUFFICIENT';
};

const scoreBucketFor = (score: number): StrategyProfileScoreBucket | undefined =>
  SCORE_BUCKETS.find((bucket) =>
    bucket.label === '95-100'
      ? score >= bucket.min && score <= bucket.max
      : score >= bucket.min && score < bucket.max,
  )?.label;

const findScoreBucket = (scoreBucket: StrategyProfileScoreBucket): typeof SCORE_BUCKETS[number] | undefined =>
  SCORE_BUCKETS.find((bucket) => bucket.label === scoreBucket);

const countStatuses = (signals: ProfileSignal[], status: SignalEvaluationStatus): number =>
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

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const toNullableNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

const serializeFilters = (filters: StrategyProfileFilters): Record<string, unknown> => ({ ...filters });

const sortProfiles = (left: StrategyProfile, right: StrategyProfile): number =>
  left.assetType.localeCompare(right.assetType) ||
  left.timeframe.localeCompare(right.timeframe) ||
  left.strategyVersion.localeCompare(right.strategyVersion) ||
  left.scoreBucket.localeCompare(right.scoreBucket);
