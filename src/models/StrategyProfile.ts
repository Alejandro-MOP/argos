import type { BacktestOutcome } from './BacktestTrade';
import type { SignalEvaluationStatus } from './ForwardSignal';

export type StrategyProfileDataMaturity = 'INSUFFICIENT' | 'EARLY' | 'DEVELOPING' | 'MATURE';

export type StrategyProfileScoreBucket = '80-84' | '85-89' | '90-94' | '95-100';

export interface StrategyProfileFilters {
  assetType?: string;
  timeframe?: string;
  scoreBucket?: StrategyProfileScoreBucket;
  strategyVersion?: string;
  minimumSampleSize?: number;
}

export interface StrategyProfileStatusDistribution {
  open: number;
  partiallyResolved: number;
  closed: number;
  expired: number;
  ambiguous: number;
}

export interface StrategyProfileExcursionStats {
  average: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
}

export interface StrategyProfileTargetSummary {
  targetPercent: number;
  wins: number;
  losses: number;
  expired: number;
  ambiguous: number;
  unresolved: number;
  resolvedTargetSampleSize: number;
  winRate: number | null;
  reachedCount: number;
  eligibleSampleSize: number;
  reachRate: number | null;
}

export interface StrategyProfileSanityAnomaly {
  evidenceSignalId: string;
  ticker: string;
  timeframe: string;
  strategyVersion: string;
  lowerTargetPercent: number;
  lowerTargetOutcome: BacktestOutcome | null;
  higherTargetPercent: number;
  higherTargetOutcome: BacktestOutcome;
  reason: 'higher-target-reached-before-lower-target';
}

export interface StrategyProfile {
  assetType: string;
  timeframe: string;
  scoreBucket: StrategyProfileScoreBucket;
  strategyVersion: string;
  sampleSize: number;
  resolvedSignalSampleSize: number;
  dataMaturity: StrategyProfileDataMaturity;
  statusDistribution: StrategyProfileStatusDistribution;
  mfe: StrategyProfileExcursionStats;
  mae: StrategyProfileExcursionStats;
  experimentalTargets: StrategyProfileTargetSummary[];
  sanity: {
    anomalyCount: number;
    anomalies: StrategyProfileSanityAnomaly[];
  };
}

export interface StrategyProfileSummary {
  filters: Record<string, unknown>;
  semantics: {
    tradeOutcome: string;
    marketReachability: string;
    dataMaturity: string;
    maePercentiles: string;
  };
  profiles: StrategyProfile[];
}

export interface StrategyProfileEvidenceRow {
  id: string;
  ticker: string;
  timeframe: string;
  score: string | number;
  asset_type: string | null;
  strategy_version: string;
  status: SignalEvaluationStatus | null;
  max_favorable_excursion_percent: string | number | null;
  max_adverse_excursion_percent: string | number | null;
  target_percent: string | number | null;
  target_outcome: BacktestOutcome | null;
}
