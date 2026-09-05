export type PaperTradeStatus = 'OPEN' | 'CLOSED';
export type PaperTradeSignalType = 'LONG';
export type PaperTradeLevelType =
  | 'REFERENCE_FAVORABLE'
  | 'REFERENCE_ADVERSE'
  | 'PROFIT_LEVEL'
  | 'RISK_LEVEL'
  | 'STOP_LOSS';
export type PaperTradeUserAction = 'CONTINUE' | 'CLOSE';
export type PaperTradeExitReason = 'MANUAL_TELEGRAM';

export interface PaperStrategyConfig {
  paperStrategyVersion: string;
  strategyVersion: string;
  assetType: 'STOCK';
  timeframe: '5m';
  score: 100;
  signalType: PaperTradeSignalType;
  referenceSnapshotDate: string;
  mfeReferencePct: number;
  maeReferencePct: number;
  favorableFollowUpLevelsPct: number[];
}

export interface PaperTradeLevelSnapshot {
  id?: string;
  paperTradeId?: string;
  type: PaperTradeLevelType;
  levelPct: number;
  levelPrice: number;
  triggeredAt?: Date;
  userAction?: PaperTradeUserAction;
  userActionAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaperTradeSnapshot {
  id?: string;
  evidenceSignalId?: string;
  ticker: string;
  assetType: 'STOCK';
  timeframe: '5m';
  score: 100;
  entryPrice: number;
  entryAt: Date;
  status: PaperTradeStatus;
  strategyVersion: string;
  paperStrategyVersion: string;
  referenceSnapshotDate: string;
  mfeReferencePct: number;
  maeReferencePct: number;
  currentMfePct: number;
  currentMaePct: number;
  highestPriceSeen: number;
  lowestPriceSeen: number;
  exitPrice?: number;
  exitAt?: Date;
  exitReason?: PaperTradeExitReason;
  createdAt?: Date;
  updatedAt?: Date;
  levels?: PaperTradeLevelSnapshot[];
}

export interface CreatePaperTradeInput {
  evidenceSignalId?: string;
  ticker: string;
  assetType: string;
  timeframe: string;
  score: number;
  strategyVersion: string;
  entryPrice: number;
  entryAt?: Date;
}

export interface PaperTradeMonitorMetrics {
  openTrades: number;
  uniqueTickers: number;
  pricesFetched: number;
  levelsEvaluated: number;
  levelsTriggered: number;
  telegramAlertsSent: number;
  errors: number;
  durationMs: number;
}
