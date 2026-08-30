import type { Queryable } from '../db/postgres';
import type { ForwardPerformanceSummary } from '../models/EvidenceSignal';
import type { ResearchSnapshot } from '../models/ResearchSnapshot';
import type { StrategyProfileSummary } from '../models/StrategyProfile';
import type { PostgresForwardPerformanceProvider } from '../performance/PostgresForwardPerformanceProvider';
import type { PostgresStrategyProfileProvider } from '../research/PostgresStrategyProfileProvider';
import type { ResearchSnapshotService } from './ResearchSnapshotService';

export interface TelegramControlSystemStatus {
  controlBot: 'ONLINE';
  database: 'CONNECTED' | 'UNAVAILABLE';
  researchServices: 'AVAILABLE' | 'UNAVAILABLE';
  mode: 'Local Development';
  controlTransport: 'Telegram Long Polling';
}

export interface TelegramControlReadOnlyQueryDependencies {
  researchSnapshotService?: Pick<ResearchSnapshotService, 'generate'>;
  strategyProfileProvider?: Pick<PostgresStrategyProfileProvider, 'getProfiles'>;
  forwardPerformanceProvider?: Pick<PostgresForwardPerformanceProvider, 'getPerformance'>;
  database?: Pick<Queryable, 'query'>;
}

export class TelegramControlReadOnlyQueryService {
  public constructor(private readonly dependencies: TelegramControlReadOnlyQueryDependencies) {}

  public async getResearchSnapshot(): Promise<ResearchSnapshot> {
    if (!this.dependencies.researchSnapshotService) {
      throw new TelegramControlReadOnlyQueryUnavailableError('Research Snapshot');
    }

    return this.dependencies.researchSnapshotService.generate();
  }

  public async getStrategyProfiles(): Promise<StrategyProfileSummary> {
    if (!this.dependencies.strategyProfileProvider) {
      throw new TelegramControlReadOnlyQueryUnavailableError('Strategy Profiles');
    }

    return this.dependencies.strategyProfileProvider.getProfiles();
  }

  public async getForwardPerformance(): Promise<ForwardPerformanceSummary> {
    if (!this.dependencies.forwardPerformanceProvider) {
      throw new TelegramControlReadOnlyQueryUnavailableError('Forward Performance');
    }

    return this.dependencies.forwardPerformanceProvider.getPerformance();
  }

  public async getSystemStatus(): Promise<TelegramControlSystemStatus> {
    const databaseStatus = await this.checkDatabase();

    return {
      controlBot: 'ONLINE',
      database: databaseStatus,
      researchServices: this.areResearchServicesAvailable() ? 'AVAILABLE' : 'UNAVAILABLE',
      mode: 'Local Development',
      controlTransport: 'Telegram Long Polling',
    };
  }

  private async checkDatabase(): Promise<TelegramControlSystemStatus['database']> {
    if (!this.dependencies.database) {
      return 'UNAVAILABLE';
    }

    try {
      await this.dependencies.database.query('SELECT 1');
      return 'CONNECTED';
    } catch {
      return 'UNAVAILABLE';
    }
  }

  private areResearchServicesAvailable(): boolean {
    return Boolean(
      this.dependencies.researchSnapshotService &&
        this.dependencies.strategyProfileProvider &&
        this.dependencies.forwardPerformanceProvider,
    );
  }
}

export class TelegramControlReadOnlyQueryUnavailableError extends Error {
  public constructor(feature: string) {
    super(`${feature} read-only query is unavailable.`);
    this.name = 'TelegramControlReadOnlyQueryUnavailableError';
  }
}
