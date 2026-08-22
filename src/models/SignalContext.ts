export interface PerformanceTargetSummary {
  targetPercent: number;
  wins: number;
  losses: number;
  winRate: number | null;
}

export interface PerformanceSummary {
  sampleSize: number;
  tp1: PerformanceTargetSummary;
  tp2: PerformanceTargetSummary;
  averageMfePercent?: number;
  averageMaePercent?: number;
  insufficientData?: boolean;
}

export interface SignalContext {
  historicalEnabled?: boolean;
  forwardEnabled?: boolean;
  historical?: PerformanceSummary;
  forward?: PerformanceSummary;
}
