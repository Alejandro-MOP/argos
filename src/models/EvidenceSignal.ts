import type { BacktestOutcome } from './BacktestTrade';
import type { SignalEvaluationStatus } from './ForwardSignal';
import type { SignalType } from './Signal';

export const EXPERIMENTAL_TARGET_PERCENTS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 5] as const;

export interface EvidenceSignalSnapshot {
  id?: string;
  ticker: string;
  providerSymbol?: string;
  timeframe: string;
  detectedAt: Date;
  signalType: SignalType;
  score: number;
  trendScore: number;
  volumeScore: number;
  momentumScore: number;
  structureScore: number;
  reasons: string[];
  entry: number;
  technicalStopPrice?: number;
  financialStopPercent: number;
  financialStopPrice: number;
  tp1Percent: number;
  tp1Price: number;
  tp2Percent: number;
  tp2Price: number;
  strategyVersion: string;
  assetType?: string;
  sector?: string;
  industry?: string;
  market?: string;
  isOperationalOpportunity: boolean;
}

export interface PersistedEvidenceSignalSnapshot extends EvidenceSignalSnapshot {
  id: string;
  createdAt: Date;
}

export interface EvidenceSignalFilters {
  evidenceSignalId?: string;
  ticker?: string;
  limit?: number;
}

export interface EvidenceSignalEvaluationSnapshot {
  id?: string;
  evidenceSignalId: string;
  outcomeTp1?: BacktestOutcome;
  outcomeTp2?: BacktestOutcome;
  exitAtTp1?: Date;
  exitAtTp2?: Date;
  candlesUntilTp1?: number;
  candlesUntilTp2?: number;
  maxFavorableExcursionPercent?: number;
  maxAdverseExcursionPercent?: number;
  evaluatedUntil?: Date;
  status: SignalEvaluationStatus;
}

export interface EvidenceTargetEvaluationSnapshot {
  id?: string;
  evidenceSignalId: string;
  targetPercent: number;
  targetPrice: number;
  outcome?: BacktestOutcome;
  hitAt?: Date;
  candlesUntil?: number;
}

export interface ForwardPerformanceFilters {
  ticker?: string;
  timeframe?: string;
  minimumScore?: number;
  maximumScore?: number;
  scoreBucket?: string;
  assetType?: string;
  sector?: string;
  industry?: string;
  strategyVersion?: string;
  from?: Date;
  to?: Date;
}

export interface PerformanceOutcomeSummary {
  wins: number;
  losses: number;
  expired: number;
  ambiguous: number;
  winRate: number | null;
}

export interface PerformanceTargetLadderSummary extends PerformanceOutcomeSummary {
  targetPercent: number;
  historicalForwardExpectancyPercent: number | null;
  profitFactor: number | null;
}

export interface ScoreBucketPerformanceSummary {
  minScore: number;
  maxScore: number;
  sampleSize: number;
  smallSample: boolean;
  tp1: PerformanceOutcomeSummary;
  tp2: PerformanceOutcomeSummary;
  averageMfePercent: number | null;
  medianMfePercent: number | null;
  averageMaePercent: number | null;
  medianMaePercent: number | null;
  expiredRate: number | null;
  ambiguousRate: number | null;
}

export interface ForwardPerformanceSummary {
  filters: Record<string, unknown>;
  sampleSize: number;
  smallSample: boolean;
  tp1: PerformanceOutcomeSummary;
  tp2: PerformanceOutcomeSummary;
  experimentalTargets: PerformanceTargetLadderSummary[];
  mfe: {
    average: number | null;
    median: number | null;
  };
  mae: {
    average: number | null;
    median: number | null;
  };
  expiredRate: number | null;
  ambiguousRate: number | null;
  scoreBuckets: ScoreBucketPerformanceSummary[];
  byTimeframe: Array<{ timeframe: string | null; sampleSize: number; smallSample: boolean; tp1WinRate: number | null; tp2WinRate: number | null }>;
  byTicker: Array<{ ticker: string | null; sampleSize: number; smallSample: boolean; tp1WinRate: number | null; tp2WinRate: number | null }>;
  byAssetType: Array<{ assetType: string | null; sampleSize: number; smallSample: boolean; tp1WinRate: number | null; tp2WinRate: number | null }>;
  bySector: Array<{ sector: string | null; sampleSize: number; smallSample: boolean; tp1WinRate: number | null; tp2WinRate: number | null }>;
  byIndustry: Array<{ industry: string | null; sampleSize: number; smallSample: boolean; tp1WinRate: number | null; tp2WinRate: number | null }>;
  byStrategyVersion: Array<{ strategyVersion: string | null; sampleSize: number; smallSample: boolean; tp1WinRate: number | null; tp2WinRate: number | null }>;
}
