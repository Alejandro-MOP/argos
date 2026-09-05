import type { BacktestOutcome } from './BacktestTrade';
import type { SignalEvaluationStatus } from './ForwardSignal';

export type ScorePerformanceAssetType = 'STOCK' | 'ETF' | 'CRYPTO';
export type ScorePerformanceGroupKey = '90-94' | '95-99' | '100';

export interface ScorePerformanceResearchFilters {
  strategyVersion: string;
  timeframe: string;
  assetType?: ScorePerformanceAssetType;
  scoreMin?: number;
  scoreMax?: number;
  exactScore?: number;
}

export interface ScorePerformanceEvidenceSummary {
  sampleSize: number;
  evaluatedCount: number;
  withoutEvaluationCount: number;
  evaluationCoveragePct: number | null;
}

export interface ScorePerformanceStatusSummary {
  open: number;
  partiallyResolved: number;
  closed: number;
  expired: number;
  ambiguous: number;
}

export interface ScorePerformanceExcursionSummary {
  sampleSize: number;
  averagePct: number | null;
  medianPct: number | null;
}

export interface ScorePerformanceTargetSummary {
  targetPercent: number;
  wins: number;
  losses: number;
  expired: number;
  ambiguous: number;
  unresolved: number;
  resolvedSampleSize: number;
  winRate: number | null;
  reachRate: number | null;
}

export interface ScorePerformanceGroupSummary {
  strategyVersion: string;
  assetType: ScorePerformanceAssetType;
  timeframe: string;
  scoreRange?: {
    min: number;
    max: number;
  };
  exactScore?: number;
  evidence: ScorePerformanceEvidenceSummary;
  status: ScorePerformanceStatusSummary;
  mfe: ScorePerformanceExcursionSummary;
  mae: ScorePerformanceExcursionSummary;
  targetLadder: ScorePerformanceTargetSummary[];
}

export interface ScorePerformanceTargetDelta {
  targetPercent: number;
  reachRateDelta_100_vs_95_99: number | null;
  winRateDelta_100_vs_95_99: number | null;
}

export interface ScorePerformanceComparison {
  mfeAvgDelta_100_vs_95_99: number | null;
  mfeMedianDelta_100_vs_95_99: number | null;
  maeAvgDelta_100_vs_95_99: number | null;
  maeMedianDelta_100_vs_95_99: number | null;
  targets: ScorePerformanceTargetDelta[];
}

export interface ScorePerformanceSegment {
  assetType: ScorePerformanceAssetType;
  groups: Record<ScorePerformanceGroupKey, ScorePerformanceGroupSummary>;
  comparison: ScorePerformanceComparison;
}

export interface ScorePerformanceResearchResult {
  strategyVersion: string;
  timeframe: string;
  semantics: {
    researchOnly: string;
    evidenceEligibility: string;
    winRate: string;
    reachRate: string;
    unresolved: string;
    comparison: string;
  };
  segments: ScorePerformanceSegment[];
}

export interface ScorePerformanceResearchRow {
  id: string;
  ticker: string;
  timeframe: string;
  score: string | number;
  asset_type: ScorePerformanceAssetType | null;
  strategy_version: string;
  status: SignalEvaluationStatus | null;
  max_favorable_excursion_percent: string | number | null;
  max_adverse_excursion_percent: string | number | null;
  target_percent: string | number | null;
  target_outcome: BacktestOutcome | null;
}
