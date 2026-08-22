import type { Opportunity } from '../models/Opportunity';
import type { Signal } from '../models/Signal';
import type { PerformanceSummary, SignalContext } from '../models/SignalContext';
import type {
  ForwardPerformanceProvider,
  HistoricalPerformanceProvider,
} from '../performance/PerformanceProviders';
import type { TradePlanConfig } from '../utils/tradeSizing.utils';

export interface SignalContextServiceConfig {
  backtestContextEnabled: boolean;
  backtestContextMonths: number;
  historicalMinimumScore: number;
  forwardTestContextEnabled: boolean;
  performanceMinSampleSize: number;
  tradePlan: TradePlanConfig;
}

export interface SignalContextServiceDependencies {
  historicalPerformanceProvider: HistoricalPerformanceProvider;
  forwardPerformanceProvider: ForwardPerformanceProvider;
}

export class SignalContextService {
  public constructor(
    private readonly dependencies: SignalContextServiceDependencies,
    private readonly config: SignalContextServiceConfig,
  ) {}

  public async buildContext(signal: Signal, opportunity: Opportunity): Promise<SignalContext> {
    void opportunity;

    const [historical, forward] = await Promise.all([
      this.getHistorical(signal),
      this.getForward(signal),
    ]);

    return {
      historicalEnabled: this.config.backtestContextEnabled,
      forwardEnabled: this.config.forwardTestContextEnabled,
      historical,
      forward,
    };
  }

  private async getHistorical(
    signal: Signal,
  ): Promise<PerformanceSummary | undefined> {
    if (!this.config.backtestContextEnabled) {
      return undefined;
    }

    const summary = await this.dependencies.historicalPerformanceProvider.getHistoricalPerformance({
      ticker: signal.ticker,
      timeframe: signal.timeframe,
      minimumScore: this.config.historicalMinimumScore,
      months: this.config.backtestContextMonths,
      tradePlan: this.config.tradePlan,
      referenceDate: signal.createdAt,
    });

    return this.withSampleWarning(summary);
  }

  private async getForward(signal: Signal): Promise<PerformanceSummary | undefined> {
    if (!this.config.forwardTestContextEnabled) {
      return undefined;
    }

    const summary = await this.dependencies.forwardPerformanceProvider.getForwardPerformance(signal);

    return this.withSampleWarning(summary);
  }

  private withSampleWarning(
    summary: PerformanceSummary | undefined,
  ): PerformanceSummary | undefined {
    if (!summary) {
      return undefined;
    }

    return {
      ...summary,
      insufficientData: summary.sampleSize < this.config.performanceMinSampleSize,
    };
  }
}
