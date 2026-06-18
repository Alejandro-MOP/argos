import type { SignalType } from './Signal';

export interface SignalCandidate {
  ticker: string;
  timeframe: string;
  score: number;
  signalType: SignalType;
  createdAt: Date;
}
