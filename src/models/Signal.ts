export type SignalType = 'LONG' | 'SHORT';

export interface Signal {
  ticker: string;
  timeframe: string;
  entry: number;
  stop: number;
  target: number;
  score: number;
  signalType: SignalType;
  createdAt: Date;
  signalCandleTimestamp?: Date;
  strategyVersion?: string;
}
