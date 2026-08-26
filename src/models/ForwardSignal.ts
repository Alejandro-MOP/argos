import type { BacktestOutcome } from './BacktestTrade';
import type { SignalType } from './Signal';

export interface ForwardSignalSnapshot {
  id?: string;
  ticker: string;
  timeframe: string;
  signalType: SignalType;
  signalAt: Date;
  score: number;
  trendScore: number;
  volumeScore: number;
  momentumScore: number;
  structureScore: number;
  entry: number;
  technicalStopPrice?: number;
  financialStopPercent: number;
  financialStopPrice: number;
  tp1Percent: number;
  tp1Price: number;
  tp2Percent: number;
  tp2Price: number;
  telegramSent: boolean;
}

export interface PersistedForwardSignalSnapshot extends ForwardSignalSnapshot {
  id: string;
}

export type SignalEvaluationStatus = 'OPEN' | 'PARTIALLY_RESOLVED' | 'CLOSED' | 'EXPIRED' | 'AMBIGUOUS';

export interface SignalEvaluationSnapshot {
  id?: string;
  signalId: string;
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
