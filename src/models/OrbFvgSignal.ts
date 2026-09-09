import type { AssetType } from './MarketSymbol';

export const ORB_FVG_EXPERIMENT_VERSION_V1 = 'orb-fvg-v0.1';
export const ORB_FVG_EXPERIMENT_VERSION_V2 = 'orb-fvg-v0.2';
export const ORB_FVG_EXPERIMENT_VERSION_V3 = 'orb-fvg-v0.3';
export const ORB_FVG_EXPERIMENT_VERSION = ORB_FVG_EXPERIMENT_VERSION_V3;
export const ORB_FVG_R_LEVELS = [0.5, 1, 1.5, 2, 3] as const;

export type OrbFvgDirection = 'LONG' | 'SHORT';
export type OrbFvgStatus = 'OPEN' | 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'EXPIRED';
export type OrbFvgOutcome = Exclude<OrbFvgStatus, 'OPEN'>;
export type OrbFvgResearchState =
  | 'WAITING_FOR_OR'
  | 'OR_READY'
  | 'WAITING_FOR_BREAKOUT'
  | 'BREAKOUT_CONFIRMED'
  | 'WAITING_FOR_FVG'
  | 'FVG_CREATED'
  | 'WAITING_FOR_RETEST'
  | 'FVG_RETESTED'
  | 'WAITING_FOR_STRUCTURE_BREAK'
  | 'PRE_RETRACE_HIGH_BROKEN'
  | 'WAITING_FOR_CONTINUATION'
  | 'CONTINUATION_CONFIRMED'
  | 'TRADE_READY'
  | 'EXPIRED_SETUP'
  | 'INVALIDATED_SETUP';

export interface OrbFvgCandleSnapshot {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface OrbFvgSignalSnapshot {
  id?: string;
  experimentVersion: string;
  ticker: string;
  providerSymbol: string;
  assetType: Extract<AssetType, 'STOCK' | 'ETF'>;
  sector?: string;
  industry?: string;
  market?: string;
  exchange?: string;
  sessionDate: string;
  direction: OrbFvgDirection;
  openingRangeCandle: OrbFvgCandleSnapshot;
  openingRangeSizePct: number;
  breakoutAt: Date;
  breakoutCandle: OrbFvgCandleSnapshot;
  breakoutDistancePct: number;
  wickBreakout: boolean;
  closeBreakout: boolean;
  fvgCandle1: OrbFvgCandleSnapshot;
  fvgCandle2: OrbFvgCandleSnapshot;
  fvgCandle3: OrbFvgCandleSnapshot;
  fvgLow: number;
  fvgHigh: number;
  fvgMidpoint?: number;
  fvgSizePct: number;
  candlesAfterBreakout: number;
  signalAt: Date;
  orbFvgState?: OrbFvgResearchState;
  setupTimeframe?: string;
  scannerRunAt?: Date;
  detectedAt?: Date;
  detectionLagSeconds?: number;
  retestCount?: number;
  firstRetestAt?: Date;
  latestRetestAt?: Date;
  retestCandleTimestamp?: Date;
  retestLow?: number;
  retestHigh?: number;
  retestClose?: number;
  retestDepthPct?: number;
  preRetraceHigh?: number;
  preRetraceHighTimestamp?: Date;
  structureBreakCandleTimestamp?: Date;
  structureBreakOpen?: number;
  structureBreakHigh?: number;
  structureBreakLow?: number;
  structureBreakClose?: number;
  continuationCandleTimestamp?: Date;
  continuationOpen?: number;
  continuationHigh?: number;
  continuationLow?: number;
  continuationClose?: number;
  setupReadyAt?: Date;
  expiredAt?: Date;
  entryPrice?: number;
  stopPrice?: number;
  risk?: number;
  riskPct?: number;
  target2RPrice?: number;
  status: OrbFvgStatus;
  outcome?: OrbFvgOutcome;
  highestPriceSeen: number;
  lowestPriceSeen: number;
  mfePct: number;
  maePct: number;
  maxR: number;
  targetReachedAt?: Date;
  stopReachedAt?: Date;
  resolvedAt?: Date;
  telegramAlertSent: boolean;
}

export interface PersistedOrbFvgSignalSnapshot extends OrbFvgSignalSnapshot {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrbFvgSignalLevelSnapshot {
  id?: string;
  orbFvgSignalId: string;
  rMultiple: number;
  levelPrice: number;
  triggeredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrbFvgSignalFilters {
  sessionDate?: string;
  ticker?: string;
  assetType?: 'STOCK' | 'ETF';
  direction?: OrbFvgDirection;
  status?: OrbFvgStatus;
  experimentVersion?: string;
  limit?: number;
}

export interface OrbFvgSignalWithLevels {
  signal: PersistedOrbFvgSignalSnapshot;
  levels: OrbFvgSignalLevelSnapshot[];
}
