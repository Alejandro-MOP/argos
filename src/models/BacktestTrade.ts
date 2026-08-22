export type BacktestOutcome = 'WIN' | 'LOSS' | 'EXPIRED' | 'AMBIGUOUS';

export interface BacktestLevel {
  percent: number;
  price: number;
}

export interface BacktestTrade {
  ticker: string;
  timeframe: string;
  signalAt: Date;
  score: number;
  trendScore: number;
  volumeScore: number;
  momentumScore: number;
  structureScore: number;
  entry: number;
  stopLoss: BacktestLevel;
  takeProfit1: BacktestLevel;
  takeProfit2: BacktestLevel;
  outcomeTp1: BacktestOutcome;
  outcomeTp2: BacktestOutcome;
  exitAtTp1?: Date;
  exitAtTp2?: Date;
  candlesUntilTp1?: number;
  candlesUntilTp2?: number;
  maxFavorableExcursionPercent: number;
  maxAdverseExcursionPercent: number;
  expiresAt: Date;
}
