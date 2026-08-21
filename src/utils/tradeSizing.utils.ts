import type { Signal } from '../models/Signal';

export interface TradeSizing {
  capital: number;
  estimatedLoss: number;
  estimatedProfit: number;
}

export const calculateTradeSizing = (signal: Signal, capital: number): TradeSizing | undefined => {
  if (!Number.isFinite(capital) || capital <= 0 || signal.entry <= 0) {
    return undefined;
  }

  const riskPerUnit = Math.abs(signal.entry - signal.stop);
  const rewardPerUnit = Math.abs(signal.target - signal.entry);

  if (riskPerUnit <= 0 || rewardPerUnit <= 0) {
    return undefined;
  }

  const quantity = capital / signal.entry;
  const estimatedLoss = riskPerUnit * quantity;
  const estimatedProfit = rewardPerUnit * quantity;

  return {
    capital: roundMoney(capital),
    estimatedLoss: roundMoney(estimatedLoss),
    estimatedProfit: roundMoney(estimatedProfit),
  };
};

const roundMoney = (value: number): number => round(value, 2);
const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
