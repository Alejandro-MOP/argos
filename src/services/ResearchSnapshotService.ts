import type { ForwardPerformanceFilters } from '../models/EvidenceSignal';
import type { ResearchSnapshot, ResearchSnapshotProvider } from '../models/ResearchSnapshot';
import type { StrategyProfile, StrategyProfileFilters } from '../models/StrategyProfile';
import type { PostgresForwardPerformanceProvider } from '../performance/PostgresForwardPerformanceProvider';
import type { PostgresStrategyProfileProvider } from '../research/PostgresStrategyProfileProvider';

interface ResearchSnapshotServiceOptions {
  timeZone: string;
  strategyVersion: string;
  operationalThreshold: number;
}

const WATCH_PROFILE_KEYS = new Set([
  'STOCK|1m|90-94|v1',
  'STOCK|5m|95-100|v1',
  'CRYPTO|5m|90-94|v1',
  'CRYPTO|15m|90-94|v1',
]);

export class ResearchSnapshotService {
  public constructor(
    private readonly snapshotProvider: ResearchSnapshotProvider,
    private readonly strategyProfileProvider: Pick<PostgresStrategyProfileProvider, 'getProfiles'>,
    private readonly forwardPerformanceProvider: Pick<PostgresForwardPerformanceProvider, 'getPerformance'>,
    private readonly options: ResearchSnapshotServiceOptions,
  ) {}

  public async generate(now: Date = new Date()): Promise<ResearchSnapshot> {
    const strategyVersion = this.options.strategyVersion;
    const [aggregates, strategyProfileSummary, forwardPerformance] = await Promise.all([
      this.snapshotProvider.getAggregates({
        strategyVersion,
        operationalThreshold: this.options.operationalThreshold,
      }),
      this.strategyProfileProvider.getProfiles(this.strategyProfileFilters(strategyVersion)),
      this.forwardPerformanceProvider.getPerformance(this.forwardPerformanceFilters(strategyVersion)),
    ]);

    return {
      schemaVersion: '1',
      snapshot: {
        snapshotDate: formatDateInTimeZone(now, this.options.timeZone),
        generatedAt: now.toISOString(),
        timeZone: this.options.timeZone,
        strategyVersion,
      },
      dataQuality: aggregates.dataQuality,
      evidenceSummary: aggregates.evidenceSummary,
      evaluationStatuses: aggregates.evaluationStatuses,
      profileSampleSizes: aggregates.profileSampleSizes,
      globalTargetLadder: aggregates.globalTargetLadder,
      mfeMaeByProfile: aggregates.mfeMaeByProfile,
      strategyProfiles: strategyProfileSummary.profiles,
      strategyProfileSemantics: strategyProfileSummary.semantics,
      watchProfiles: selectWatchProfiles(strategyProfileSummary.profiles),
      forwardPerformance,
    };
  }

  private strategyProfileFilters(strategyVersion: string): StrategyProfileFilters {
    return { strategyVersion };
  }

  private forwardPerformanceFilters(strategyVersion: string): ForwardPerformanceFilters {
    return { strategyVersion };
  }
}

export const selectWatchProfiles = (profiles: StrategyProfile[]): StrategyProfile[] =>
  profiles.filter((profile) =>
    WATCH_PROFILE_KEYS.has(
      [profile.assetType, profile.timeframe, profile.scoreBucket, profile.strategyVersion].join('|'),
    ),
  );

export const formatDateInTimeZone = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
};
