import type { ForwardPerformanceSummary } from './EvidenceSignal';
import type { StrategyProfile, StrategyProfileSummary } from './StrategyProfile';

export interface ResearchSnapshotMetadata {
  snapshotDate: string;
  generatedAt: string;
  timeZone: string;
  strategyVersion: string;
}

export interface ResearchSnapshotDataQuality {
  evidenceCount: number;
  evaluationCount: number;
  evidenceWithoutEvaluationCount: number;
  evaluatedEvidenceCount: number;
  evidenceWithMfeMaeCount: number;
}

export type ResearchSnapshotScoreBucket = '80-84' | '85-89' | '90-94' | '95-100';

export type ResearchSnapshotScoreBuckets = Record<ResearchSnapshotScoreBucket, number>;

export interface ResearchSnapshotEvidenceSummary {
  totalEvidence: number;
  scoreBuckets: ResearchSnapshotScoreBuckets;
  operationalOpportunities: number;
  operationalThreshold: number;
}

export type ResearchSnapshotEvaluationStatuses = Record<string, number>;

export interface ResearchSnapshotProfileSampleSize {
  assetType: string;
  timeframe: string;
  scoreBucket: ResearchSnapshotScoreBucket;
  strategyVersion: string;
  sampleSize: number;
}

export interface ResearchSnapshotTargetLadderItem {
  targetPercent: number;
  wins: number;
  losses: number;
  expired: number;
  ambiguous: number;
  unresolved: number;
  resolvedSampleSize: number;
  winRate: number | null;
}

export interface ResearchSnapshotMfeMaeProfile {
  assetType: string;
  timeframe: string;
  scoreBucket: ResearchSnapshotScoreBucket;
  strategyVersion: string;
  sampleSize: number;
  avgMfePercent: number | null;
  medianMfePercent: number | null;
  avgMaePercent: number | null;
  medianMaePercent: number | null;
}

export interface ResearchSnapshotAggregates {
  dataQuality: ResearchSnapshotDataQuality;
  evidenceSummary: ResearchSnapshotEvidenceSummary;
  evaluationStatuses: ResearchSnapshotEvaluationStatuses;
  profileSampleSizes: ResearchSnapshotProfileSampleSize[];
  globalTargetLadder: ResearchSnapshotTargetLadderItem[];
  mfeMaeByProfile: ResearchSnapshotMfeMaeProfile[];
}

export interface ResearchSnapshot {
  schemaVersion: '1';
  snapshot: ResearchSnapshotMetadata;
  dataQuality: ResearchSnapshotDataQuality;
  evidenceSummary: ResearchSnapshotEvidenceSummary;
  evaluationStatuses: ResearchSnapshotEvaluationStatuses;
  profileSampleSizes: ResearchSnapshotProfileSampleSize[];
  globalTargetLadder: ResearchSnapshotTargetLadderItem[];
  mfeMaeByProfile: ResearchSnapshotMfeMaeProfile[];
  strategyProfiles: StrategyProfile[];
  strategyProfileSemantics: StrategyProfileSummary['semantics'];
  watchProfiles: StrategyProfile[];
  forwardPerformance: ForwardPerformanceSummary;
}

export interface ResearchSnapshotProvider {
  getAggregates(params: {
    strategyVersion: string;
    operationalThreshold: number;
  }): Promise<ResearchSnapshotAggregates>;
}
