import type { PaperStrategyConfig } from '../models/PaperTrade';

export const PAPER_STRATEGY_V0_1: PaperStrategyConfig = {
  paperStrategyVersion: 'paper-v0.1',
  strategyVersion: 'v1',
  assetType: 'STOCK',
  timeframe: '5m',
  score: 100,
  signalType: 'LONG',
  referenceSnapshotDate: '2026-09-05',
  mfeReferencePct: 0.89,
  maeReferencePct: -1.05,
  favorableFollowUpLevelsPct: [1.5, 2, 3, 5],
};

export const isPaperStrategyV01Eligible = (input: {
  assetType?: string;
  timeframe?: string;
  score?: number;
  strategyVersion?: string;
  signalType?: string;
}): boolean =>
  input.assetType?.toUpperCase() === PAPER_STRATEGY_V0_1.assetType &&
  input.timeframe?.toLowerCase() === PAPER_STRATEGY_V0_1.timeframe &&
  input.score === PAPER_STRATEGY_V0_1.score &&
  (input.strategyVersion ?? PAPER_STRATEGY_V0_1.strategyVersion) === PAPER_STRATEGY_V0_1.strategyVersion &&
  (input.signalType ?? PAPER_STRATEGY_V0_1.signalType) === PAPER_STRATEGY_V0_1.signalType;
