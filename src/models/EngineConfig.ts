export type EngineConfigValueType = 'string' | 'number' | 'boolean' | 'json';

export interface EngineConfigEntry {
  key: string;
  value: string;
  valueType: EngineConfigValueType;
  category: string;
  description: string;
  isActive: boolean;
}

export interface EngineRuntimeConfig {
  strategyVersion: string;
  marketScanCandleLimit: number;
  marketDataMaxAgeMinutes: number;
  marketDataRequestDelayMs: number;
  marketDataMaxConcurrency: number;
  marketDataBatchDelayMs: number;
  marketDataMaxRetries: number;
  marketDataRetryBaseDelayMs: number;
  marketDataSequential: boolean;
  tradePlan: {
    stopLossPercent: number;
    targetMinPercent: number;
    targetMaxPercent: number;
  };
  signalIntelligence: {
    backtestContextEnabled: boolean;
    backtestContextMonths: number;
    performanceMinSampleSize: number;
    forwardTestContextEnabled: boolean;
  };
  scoring: {
    maxAnalyzerScore: number;
    opportunityMinScore: number;
    telegramNotificationMinScore: number;
    duplicateWindowMinutes: number;
    emaFastPeriod: number;
    emaSlowPeriod: number;
    volumeLookbackPeriod: number;
    volumeStrongRatio: number;
    volumeModerateRatio: number;
    volumeWeakRatio: number;
    rsiPeriod: number;
    rsiIdealMin: number;
    rsiIdealMax: number;
    rsiNeutralMin: number;
    rsiNeutralMax: number;
    rsiExtendedMax: number;
    structureLookbackPeriod: number;
  };
}

export type EngineConfigSource = 'postgres' | 'env-fallback';

export interface EngineConfigSnapshot {
  source: EngineConfigSource;
  values: EngineRuntimeConfig;
}
