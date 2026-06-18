import type { Signal } from '../models/Signal';

export interface TradeSimulation {
  ticker: string;
  timeframe: string;
  entryAt: Date;
  exitAt?: Date;
  entry: number;
  stop: number;
  target: number;
  exit?: number;
  profitLoss?: number;
}

export interface BacktestResult {
  strategyName: string;
  timeframe: string;
  trades: TradeSimulation[];
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  netProfitLoss: number;
}

export class BacktestEngine {
  public async run(signals: Signal[]): Promise<BacktestResult> {
    void signals;

    throw new Error('BacktestEngine is prepared for future historical simulation.');
  }
}
